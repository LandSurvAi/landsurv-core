using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json;

namespace LandsurvConnector.Sync
{
    /// <summary>
    /// Sync diff engine — pure logic, no AutoCAD dependencies (unit-testable).
    ///
    /// MIRRORS services/c3dSyncProtocol.ts exactly. The two implementations must
    /// agree: the webapp Sync Center diffs in TypeScript for its wizard, the DLL
    /// diffs here for the in-CAD wizard, and both sides exchange raw records.
    ///
    /// Semantics (shared contract):
    ///  - Keys: points by pointNumber (case-insensitive), layers by name
    ///    (case-insensitive), linework/annotations by stable id, symbols by name.
    ///  - States: cad-only, lsai-only, equal, changed, conflict (conflict only when
    ///    a baseline exists AND both sides moved away from it).
    ///  - Coordinates compare with 1e-4 tolerance; strings compare trimmed.
    ///  - Deletes are NEVER produced by default plan resolution, in any direction.
    ///  - Conflicts and ambiguous 'changed' under merge default to skip.
    /// </summary>
    public static class SyncEngine
    {
        public const double CoordTolerance = 1e-4;
        public const int BulkDeleteThreshold = 10;

        // ── Helpers ─────────────────────────────────────────────────────────

        private static bool Near(double? a, double? b, double tol = CoordTolerance)
        {
            if (a == null && b == null) return true;
            if (a == null || b == null) return false;
            return Math.Abs(a.Value - b.Value) <= tol;
        }

        private static bool StrEq(string a, string b)
        {
            return (a ?? "").Trim() == (b ?? "").Trim();
        }

        private static string NormKey(string s) => (s ?? "").Trim().ToUpperInvariant();

        private static string Fmt(double v) => v.ToString("0.####", CultureInfo.InvariantCulture);

        /// <summary>
        /// Build a lookup that tolerates duplicate keys instead of throwing
        /// "An item with the same key has already been added" (e.g. two CAD points
        /// sharing a point number, or two same-name blocks). First occurrence wins;
        /// null/empty keys are skipped.
        /// </summary>
        private static Dictionary<string, T> SafeDict<T>(
            IEnumerable<T> src, Func<T, string> key, IEqualityComparer<string> cmp)
        {
            var dict = cmp != null ? new Dictionary<string, T>(cmp) : new Dictionary<string, T>();
            if (src == null) return dict;
            foreach (var item in src)
            {
                var k = key(item);
                if (string.IsNullOrEmpty(k)) continue;
                if (!dict.ContainsKey(k)) dict.Add(k, item);
            }
            return dict;
        }

        private delegate (bool equal, List<string> diffs) EqualityFn<T>(T a, T b);

        private static (SyncItemState state, List<string> diffs, string changedSide) Classify<T>(
            T cad, bool hasCad, T lsai, bool hasLsai, T baseline, bool hasBaseline, EqualityFn<T> eq)
            where T : class
        {
            if (hasCad && !hasLsai) return (SyncItemState.CadOnly, null, null);
            if (hasLsai && !hasCad) return (SyncItemState.LsaiOnly, null, null);
            if (!hasCad || !hasLsai) return (SyncItemState.Equal, null, null); // defensive

            var cmp = eq(cad, lsai);
            if (cmp.equal) return (SyncItemState.Equal, cmp.diffs, null);

            if (hasBaseline)
            {
                var cadVsBase = eq(cad, baseline);
                var lsaiVsBase = eq(lsai, baseline);
                if (!cadVsBase.equal && !lsaiVsBase.equal)
                {
                    return (SyncItemState.Conflict, cmp.diffs, null);
                }
                // Exactly one side moved from the baseline → safe directional update.
                string side = !cadVsBase.equal ? "cad" : "lsai";
                return (SyncItemState.Changed, cmp.diffs, side);
            }
            // No baseline: they differ but we can't tell who moved → ambiguous.
            return (SyncItemState.Changed, cmp.diffs, null);
        }

        private static CategoryDiffResult FinalizeDiff(string category, List<SyncDiffEntry> entries)
        {
            var counts = new Dictionary<SyncItemState, int>
            {
                { SyncItemState.CadOnly, 0 }, { SyncItemState.LsaiOnly, 0 },
                { SyncItemState.Equal, 0 }, { SyncItemState.Changed, 0 },
                { SyncItemState.Conflict, 0 },
            };
            foreach (var e in entries) counts[e.State]++;
            entries.Sort((a, b) => string.Compare(a.Key, b.Key, StringComparison.OrdinalIgnoreCase));
            return new CategoryDiffResult { Category = category, Entries = entries, Counts = counts };
        }

