using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.WebSockets;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Newtonsoft.Json.Linq;

namespace LandsurvConnector
{
    /// <summary>
    /// CivilAgent (partial) — Live Sync. Keeps the CAD drawing and the LandSurv.ai
    /// session continuously in sync while enabled, reusing the same snapshot → diff
    /// → apply pipeline the manual Sync wizard uses.
    ///
    /// Safety model (chosen with the user):
    ///  - Auto-applies ONLY safe, non-destructive changes: additions (present on one
    ///    side only) and unambiguous directional updates (exactly one side moved from
    ///    the baseline). See <see cref="Sync.SyncEngine.BuildSafeAutoPlan"/>.
    ///  - True conflicts (both sides moved) and ambiguous changes (no baseline to
    ///    attribute the change) are NEVER auto-applied — they escalate to the manual
    ///    Sync wizard, once per distinct unsafe set, and auto-apply pauses until the
    ///    user resolves them (which refreshes the baseline).
    ///  - Deletions are never emitted automatically; they only ever come from
    ///    explicit wizard choices (which back up the drawing first).
    ///
    /// Threading: the debounce timer lives on the chat form's (main) thread and only
    /// sends a lightweight state request. All CAD work happens in
    /// <see cref="OnLiveStateResponse"/>, which runs on the main AutoCAD thread via
    /// the same ThreadMarshaler path as every other server message.
    /// </summary>
    public partial class CivilAgent
    {
        // ── Live-sync state ──────────────────────────────────────────────────
        private static bool _liveSyncEnabled;
        private static System.Windows.Forms.Timer _liveTimer;
        private static volatile bool _cadDirty;
        private static DateTime _lastCadChangeUtc = DateTime.MinValue;
        private static bool _liveApplyInProgress;
        private static bool _suppressCadEvents;      // set during our own applies
        private static DateTime _lastLivePollUtc = DateTime.MinValue;
        private static bool _liveStateOutstanding;
        private static DateTime _liveStateRequestedUtc = DateTime.MinValue;
        private static string _lastUnsafeSignature;
        private static string _lastLsaiSessionIdentity;

        // Convergence guard: work that keeps coming back unchanged is abandoned
        // instead of being re-applied forever (e.g. records the other side refuses).
        private static string _lastLivePlanSignature;
        private static int _lastLivePlanRepeat;
        private static readonly HashSet<string> _stuckKeys =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private const int MaxLivePlanRetries = 3;

        // Live-apply completion tracking (LSAI-side is async via the relay).
        private static System.Threading.CancellationTokenSource _liveApplyCts;
        private static string _pendingLiveLsaiApplyId;
        private static string _liveApplySummary;

        // CAD event hooks (rebindable across active-document changes).
        private static Database _hookedDb;
        private static bool _docEventsHooked;

        // Tunables.
        private const int LiveTimerIntervalMs = 1500;   // how often we check
        private const double LivePollSeconds = 4.0;     // max staleness before a poll
        private const double LiveStateTimeoutSeconds = 15.0;
        private const double CadSettleSeconds = 0.7;    // quiet period after CAD edits

        /// <summary>Enable/disable the live-sync loop. Call on the main thread.</summary>
        private static void SetLiveSyncEnabled(bool on)
        {
            if (on == _liveSyncEnabled)
            {
                if (on)
                {
                    // The single Sync button is also a manual refresh. Do not let
                    // the already-enabled state make the click appear to do nothing.
                    _cadDirty = true;
                    _lastLivePollUtc = DateTime.MinValue;
                }
                _chatForm?.SetLiveSyncState(on);
                return;
            }

            if (on)
            {
                if (_webSocket == null || _webSocket.State != WebSocketState.Open)
                {
                    _chatForm?.AddMessage("System", "Cannot enable Live sync — not connected to LandSurv.ai.");
                    _chatForm?.SetLiveSyncState(false);
                    return;
                }
 
                _liveSyncEnabled = true;
                _cadDirty = true;                 // force an initial reconcile
                _lastLivePollUtc = DateTime.MinValue;
                _lastUnsafeSignature = null;
                _lastLsaiSessionIdentity = null;
                ResetLiveConvergenceState();
                HookCadEvents();

                if (_liveTimer == null)
                {
                    _liveTimer = new System.Windows.Forms.Timer { Interval = LiveTimerIntervalMs };
                    _liveTimer.Tick += LiveTimer_Tick;
                }
                _liveTimer.Start();

                _chatForm?.SetLiveSyncState(true);
                SendWebSocketMessage(new JObject
                {
                    ["type"] = "sync_mode",
                    ["enabled"] = true,
                    ["timestamp"] = DateTime.UtcNow.ToString("O"),
                }.ToString());
                _chatForm?.AddMessage("System", "🔄 Sync is live — safe changes (adds/updates) apply automatically both ways. Conflicts and deletions still ask first.");
            }
            else
            {
                _liveSyncEnabled = false;
                _liveTimer?.Stop();
                UnhookCadEvents();
                _liveStateOutstanding = false;
                _chatForm?.SetLiveSyncState(false);
                SendWebSocketMessage(new JObject
                {
                    ["type"] = "sync_mode",
                    ["enabled"] = false,
                    ["timestamp"] = DateTime.UtcNow.ToString("O"),
                }.ToString());
                _chatForm?.AddMessage("System", "Live sync OFF.");
            }
        }