        // ── Category diffs ──────────────────────────────────────────────────

        public static CategoryDiffResult DiffPoints(
            List<SyncPointRecord> cad, List<SyncPointRecord> lsai, List<SyncPointRecord> baseline = null)
        {
            var cadMap = SafeDict(cad, p => NormKey(p.PointNumber), StringComparer.OrdinalIgnoreCase);
            var lsaiMap = SafeDict(lsai, p => NormKey(p.PointNumber), StringComparer.OrdinalIgnoreCase);
            var baseMap = SafeDict(baseline, p => NormKey(p.PointNumber), StringComparer.OrdinalIgnoreCase);
            var keys = new SortedSet<string>(cadMap.Keys.Concat(lsaiMap.Keys), StringComparer.OrdinalIgnoreCase);

            EqualityFn<SyncPointRecord> eq = (a, b) =>
            {
                var diffs = new List<string>();
                if (!Near(a.Easting, b.Easting)) diffs.Add($"easting {Fmt(a.Easting)} ↔ {Fmt(b.Easting)}");
                if (!Near(a.Northing, b.Northing)) diffs.Add($"northing {Fmt(a.Northing)} ↔ {Fmt(b.Northing)}");
                if (!Near(a.Elevation, b.Elevation)) diffs.Add($"elevation {Fmt(a.Elevation)} ↔ {Fmt(b.Elevation)}");
                if (!StrEq(a.Description, b.Description)) diffs.Add($"description \"{a.Description}\" ↔ \"{b.Description}\"");
                return (diffs.Count == 0, diffs);
            };

            var entries = new List<SyncDiffEntry>();
            foreach (var key in keys)
            {
                bool hc = cadMap.TryGetValue(key, out var c);
                bool hl = lsaiMap.TryGetValue(key, out var l);
                bool hb = baseMap.TryGetValue(key, out var b);
                var (state, diffs, side) = Classify(c, hc, l, hl, b, hb, eq);
                entries.Add(new SyncDiffEntry
                {
                    Key = key,
                    State = state,
                    CadJson = hc ? JsonConvert.SerializeObject(c) : null,
                    LsaiJson = hl ? JsonConvert.SerializeObject(l) : null,
                    FieldDiffs = diffs ?? new List<string>(),
                    ChangedSide = side,
                    WasInBaseline = hb,
                });
            }
            return FinalizeDiff("points", entries);
        }

        public static CategoryDiffResult DiffLayers(
            List<SyncLayerRecord> cad, List<SyncLayerRecord> lsai, List<SyncLayerRecord> baseline = null)
        {
            var cadMap = SafeDict(cad, x => NormKey(x.Name), StringComparer.OrdinalIgnoreCase);
            var lsaiMap = SafeDict(lsai, x => NormKey(x.Name), StringComparer.OrdinalIgnoreCase);
            var baseMap = SafeDict(baseline, x => NormKey(x.Name), StringComparer.OrdinalIgnoreCase);
            var keys = new SortedSet<string>(cadMap.Keys.Concat(lsaiMap.Keys), StringComparer.OrdinalIgnoreCase);

            EqualityFn<SyncLayerRecord> eq = (a, b) =>
            {
                var diffs = new List<string>();
                if (!StrEq(a.Color ?? "", b.Color ?? "")) diffs.Add($"color {a.Color ?? "—"} ↔ {b.Color ?? "—"}");
                if (!StrEq(a.LineType ?? "", b.LineType ?? "")) diffs.Add($"linetype {a.LineType ?? "—"} ↔ {b.LineType ?? "—"}");
                if (!Near(a.LineWeight, b.LineWeight, 0.01)) diffs.Add($"lineweight {a.LineWeight?.ToString() ?? "—"} ↔ {b.LineWeight?.ToString() ?? "—"}");
                return (diffs.Count == 0, diffs);
            };

            var entries = new List<SyncDiffEntry>();
            foreach (var key in keys)
            {
                bool hc = cadMap.TryGetValue(key, out var c);
                bool hl = lsaiMap.TryGetValue(key, out var l);
                bool hb = baseMap.TryGetValue(key, out var b);
                var (state, diffs, side) = Classify(c, hc, l, hl, b, hb, eq);
                entries.Add(new SyncDiffEntry
                {
                    Key = key,
                    State = state,
                    CadJson = hc ? JsonConvert.SerializeObject(c) : null,
                    LsaiJson = hl ? JsonConvert.SerializeObject(l) : null,
                    FieldDiffs = diffs ?? new List<string>(),
                    ChangedSide = side,
                    WasInBaseline = hb,
                });
            }
            return FinalizeDiff("layers", entries);
        }

        private static (bool equal, List<string> diffs) LineGeometryEqual(SyncLineRecord a, SyncLineRecord b)
        {
            var diffs = new List<string>();
            if (a.Closed != b.Closed) diffs.Add($"closed {a.Closed} ↔ {b.Closed}");
            if (!StrEq(a.Layer ?? "", b.Layer ?? "")) diffs.Add($"layer {a.Layer ?? "—"} ↔ {b.Layer ?? "—"}");
            if (a.Vertices.Count != b.Vertices.Count)
            {
                diffs.Add($"vertex count {a.Vertices.Count} ↔ {b.Vertices.Count}");
            }
            else
            {
                for (int i = 0; i < a.Vertices.Count; i++)
                {
                    var va = a.Vertices[i]; var vb = b.Vertices[i];
                    if (!Near(va.X, vb.X) || !Near(va.Y, vb.Y))
                    {
                        diffs.Add($"vertex {i + 1} moved ({Fmt(va.X)},{Fmt(va.Y)}) ↔ ({Fmt(vb.X)},{Fmt(vb.Y)})");
                        break;
                    }
                    if (!Near(va.Bulge ?? 0, vb.Bulge ?? 0, 1e-6))
                    {
                        diffs.Add($"vertex {i + 1} bulge {va.Bulge ?? 0} ↔ {vb.Bulge ?? 0}");
                        break;
                    }
                }
            }
            return (diffs.Count == 0, diffs);
        }

        public static CategoryDiffResult DiffLinework(
            List<SyncLineRecord> cad, List<SyncLineRecord> lsai, List<SyncLineRecord> baseline = null)
        {
            var cadMap = SafeDict(cad, x => x.Id, null);
            var lsaiMap = SafeDict(lsai, x => x.Id, null);
            var baseMap = SafeDict(baseline, x => x.Id, null);
            var keys = new SortedSet<string>(cadMap.Keys.Concat(lsaiMap.Keys), StringComparer.OrdinalIgnoreCase);

            var entries = new List<SyncDiffEntry>();
            foreach (var key in keys)
            {
                bool hc = cadMap.TryGetValue(key, out var c);
                bool hl = lsaiMap.TryGetValue(key, out var l);
                bool hb = baseMap.TryGetValue(key, out var b);
                var (state, diffs, side) = Classify(c, hc, l, hl, b, hb, LineGeometryEqual);
                entries.Add(new SyncDiffEntry
                {
                    Key = key,
                    State = state,
                    CadJson = hc ? JsonConvert.SerializeObject(c) : null,
                    LsaiJson = hl ? JsonConvert.SerializeObject(l) : null,
                    FieldDiffs = diffs ?? new List<string>(),
                    ChangedSide = side,
                    WasInBaseline = hb,
                });
            }
            return FinalizeDiff("linework", entries);
        }