        // ── CAD change detection ─────────────────────────────────────────────
        private static void HookCadEvents()
        {
            try
            {
                var docs = Application.DocumentManager;
                if (docs == null) return;
                docs.DocumentActivated -= LiveDocumentActivated;
                docs.DocumentActivated += LiveDocumentActivated;

                var doc = docs.MdiActiveDocument;
                BindDatabaseEvents(doc?.Database);
            }
            catch (System.Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"HookCadEvents failed: {ex.Message}");
            }
        }

        private static void UnhookCadEvents()
        {
            try
            {
                var docs = Application.DocumentManager;
                if (docs != null) docs.DocumentActivated -= LiveDocumentActivated;
                BindDatabaseEvents(null);
            }
            catch (System.Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"UnhookCadEvents failed: {ex.Message}");
            }
        }

        private static void BindDatabaseEvents(Database db)
        {
            if (_docEventsHooked && _hookedDb != null)
            {
                try
                {
                    _hookedDb.ObjectAppended -= LiveObjectChanged;
                    _hookedDb.ObjectErased -= LiveObjectErased;
                    _hookedDb.ObjectModified -= LiveObjectChanged;
                }
                catch { /* db may be disposed */ }
            }
            _hookedDb = db;
            _docEventsHooked = false;

            if (db != null)
            {
                try
                {
                    db.ObjectAppended += LiveObjectChanged;
                    db.ObjectErased += LiveObjectErased;
                    db.ObjectModified += LiveObjectChanged;
                    _docEventsHooked = true;
                }
                catch (System.Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"BindDatabaseEvents failed: {ex.Message}");
                }
            }
        }

        private static void LiveDocumentActivated(object sender, DocumentCollectionEventArgs e)
        {
            if (!_liveSyncEnabled) return;
            BindDatabaseEvents(e?.Document?.Database);
            _cadDirty = true;
        }

        private static void LiveObjectChanged(object sender, ObjectEventArgs e)
        {
            if (_suppressCadEvents) return;
            _cadDirty = true;
            _lastCadChangeUtc = DateTime.UtcNow;
        }

        private static void LiveObjectErased(object sender, ObjectErasedEventArgs e)
        {
            if (_suppressCadEvents) return;
            _cadDirty = true;
            _lastCadChangeUtc = DateTime.UtcNow;
        }

        // ── Debounced poll ───────────────────────────────────────────────────
        private static void LiveTimer_Tick(object sender, EventArgs e)
        {
            try
            {
                if (!_liveSyncEnabled) return;
                if (_webSocket == null || _webSocket.State != WebSocketState.Open) return;
                if (_liveApplyInProgress) return;
                // Don't fight a manual sync — pause while the wizard is up.
                if (_syncWizard != null && !_syncWizard.IsDisposed) return;

                // Clear a stale outstanding request so a dropped reply can't wedge us.
                if (_liveStateOutstanding &&
                    (DateTime.UtcNow - _liveStateRequestedUtc).TotalSeconds > LiveStateTimeoutSeconds)
                {
                    _liveStateOutstanding = false;
                }
                if (_liveStateOutstanding) return;

                // A STRETCH or grip edit across many entities raises one event per
                // entity. Wait for a brief quiet period so the whole edit reconciles
                // as a single sync instead of one per entity.
                bool cadSettled = _cadDirty
                    && (DateTime.UtcNow - _lastCadChangeUtc).TotalSeconds >= CadSettleSeconds;
                bool pollDue = (DateTime.UtcNow - _lastLivePollUtc).TotalSeconds >= LivePollSeconds;
                if (!cadSettled && !pollDue) return;

                if (cadSettled) _cadDirty = false;
                _lastLivePollUtc = DateTime.UtcNow;
                RequestLiveState();
            }
            catch (System.Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"LiveTimer_Tick failed: {ex.Message}");
            }
        }

        private static void RequestLiveState()
        {
            _liveStateOutstanding = true;
            _liveStateRequestedUtc = DateTime.UtcNow;
            SendWebSocketMessage(new JObject
            {
                ["type"] = "request_state",
                ["requestId"] = $"live-state-{DateTime.Now.Ticks}",
                ["timestamp"] = DateTime.UtcNow.ToString("O"),
            }.ToString());
        }

        // ── Reconcile (runs on main thread via HandleServerMessage) ──────────
        private static void OnLiveStateResponse(string requestId, JObject stateData)
        {
            _liveStateOutstanding = false;
            if (!_liveSyncEnabled) return;
 
            try
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc == null) return;
                if (_syncWizard != null && !_syncWizard.IsDisposed) return; // manual sync owns it

                string lsaiSessionIdentity = ReadLsaiSessionIdentity(stateData ?? new JObject());
                if (!string.IsNullOrEmpty(lsaiSessionIdentity))
                {
                    if (!string.IsNullOrEmpty(_lastLsaiSessionIdentity)
                        && !string.Equals(_lastLsaiSessionIdentity, lsaiSessionIdentity, StringComparison.Ordinal))
                    {
                        _chatForm?.AddMessage("System",
                            "⚠ LandSurv.ai session changed. Live sync paused — a different project/session is now active. Open the Sync window and choose which side should push.");
                        _chatForm?.SetLiveSyncState(false);
                        _liveSyncEnabled = false;
                        _lastLsaiSessionIdentity = lsaiSessionIdentity;
                        return;
                    }
                    _lastLsaiSessionIdentity = lsaiSessionIdentity;
                }
 
                var lsai = Sync.WebappStateMapper.Map(stateData ?? new JObject());
                var cad = Sync.CadSnapshot.Capture(doc, null);
                var baseline = LoadSyncBaseline(doc);

                var diffs = new List<Sync.CategoryDiffResult>
                {
                    Sync.SyncEngine.DiffPoints(cad.Points, lsai.Points, baseline?.Points),
                    Sync.SyncEngine.DiffLayers(cad.Layers, lsai.Layers, baseline?.Layers),
                    Sync.SyncEngine.DiffLinework(cad.Linework, lsai.Linework, baseline?.Linework),
                    Sync.SyncEngine.DiffAnnotations(cad.Annotations, lsai.Annotations, baseline?.Annotations),
                    Sync.SyncEngine.DiffSymbols(cad.Symbols, lsai.Symbols, baseline?.Symbols),
                };

                int unsafeCount = diffs.Sum(Sync.SyncEngine.UnsafeCount);

                // Bulk-deletion guard: a single item removed on one side propagates
                // automatically (that's the point — a web-app undo should clear CAD),
                // but a LARGE removal in any one category is held back so nobody
                // wipes a whole layer by accident.
                var bulkDeleteCategories = new HashSet<string>(
                    diffs.Where(d => Sync.SyncEngine.PendingDeleteCount(d) > Sync.SyncEngine.BulkDeleteThreshold)
                         .Select(d => d.Category),
                    StringComparer.OrdinalIgnoreCase);

                // Live sync NEVER opens the wizard by itself. Doing so produced a
                // reopen loop whenever a category could not converge: the wizard
                // applied, the same difference came straight back, and it popped up
                // again. The dialog is now strictly the initial/manual Sync surface;
                // live mode simply applies what is safe and reports what it skipped.
                if (unsafeCount > 0 || bulkDeleteCategories.Count > 0)
                {
                    string sig = BuildUnsafeSignature(diffs)
                        + "|bulk:" + string.Join(",", bulkDeleteCategories.OrderBy(c => c, StringComparer.Ordinal));
                    if (sig != _lastUnsafeSignature)
                    {
                        _lastUnsafeSignature = sig;
                        var reasons = new List<string>();
                        if (unsafeCount > 0) reasons.Add($"{unsafeCount} conflicting change(s)");
                        if (bulkDeleteCategories.Count > 0)
                            reasons.Add($"a large deletion in {string.Join(", ", bulkDeleteCategories)}");
                        _chatForm?.AddMessage("System",
                            $"⚠ Live sync is still running. Held back: {string.Join(" and ", reasons)}. Press Sync when you want to review them.");
                    }
                }
                else
                {
                    _lastUnsafeSignature = null;
                }

                // ── Intent journal (tombstones) ─────────────────────────────
                // Prevents deletions from being backfed: a tombstoned key is never
                // recreated — it's deleted from whichever side still has it until
                // both are clean, then the tombstone is cleared.
                var journal = LoadSyncJournal(doc);
                PruneJournal(journal, diffs);

                var intents = new List<Sync.SyncIntentOp>();
                var categories = BuildLivePlan(diffs, journal, intents, bulkDeleteCategories);

                if (categories.Count == 0)
                {
                    // Nothing to apply, but the journal may have been pruned.
                    SaveSyncJournal(doc, journal);
                    return;
                }

                // Convergence guard: identical work coming back cycle after cycle
                // means the other side is not accepting it. Give up on those keys
                // rather than re-applying the same plan forever.
                string planSig = BuildPlanSignature(categories);
                if (string.Equals(planSig, _lastLivePlanSignature, StringComparison.Ordinal))
                {
                    _lastLivePlanRepeat++;
                    if (_lastLivePlanRepeat > MaxLivePlanRetries)
                    {
                        int stuck = 0;
                        foreach (var cat in categories)
                            foreach (var en in cat.Entries)
                                if (en.Action != "skip" && _stuckKeys.Add(cat.Category + "\u0000" + en.Key))
                                    stuck++;

                        _lastLivePlanSignature = null;
                        _lastLivePlanRepeat = 0;
                        SaveSyncJournal(doc, journal);
                        if (stuck > 0)
                        {
                            _chatForm?.AddMessage("System",
                                $"⚠ Live sync stopped retrying {stuck} item(s) that would not stick after {MaxLivePlanRetries} attempts. Press Sync to review them.");
                        }
                        return;
                    }
                }
                else
                {
                    _lastLivePlanSignature = planSig;
                    _lastLivePlanRepeat = 1;
                }

                var plan = new Sync.SyncApplyPlan
                {
                    PlanId = $"live-{DateTime.Now.Ticks}",
                    Categories = categories,
                };
                SaveSyncJournal(doc, journal);
                ExecuteLiveApply(doc, plan, lsai, intents);
            }
            catch (System.Exception ex)
            {
                _chatForm?.AddMessage("System", $"Live sync error: {ex.Message}");
            }
        }

        private static void OnLiveStateError(string requestId, string error)
        {
            _liveStateOutstanding = false;
            // Stay quiet on transient errors; a persistent one will surface on manual Sync.
            System.Diagnostics.Debug.WriteLine($"Live state error: {error}");
        }

        // ── Headless safe apply ──────────────────────────────────────────────
        private static void ExecuteLiveApply(Document doc, Sync.SyncApplyPlan plan, Sync.SyncSnapshot lsai,
            List<Sync.SyncIntentOp> intents)
        {
            _liveApplyInProgress = true;
            _suppressCadEvents = true;
            _liveApplyCts = new System.Threading.CancellationTokenSource();
            string syncId = plan.PlanId;

            try
            {
                // Take the relay mutex (same guard the wizard/webapp use).
                SendWebSocketMessage(new JObject
                {
                    ["type"] = "sync_begin",
                    ["syncId"] = syncId,
                    ["timestamp"] = DateTime.UtcNow.ToString("O"),
                }.ToString());

                // Broadcast explicit intent (esp. deletions) alongside the apply so
                // the LSAI side receives the "user deleted X" fact rather than having
                // to infer it — this is what stops a delete from being pushed back.
                if (intents != null && intents.Count > 0)
                {
                    SendWebSocketMessage(new JObject
                    {
                        ["type"] = "sync_intent",
                        ["syncId"] = syncId,
                        ["ops"] = JArray.FromObject(intents),
                        ["timestamp"] = DateTime.UtcNow.ToString("O"),
                    }.ToString());
                }

                var progress = new Progress<Sync.SyncProgressInfo>(info =>
                {
                    SendWebSocketMessage(new JObject
                    {
                        ["type"] = "sync_progress",
                        ["syncId"] = syncId,
                        ["phase"] = info.Phase,
                        ["current"] = info.Current,
                        ["total"] = info.Total,
                        ["message"] = info.Message,
                    }.ToString());
                });

                var outcome = Sync.SyncApplier.Apply(
                    doc, plan, lsai, progress, _liveApplyCts.Token, null);

                // Refresh baseline from post-apply CAD truth + LSAI winners.
                var postCad = Sync.CadSnapshot.Capture(doc, null);
                SaveSyncBaseline(doc, BuildPostSyncBaseline(postCad, lsai, plan));

                var (toCad, toLsai, deleted) = CountPlanDirections(plan);
                _liveApplySummary = FormatLiveSummary(toCad, toLsai, deleted);

                // LSAI-side actions are applied by the webapp via the relay.
                var lsaiCategories = plan.Categories
                    .Select(c => new Sync.CategoryPlan
                    {
                        Category = c.Category,
                        Direction = c.Direction,
                        Entries = c.Entries.Where(en => en.Action.EndsWith("-lsai")).ToList(),
                    })
                    .Where(c => c.Entries.Count > 0)
                    .ToList();

                if (lsaiCategories.Count > 0)
                {
                    _pendingLiveLsaiApplyId = $"live-lsai-{DateTime.Now.Ticks}";
                    SendWebSocketMessage(new JObject
                    {
                        ["type"] = "sync_lsai_apply",
                        ["requestId"] = _pendingLiveLsaiApplyId,
                        ["plan"] = new JObject
                        {
                            ["planId"] = plan.PlanId,
                            ["categories"] = JArray.FromObject(lsaiCategories),
                        },
                        ["cadSnapshot"] = JObject.FromObject(postCad),
                        ["timestamp"] = DateTime.UtcNow.ToString("O"),
                    }.ToString());
                    // Completion arrives via OnLiveLsaiApplyResult.
                    return;
                }

                FinalizeLiveApply(_liveApplySummary);
            }
            catch (System.Exception ex)
            {
                _chatForm?.AddMessage("System", $"Live sync apply failed: {ex.Message}");
                FinalizeLiveApply(null);
            }
        }

        private static void OnLiveLsaiApplyResult(string requestId, bool success, string summary)
        {
            if (requestId != _pendingLiveLsaiApplyId) return;
            _pendingLiveLsaiApplyId = null;
            string msg = _liveApplySummary;
            if (!success && !string.IsNullOrEmpty(summary))
                msg = $"⚠ Live sync: LandSurv.ai side reported: {summary}";
            FinalizeLiveApply(msg);
        }

        private static void FinalizeLiveApply(string summary)
        {
            SendWebSocketMessage(new JObject
            {
                ["type"] = "sync_end",
                ["timestamp"] = DateTime.UtcNow.ToString("O"),
            }.ToString());

            _liveApplyInProgress = false;
            _suppressCadEvents = false;
            _cadDirty = false;                 // discard self-generated change flags
            _lastLivePollUtc = DateTime.UtcNow; // refresh baseline is fresh; wait a beat
            _pendingLiveLsaiApplyId = null;

            if (!string.IsNullOrEmpty(summary))
                _chatForm?.AddMessage("System", summary);
        }

        // ── Helpers ──────────────────────────────────────────────────────────
        private static (int toCad, int toLsai, int deleted) CountPlanDirections(Sync.SyncApplyPlan plan)
        {
            int toCad = 0, toLsai = 0, deleted = 0;
            foreach (var cat in plan.Categories)
            {
                foreach (var en in cat.Entries)
                {
                    if (en.Action == "skip") continue;
                    if (en.Action.StartsWith("delete-")) deleted++;
                    else if (en.Action.EndsWith("-cad")) toCad++;
                    else if (en.Action.EndsWith("-lsai")) toLsai++;
                }
            }
            return (toCad, toLsai, deleted);
        }

        private static string ReadLsaiSessionIdentity(JObject stateData)
        {
            if (stateData == null) return string.Empty;

            var identity = stateData["sessionIdentity"] as JObject;
            if (identity == null) identity = stateData;

            var values = new[]
            {
                identity["browserSessionId"]?.ToString(),
                identity["sessionId"]?.ToString(),
                identity["projectKey"]?.ToString(),
                identity["projectName"]?.ToString(),
                identity["parcelNumber"]?.ToString(),
            };

            return string.Join("|", values.Where(v => !string.IsNullOrWhiteSpace(v)));
        }

        private static string FormatLiveSummary(int toCad, int toLsai, int deleted)
        {
            if (toCad == 0 && toLsai == 0 && deleted == 0) return null;
            var parts = new List<string>();
            if (toCad > 0) parts.Add($"{toCad} → CAD");
            if (toLsai > 0) parts.Add($"{toLsai} → LandSurv.ai");
            if (deleted > 0) parts.Add($"{deleted} removed");
            return "🔄 Live sync: " + string.Join(", ", parts) + ".";
        }

        private static string BuildUnsafeSignature(List<Sync.CategoryDiffResult> diffs)
        {
            var keys = new List<string>();
            foreach (var d in diffs)
            {
                foreach (var en in d.Entries)
                {
                    bool unsafeEntry = en.State == Sync.SyncItemState.Conflict
                        || (en.State == Sync.SyncItemState.Changed && string.IsNullOrEmpty(en.ChangedSide));
                    if (unsafeEntry) keys.Add($"{d.Category}:{en.Key}:{en.State}");
                }
            }
            keys.Sort(StringComparer.Ordinal);
            return string.Join("|", keys);
        }

        // ── Intent journal (tombstones) ──────────────────────────────────────
        private const double TombstoneTtlDays = 7.0;

        private static string JournalPath(Document doc)
        {
            string dir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "LandsurvConnector", "sync-journals");
            System.IO.Directory.CreateDirectory(dir);
            string name = doc.Name ?? "unknown";
            foreach (char c in System.IO.Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            return System.IO.Path.Combine(dir, name + ".journal.json");
        }

        private static Sync.SyncJournal LoadSyncJournal(Document doc)
        {
            try
            {
                string path = JournalPath(doc);
                if (!System.IO.File.Exists(path)) return new Sync.SyncJournal();
                return Newtonsoft.Json.JsonConvert.DeserializeObject<Sync.SyncJournal>(
                    System.IO.File.ReadAllText(path)) ?? new Sync.SyncJournal();
            }
            catch { return new Sync.SyncJournal(); }
        }

        private static void SaveSyncJournal(Document doc, Sync.SyncJournal journal)
        {
            try
            {
                System.IO.File.WriteAllText(JournalPath(doc),
                    Newtonsoft.Json.JsonConvert.SerializeObject(journal ?? new Sync.SyncJournal()));
            }
            catch (System.Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Journal save failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Drop tombstones that are no longer needed: the key is gone from BOTH
        /// sides (absent from every diff → both clean), or the tombstone is older
        /// than the TTL (safety valve so a genuine later re-add isn't blocked forever).
        /// </summary>
        private static void PruneJournal(Sync.SyncJournal journal, List<Sync.CategoryDiffResult> diffs)
        {
            if (journal.Tombstones.Count == 0) return;

            // Keys still present on at least one side, per category.
            var present = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var d in diffs)
                foreach (var en in d.Entries)
                    present.Add(d.Category + "\u0000" + en.Key);

            DateTime now = DateTime.UtcNow;
            journal.Tombstones.RemoveAll(t =>
            {
                bool stillPresent = present.Contains(t.Category + "\u0000" + t.Key);
                if (!stillPresent) return true; // gone from both sides → done
                if (DateTime.TryParse(t.DeletedAt, null,
                        System.Globalization.DateTimeStyles.RoundtripKind, out var when)
                    && (now - when).TotalDays > TombstoneTtlDays)
                    return true; // expired
                return false;
            });
        }

        private static bool HasTombstone(Sync.SyncJournal journal, string category, string key)
        {
            foreach (var t in journal.Tombstones)
                if (string.Equals(t.Category, category, StringComparison.Ordinal)
                    && string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase))
                    return true;
            return false;
        }

        private static void AddTombstone(Sync.SyncJournal journal, string category, string key, string origin)
        {
            if (HasTombstone(journal, category, key)) return;
            journal.Tombstones.Add(new Sync.SyncTombstone
            {
                Category = category,
                Key = key,
                Origin = origin,
                DeletedAt = DateTime.UtcNow.ToString("O"),
            });
        }

        /// <summary>
        /// Build the live apply plan from the safe auto-plan, then make it tombstone
        /// aware so deletions win over stale re-adds:
        ///  - A create-* for a tombstoned key means the item resurfaced from stale
        ///    state on one side → rewrite to delete it from that side instead.
        ///  - A newly-detected delete-* records a fresh tombstone + an intent op.
        /// New tombstones are added to <paramref name="journal"/>; delete intents are
        /// collected in <paramref name="intents"/>.
        /// </summary>
        private static List<Sync.CategoryPlan> BuildLivePlan(
            List<Sync.CategoryDiffResult> diffs, Sync.SyncJournal journal, List<Sync.SyncIntentOp> intents,
            HashSet<string> heldDeleteCategories)
        {
            var result = new List<Sync.CategoryPlan>();

            foreach (var diff in diffs)
            {
                var basePlan = Sync.SyncEngine.BuildSafeAutoPlan(diff);
                bool holdDeletes = heldDeleteCategories != null
                    && heldDeleteCategories.Contains(diff.Category);

                // basePlan.Entries is 1:1 with diff.Entries (same order).
                for (int i = 0; i < basePlan.Entries.Count && i < diff.Entries.Count; i++)
                {
                    var pe = basePlan.Entries[i];
                    var de = diff.Entries[i];

                    // Abandoned earlier because it never converged — leave it alone.
                    if (_stuckKeys.Contains(diff.Category + "\u0000" + de.Key))
                    {
                        pe.Action = "skip";
                        pe.Explicit = false;
                        continue;
                    }

                    bool tomb = HasTombstone(journal, diff.Category, de.Key);

                    if (tomb && pe.Action.StartsWith("create-"))
                    {
                        // The item is tombstoned but reappeared on one side (stale
                        // state). Delete it from that side instead of recreating it.
                        if (de.State == Sync.SyncItemState.CadOnly)
                        { pe.Action = "delete-cad"; pe.Explicit = true; }
                        else if (de.State == Sync.SyncItemState.LsaiOnly)
                        { pe.Action = "delete-lsai"; pe.Explicit = true; }
                    }
                    else if (!tomb && pe.Action.StartsWith("delete-"))
                    {
                        if (holdDeletes)
                        {
                            // Bulk removal in this category — never auto-wipe it.
                            pe.Action = "skip";
                            pe.Explicit = false;
                            continue;
                        }

                        // First time we've seen this deletion — record intent so it
                        // can't be backfed later, and broadcast it over the wire.
                        string origin = pe.Action == "delete-cad" ? "lsai" : "cad";
                        AddTombstone(journal, diff.Category, de.Key, origin);
                        intents.Add(new Sync.SyncIntentOp
                        {
                            Op = "delete", Category = diff.Category, Key = de.Key, Origin = origin,
                        });
                    }
                }

                if (basePlan.Entries.Any(en => en.Action != "skip"))
                    result.Add(basePlan);
            }

            return result;
        }

        /// <summary>Clear the retry/abandon bookkeeping used by the convergence guard.</summary>
        internal static void ResetLiveConvergenceState()
        {
            _lastLivePlanSignature = null;
            _lastLivePlanRepeat = 0;
            _stuckKeys.Clear();
        }

        /// <summary>Stable identity of the actionable work in a live plan.</summary>
        private static string BuildPlanSignature(List<Sync.CategoryPlan> categories)
        {
            var keys = new List<string>();
            foreach (var cat in categories)
                foreach (var en in cat.Entries)
                    if (en.Action != "skip") keys.Add($"{cat.Category}:{en.Key}:{en.Action}");
            keys.Sort(StringComparer.Ordinal);
            return string.Join("|", keys);
        }
    }
}