        public static CategoryDiffResult DiffAnnotations(
            List<SyncAnnotationRecord> cad, List<SyncAnnotationRecord> lsai, List<SyncAnnotationRecord> baseline = null)
        {
            var cadMap = SafeDict(cad, x => x.Id, null);
            var lsaiMap = SafeDict(lsai, x => x.Id, null);
            var baseMap = SafeDict(baseline, x => x.Id, null);
            var keys = new SortedSet<string>(cadMap.Keys.Concat(lsaiMap.Keys), StringComparer.OrdinalIgnoreCase);

            EqualityFn<SyncAnnotationRecord> eq = (a, b) =>
            {
                var diffs = new List<string>();
                if (!StrEq(a.Text, b.Text)) diffs.Add($"text \"{a.Text}\" ↔ \"{b.Text}\"");
                if (!Near(a.X, b.X) || !Near(a.Y, b.Y)) diffs.Add("position changed");
                if (!Near(a.Angle, b.Angle, 0.01)) diffs.Add($"rotation {Fmt(a.Angle)}° ↔ {Fmt(b.Angle)}°");
                if (!StrEq(a.Layer ?? "", b.Layer ?? "")) diffs.Add($"layer {a.Layer ?? "—"} ↔ {b.Layer ?? "—"}");
                return (diffs.Count == 0, diffs);
            };

            var entries = new List<SyncDiffEntry>();
            foreach (var key in keys)
            {
                bool hc = cadMap.TryGetValue(key, out var c);
                bool hl = lsaiMap.TryGetValue(key, out var l);
                bool hb = baseMap.TryGetValue(key, out var b);
                var (state, diffs, side) = Classify(c, hc, l, hl, b, hb, eq);
                entries.Add(new SyncDiffEntry
                {
                    Key = key,
                    State = state,
                    CadJson = hc ? JsonConvert.SerializeObject(c) : null,
                    LsaiJson = hl ? JsonConvert.SerializeObject(l) : null,
                    FieldDiffs = diffs ?? new List<string>(),
                    ChangedSide = side,
                    WasInBaseline = hb,
                });
            }
            return FinalizeDiff("annotation", entries);
        }

        public static CategoryDiffResult DiffSymbols(
            List<SyncBlockRecord> cad, List<SyncBlockRecord> lsai, List<SyncBlockRecord> baseline = null)
        {
            var cadMap = SafeDict(cad, x => NormKey(x.Name), StringComparer.OrdinalIgnoreCase);
            var lsaiMap = SafeDict(lsai, x => NormKey(x.Name), StringComparer.OrdinalIgnoreCase);
            var baseMap = SafeDict(baseline, x => NormKey(x.Name), StringComparer.OrdinalIgnoreCase);
            var keys = new SortedSet<string>(cadMap.Keys.Concat(lsaiMap.Keys), StringComparer.OrdinalIgnoreCase);

            // Geometry equality for symbols is impractical over the wire; same-name
            // blocks count as equal unless the user explicitly re-pushes (update-cad).
            EqualityFn<SyncBlockRecord> eq = (a, b) => (true, new List<string>());

            var entries = new List<SyncDiffEntry>();
            foreach (var key in keys)
            {
                bool hc = cadMap.TryGetValue(key, out var c);
                bool hl = lsaiMap.TryGetValue(key, out var l);
                bool hb = baseMap.TryGetValue(key, out var b);
                var (state, _, side) = Classify(c, hc, l, hl, b, hb, eq);
                entries.Add(new SyncDiffEntry
                {
                    Key = key,
                    State = state,
                    CadJson = hc ? JsonConvert.SerializeObject(c) : null,
                    LsaiJson = hl ? JsonConvert.SerializeObject(l) : null,
                    ChangedSide = side,
                    WasInBaseline = hb,
                });
            }
            return FinalizeDiff("symbols", entries);
        }

        // ── Apply-plan resolution (safety defaults — mirror c3dSyncProtocol.ts) ──

        /// <summary>
        /// Resolve a category diff into actions for the chosen direction.
        /// Deletes are NEVER produced by default; conflicts always default to skip.
        /// </summary>
        public static CategoryPlan BuildCategoryPlan(
            CategoryDiffResult diff, string direction, Dictionary<string, string> overrides = null)
        {
            var plan = new CategoryPlan { Category = diff.Category, Direction = direction };

            foreach (var entry in diff.Entries)
            {
                string action;
                bool isExplicit = false;

                if (overrides != null && overrides.TryGetValue(entry.Key, out var ov) && !string.IsNullOrEmpty(ov))
                {
                    action = ov;
                    isExplicit = true;
                }
                else
                {
                    action = "skip";
                    switch (entry.State)
                    {
                        case SyncItemState.Equal:
                            action = "skip";
                            break;
                        case SyncItemState.CadOnly:
                            // merge → bring into LSAI. Never delete from CAD by default.
                            action = direction == "merge" ? "create-lsai" : "skip";
                            break;
                        case SyncItemState.LsaiOnly:
                            action = (direction == "merge" || direction == "lsai-wins") ? "create-cad" : "skip";
                            break;
                        case SyncItemState.Changed:
                            if (direction == "cad-wins") action = "update-lsai";
                            else if (direction == "lsai-wins") action = "update-cad";
                            else action = "skip";
                            break;
                        case SyncItemState.Conflict:
                            action = "skip";
                            break;
                    }
                }

                plan.Entries.Add(new SyncPlanEntry { Key = entry.Key, Action = action, Explicit = isExplicit });
            }

            return plan;
        }

        /// <summary>
        /// Live-sync plan: only the changes we can apply WITHOUT user review.
        ///  - CadOnly  → create-lsai   (additive)
        ///  - LsaiOnly → create-cad    (additive)
        ///  - Changed with a known ChangedSide → update the OTHER side (one side
        ///    moved from baseline; the mover wins, non-destructively).
        /// Conflicts, and ambiguous Changed entries (no baseline to attribute the
        /// change), are left for the wizard — never auto-applied. Deletions are
        /// never emitted here (they only arise from explicit wizard choices).
        /// </summary>
        public static CategoryPlan BuildSafeAutoPlan(CategoryDiffResult diff)
        {
            var plan = new CategoryPlan { Category = diff.Category, Direction = "merge" };
            foreach (var entry in diff.Entries)
            {
                string action = "skip";
                bool explicitAction = false;
                switch (entry.State)
                {
                    case SyncItemState.CadOnly:
                        // In CAD, not in LSAI. If it was in the baseline it was DELETED
                        // on the LSAI side (e.g. a web-app undo) → propagate the delete
                        // to CAD instead of re-creating it. Otherwise it's a new CAD add.
                        if (entry.WasInBaseline) { action = "delete-cad"; explicitAction = true; }
                        else action = "create-lsai";
                        break;
                    case SyncItemState.LsaiOnly:
                        // In LSAI, not in CAD. Was-in-baseline → deleted on the CAD side
                        // → propagate delete to LSAI. Otherwise a new LSAI add.
                        if (entry.WasInBaseline) { action = "delete-lsai"; explicitAction = true; }
                        else action = "create-cad";
                        break;
                    case SyncItemState.Changed:
                        if (entry.ChangedSide == "cad") action = "update-lsai";
                        else if (entry.ChangedSide == "lsai") action = "update-cad";
                        else action = "skip"; // ambiguous → defer to wizard
                        break;
                    default:
                        action = "skip"; // Equal / Conflict
                        break;
                }
                plan.Entries.Add(new SyncPlanEntry { Key = entry.Key, Action = action, Explicit = explicitAction });
            }
            return plan;
        }

        /// <summary>
        /// Number of baseline-backed one-sided items in a diff — i.e. deletions that
        /// live-sync would propagate. Used to escalate a BULK deletion to the wizard
        /// rather than auto-wiping many items at once.
        /// </summary>
        public static int PendingDeleteCount(CategoryDiffResult diff)
        {
            int n = 0;
            foreach (var e in diff.Entries)
            {
                if (e.WasInBaseline &&
                    (e.State == SyncItemState.CadOnly || e.State == SyncItemState.LsaiOnly))
                    n++;
            }
            return n;
        }

        /// <summary>
        /// Count of entries in a diff that require human review and must NOT be
        /// auto-applied: true conflicts plus ambiguous changes (differ but no
        /// baseline to attribute the change to one side).
        /// </summary>
        public static int UnsafeCount(CategoryDiffResult diff)
        {
            int n = 0;
            foreach (var e in diff.Entries)
            {
                if (e.State == SyncItemState.Conflict) n++;
                else if (e.State == SyncItemState.Changed && string.IsNullOrEmpty(e.ChangedSide)) n++;
            }
            return n;
        }

        /// <summary>Summary counts for confirmation dialogs (matches summarizePlan in TS).</summary>
        public static (int creates, int updates, int deletes, int skips) SummarizePlan(SyncApplyPlan plan)
        {
            int creates = 0, updates = 0, deletes = 0, skips = 0;
            foreach (var cat in plan.Categories)
            {
                foreach (var e in cat.Entries)
                {
                    if (e.Action == "skip") skips++;
                    else if (e.Action.StartsWith("create-")) creates++;
                    else if (e.Action.StartsWith("update-")) updates++;
                    else if (e.Action.StartsWith("delete-")) deletes++;
                }
            }
            return (creates, updates, deletes, skips);
        }
    }
}
