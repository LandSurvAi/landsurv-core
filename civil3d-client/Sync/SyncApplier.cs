using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using Newtonsoft.Json;

namespace LandsurvConnector.Sync
{
    /// <summary>
    /// Executes the CAD-side actions of a SyncApplyPlan against the active drawing.
    ///
    /// Safeguards (defense in depth — the plan builder already applies these, the
    /// applier re-enforces them so a malformed plan can never wipe data):
    ///  - delete-* actions are executed ONLY when the plan entry has explicit=true
    ///    (the user consciously chose it in the wizard / Sync Center).
    ///  - Before ANY mutation, a timestamped backup of the current CAD state of
    ///    every affected key (plus the full plan) is written to
    ///    %APPDATA%\LandsurvConnector\backups\.
    ///  - Only create-cad / update-cad / delete-cad are handled here; lsai-side
    ///    actions are the webapp's job (sync_lsai_apply round-trip).
    /// </summary>
    internal static class SyncApplier
    {
        public class ApplyOutcome
        {
            public List<SyncItemResult> Results { get; } = new List<SyncItemResult>();
            public string BackupPath { get; set; }
            public int Succeeded => Results.Count(r => r.Status == "ok");
            public int Failed => Results.Count(r => r.Status == "failed");
            public int Skipped => Results.Count(r => r.Status == "skipped");
        }

        public static ApplyOutcome Apply(
            Document doc,
            SyncApplyPlan plan,
            SyncSnapshot lsaiSnapshot,
            IProgress<SyncProgressInfo> progress,
            CancellationToken cancel,
            Action<string> log)
        {
            var outcome = new ApplyOutcome();
            if (doc == null || plan == null) return outcome;

            Database db = doc.Database;

            // Index LSAI source records per category for create/update lookups.
            var lsaiPoints = (lsaiSnapshot?.Points ?? new List<SyncPointRecord>())
                .GroupBy(p => p.PointNumber.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            var lsaiLayers = (lsaiSnapshot?.Layers ?? new List<SyncLayerRecord>())
                .GroupBy(l => l.Name.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            var lsaiLines = (lsaiSnapshot?.Linework ?? new List<SyncLineRecord>())
                .GroupBy(l => l.Id).ToDictionary(g => g.Key, g => g.First());
            var lsaiAnnotations = (lsaiSnapshot?.Annotations ?? new List<SyncAnnotationRecord>())
                .GroupBy(a => a.Id).ToDictionary(g => g.Key, g => g.First());
            var lsaiSymbols = (lsaiSnapshot?.Symbols ?? new List<SyncBlockRecord>())
                .GroupBy(s => s.Name.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            var cadActions = plan.Categories
                .SelectMany(c => c.Entries.Select(e => (category: c.Category, entry: e)))
                .Where(x => x.entry.Action.EndsWith("-cad"))
                .ToList();

            // ── Backup before ANY mutation ──────────────────────────────────
            try
            {
                outcome.BackupPath = WriteBackup(doc, plan, cadActions.Select(a => a.category).Distinct(), log);
            }
            catch (Exception ex)
            {
                log?.Invoke($"Backup failed (continuing with caution): {ex.Message}");
            }

            int total = cadActions.Count;
            int current = 0;

            using (doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                foreach (var (category, entry) in cadActions)
                {
                    if (cancel.IsCancellationRequested)
                    {
                        outcome.Results.Add(new SyncItemResult
                        {
                            Key = entry.Key, Action = entry.Action,
                            Status = "skipped", Error = "Canceled by user",
                        });
                        continue;
                    }

                    current++;
                    progress?.Report(new SyncProgressInfo
                    {
                        Phase = category, Current = current, Total = total,
                        Message = $"{entry.Action} {entry.Key}",
                    });

                    // Defense in depth: deletes require explicit user choice.
                    if (entry.Action.StartsWith("delete-") && !entry.Explicit)
                    {
                        outcome.Results.Add(new SyncItemResult
                        {
                            Key = entry.Key, Action = entry.Action, Status = "skipped",
                            Error = "Delete blocked: not explicitly confirmed by the user",
                        });
                        log?.Invoke($"Blocked non-explicit delete of {category} '{entry.Key}'");
                        continue;
                    }

                    try
                    {
                        string error = ExecuteCadAction(db, tr, category, entry,
                            lsaiPoints, lsaiLayers, lsaiLines, lsaiAnnotations, lsaiSymbols, log);

                        outcome.Results.Add(new SyncItemResult
                        {
                            Key = entry.Key, Action = entry.Action,
                            Status = error == null ? "ok" : "failed",
                            Error = error,
                        });
                    }
                    catch (Exception ex)
                    {
                        outcome.Results.Add(new SyncItemResult
                        {
                            Key = entry.Key, Action = entry.Action,
                            Status = "failed", Error = ex.Message,
                        });
                        log?.Invoke($"Sync action failed ({category} {entry.Action} {entry.Key}): {ex.Message}");
                    }
                }

                tr.Commit();
            }

            return outcome;
        }

        // ── Per-category execution ────────────────────────────────────────────

        private static string ExecuteCadAction(
            Database db, Transaction tr, string category, SyncPlanEntry entry,
            Dictionary<string, SyncPointRecord> lsaiPoints,
            Dictionary<string, SyncLayerRecord> lsaiLayers,
            Dictionary<string, SyncLineRecord> lsaiLines,
            Dictionary<string, SyncAnnotationRecord> lsaiAnnotations,
            Dictionary<string, SyncBlockRecord> lsaiSymbols,
            Action<string> log)
        {
            switch (category)
            {
                case "points":
                    return ExecutePointAction(db, tr, entry, lsaiPoints, log);
                case "layers":
                    return ExecuteLayerAction(db, tr, entry, lsaiLayers, log);
                case "linework":
                    return ExecuteLineworkAction(db, tr, entry, lsaiLines, log);
                case "annotation":
                    return ExecuteAnnotationAction(db, tr, entry, lsaiAnnotations, log);
                case "symbols":
                    return ExecuteSymbolAction(db, tr, entry, lsaiSymbols, log);
                default:
                    return $"Unknown category '{category}'";
            }
        }

        // ── Points ────────────────────────────────────────────────────────────

        private static string ExecutePointAction(
            Database db, Transaction tr, SyncPlanEntry entry,
            Dictionary<string, SyncPointRecord> lsaiPoints, Action<string> log)
        {
            switch (entry.Action)
            {
                case "create-cad":
                {
                    if (!lsaiPoints.TryGetValue(entry.Key, out var point))
                        return $"LSAI point '{entry.Key}' not found in snapshot";

                    if (CogoPointAdapter.CanUseCogoPoints)
                    {
                        var id = CogoPointAdapter.TryCreate(db, tr, point, log);
                        if (id != ObjectId.Null) return null;
                        log?.Invoke($"CogoPoint create failed for #{point.PointNumber}, using DBPoint fallback");
                    }
                    CreateDbPoint(db, tr, point, log);
                    return null;
                }

                case "update-cad":
                {
                    if (!lsaiPoints.TryGetValue(entry.Key, out var point))
                        return $"LSAI point '{entry.Key}' not found in snapshot";

                    // Prefer CogoPoint update; fall back to DBPoint scan.
                    var map = CogoPointAdapter.TryGetPointNumberMap(db, tr, log);
                    if (map != null && map.TryGetValue(entry.Key, out var cogoId))
                    {
                        return CogoPointAdapter.TryUpdate(tr, cogoId, point, log)
                            ? null
                            : $"CogoPoint update failed for #{entry.Key}";
                    }

                    var dbPoint = FindDbPointByNumber(db, tr, entry.Key);
                    if (dbPoint == null) return $"CAD point '{entry.Key}' not found";
                    dbPoint.UpgradeOpen();
                    dbPoint.Position = new Point3d(point.Easting, point.Northing, point.Elevation);
                    if (point.Description != null)
                        CadSnapshot.StampXData(db, tr, dbPoint, CadSnapshot.RegAppDesc, point.Description);
                    CadSnapshot.StampXData(db, tr, dbPoint, CadSnapshot.RegAppPointNumber, entry.Key);
                    if (!string.IsNullOrEmpty(point.Layer))
                    {
                        EnsureLayerExists(db, tr, point.Layer, log);
                        dbPoint.Layer = point.Layer;
                    }
                    return null;
                }

                case "delete-cad":
                {
                    var map = CogoPointAdapter.TryGetPointNumberMap(db, tr, log);
                    if (map != null && map.TryGetValue(entry.Key, out var cogoId))
                    {
                        return CogoPointAdapter.TryDelete(tr, cogoId, log)
                            ? null
                            : $"CogoPoint delete failed for #{entry.Key}";
                    }
                    var dbPoint = FindDbPointByNumber(db, tr, entry.Key);
                    if (dbPoint == null) return $"CAD point '{entry.Key}' not found";
                    dbPoint.UpgradeOpen();
                    dbPoint.Erase();
                    return null;
                }

                default:
                    return $"Unsupported point action '{entry.Action}'";
            }
        }

        /// <summary>Ensure a layer exists before assigning it (assignment of a missing
        /// layer name throws eKeyNotFound). Creates a plain layer when absent.</summary>
        private static void EnsureLayerExists(Database db, Transaction tr, string layerName, Action<string> log)
        {
            if (string.IsNullOrWhiteSpace(layerName)) return;
            try
            {
                var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                if (lt.Has(layerName)) return;
                lt.UpgradeOpen();
                var layer = new LayerTableRecord { Name = layerName };
                lt.Add(layer);
                tr.AddNewlyCreatedDBObject(layer, true);
            }
            catch (Exception ex)
            {
                log?.Invoke($"Could not create layer '{layerName}': {ex.Message}");
            }
        }

        private static void CreateDbPoint(Database db, Transaction tr, SyncPointRecord point, Action<string> log)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

            var dbPoint = new DBPoint(new Point3d(point.Easting, point.Northing, point.Elevation));
            if (!string.IsNullOrEmpty(point.Layer))
            {
                EnsureLayerExists(db, tr, point.Layer, log);
                dbPoint.Layer = point.Layer;
            }
            ms.AppendEntity(dbPoint);
            tr.AddNewlyCreatedDBObject(dbPoint, true);

            if (!string.IsNullOrEmpty(point.Description))
                CadSnapshot.StampXData(db, tr, dbPoint, CadSnapshot.RegAppDesc, point.Description);
            CadSnapshot.StampXData(db, tr, dbPoint, CadSnapshot.RegAppPointNumber, point.PointNumber);
        }

        /// <summary>Find a DBPoint by stamped LANDSURV_PNUM, else positional legacy number.</summary>
        private static DBPoint FindDbPointByNumber(Database db, Transaction tr, string pointNumber)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);

            DBPoint positionalCandidate = null;
            int positional = 1;
            bool isPositionalTarget = int.TryParse(pointNumber, out int positionalTarget);

            foreach (ObjectId objId in ms)
            {
                if (!(tr.GetObject(objId, OpenMode.ForRead) is DBPoint point)) continue;

                string stamped = CadSnapshot.ReadXDataString(point, CadSnapshot.RegAppPointNumber);
                if (!string.IsNullOrEmpty(stamped))
                {
                    if (string.Equals(stamped, pointNumber, StringComparison.OrdinalIgnoreCase)) return point;
                }
                else
                {
                    if (isPositionalTarget && positional == positionalTarget) positionalCandidate = point;
                    positional++;
                }
            }
            return positionalCandidate;
        }

        // ── Layers ────────────────────────────────────────────────────────────

        private static string ExecuteLayerAction(
            Database db, Transaction tr, SyncPlanEntry entry,
            Dictionary<string, SyncLayerRecord> lsaiLayers, Action<string> log)
        {
            switch (entry.Action)
            {
                case "create-cad":
                {
                    if (!lsaiLayers.TryGetValue(entry.Key, out var spec))
                        return $"LSAI layer '{entry.Key}' not found in snapshot";
                    UpsertLayer(db, tr, spec, log);
                    return null;
                }

                case "update-cad":
                {
                    if (!lsaiLayers.TryGetValue(entry.Key, out var spec))
                        return $"LSAI layer '{entry.Key}' not found in snapshot";
                    UpsertLayer(db, tr, spec, log);
                    return null;
                }

                case "delete-cad":
                {
                    // Layer deletion only succeeds when the layer is empty/unreferenced —
                    // AutoCAD enforces that; we surface the failure honestly.
                    var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                    if (!lt.Has(entry.Key)) return $"Layer '{entry.Key}' not found";
                    var layer = (LayerTableRecord)tr.GetObject(lt[entry.Key], OpenMode.ForWrite);
                    try
                    {
                        layer.Erase();
                        return null;
                    }
                    catch (Exception ex)
                    {
                        return $"Layer '{entry.Key}' could not be deleted (in use?): {ex.Message}";
                    }
                }

                default:
                    return $"Unsupported layer action '{entry.Action}'";
            }
        }

        private static void UpsertLayer(Database db, Transaction tr, SyncLayerRecord spec, Action<string> log)
        {
            var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForWrite);
            LayerTableRecord layer;
            if (lt.Has(spec.Name))
            {
                layer = (LayerTableRecord)tr.GetObject(lt[spec.Name], OpenMode.ForWrite);
            }
            else
            {
                layer = new LayerTableRecord { Name = spec.Name };
                lt.Add(layer);
                tr.AddNewlyCreatedDBObject(layer, true);
            }

            if (!string.IsNullOrEmpty(spec.Color))
            {
                var color = ParseColor(spec.Color);
                if (color != null) layer.Color = color;
            }

            if (!string.IsNullOrEmpty(spec.LineType))
            {
                var ltt = (LinetypeTable)tr.GetObject(db.LinetypeTableId, OpenMode.ForRead);
                if (ltt.Has(spec.LineType))
                {
                    layer.LinetypeObjectId = ltt[spec.LineType];
                }
                else
                {
                    // Try loading from the standard + LandSurv linetype files.
                    try
                    {
                        db.LoadLineTypeFile(spec.LineType, "landsurv.lin");
                    }
                    catch
                    {
                        try { db.LoadLineTypeFile(spec.LineType, "acad.lin"); }
                        catch { log?.Invoke($"Linetype '{spec.LineType}' unavailable for layer '{spec.Name}'"); }
                    }
                    if (ltt.Has(spec.LineType)) layer.LinetypeObjectId = ltt[spec.LineType];
                }
            }

            if (spec.LineWeight != null)
            {
                try { layer.LineWeight = (LineWeight)spec.LineWeight.Value; }
                catch { log?.Invoke($"Invalid lineweight {spec.LineWeight} for layer '{spec.Name}'"); }
            }
        }

        /// <summary>Parse "#RRGGBB" or an ACI number string into an AutoCAD color.</summary>
        internal static Autodesk.AutoCAD.Colors.Color ParseColor(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            value = value.Trim();
            try
            {
                if (value.StartsWith("#") && value.Length == 7)
                {
                    int r = Convert.ToInt32(value.Substring(1, 2), 16);
                    int g = Convert.ToInt32(value.Substring(3, 2), 16);
                    int b = Convert.ToInt32(value.Substring(5, 2), 16);
                    return Autodesk.AutoCAD.Colors.Color.FromRgb((byte)r, (byte)g, (byte)b);
                }
                if (value.StartsWith("aci:", StringComparison.OrdinalIgnoreCase))
                {
                    return Autodesk.AutoCAD.Colors.Color.FromColorIndex(
                        Autodesk.AutoCAD.Colors.ColorMethod.ByAci,
                        Convert.ToInt16(value.Substring(4)));
                }
            }
            catch { /* fall through */ }
            return null;
        }

        // ── Linework ──────────────────────────────────────────────────────────

        private static string ExecuteLineworkAction(
            Database db, Transaction tr, SyncPlanEntry entry,
            Dictionary<string, SyncLineRecord> lsaiLines, Action<string> log)
        {
            switch (entry.Action)
            {
                case "create-cad":
                {
                    if (!lsaiLines.TryGetValue(entry.Key, out var record))
                        return $"LSAI linework '{entry.Key}' not found in snapshot";
                    CreatePolyline(db, tr, record, log);
                    return null;
                }

                case "update-cad":
                {
                    if (!lsaiLines.TryGetValue(entry.Key, out var record))
                        return $"LSAI linework '{entry.Key}' not found in snapshot";
                    // Identity lives in the LANDSURV_LINE_ID stamp, so erase + recreate
                    // preserves identity even though the handle changes.
                    var existing = FindPolylineByLineId(db, tr, entry.Key);
                    if (existing != null)
                    {
                        existing.UpgradeOpen();
                        existing.Erase();
                    }
                    CreatePolyline(db, tr, record, log);
                    return null;
                }

                case "delete-cad":
                {
                    var existing = FindPolylineByLineId(db, tr, entry.Key);
                    if (existing == null) return $"CAD linework '{entry.Key}' not found";
                    existing.UpgradeOpen();
                    existing.Erase();
                    return null;
                }

                default:
                    return $"Unsupported linework action '{entry.Action}'";
            }
        }

        private static void CreatePolyline(Database db, Transaction tr, SyncLineRecord record, Action<string> log)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

            var pline = new Polyline();
            for (int i = 0; i < record.Vertices.Count; i++)
            {
                var v = record.Vertices[i];
                pline.AddVertexAt(i, new Point2d(v.X, v.Y), v.Bulge ?? 0, 0, 0);
            }
            pline.Closed = record.Closed;
            if (!string.IsNullOrEmpty(record.Layer))
            {
                EnsureLayerExists(db, tr, record.Layer, log);
                pline.Layer = record.Layer;
            }

            ms.AppendEntity(pline);
            tr.AddNewlyCreatedDBObject(pline, true);
            CadSnapshot.StampXData(db, tr, pline, CadSnapshot.RegAppLineId, record.Id);
        }

        private static Polyline FindPolylineByLineId(Database db, Transaction tr, string lineId)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);
            foreach (ObjectId objId in ms)
            {
                if (!(tr.GetObject(objId, OpenMode.ForRead) is Polyline pline)) continue;
                string id = CadSnapshot.ReadXDataString(pline, CadSnapshot.RegAppLineId);
                if (string.Equals(id, lineId, StringComparison.Ordinal)) return pline;
                // Handle-keyed records (never synced across before) also match by handle.
                if (lineId.StartsWith("cad-handle:")
                    && string.Equals("cad-handle:" + pline.Handle.ToString(), lineId, StringComparison.Ordinal))
                    return pline;
            }
            return null;
        }

        // ── Annotations ───────────────────────────────────────────────────────

        private static string ExecuteAnnotationAction(
            Database db, Transaction tr, SyncPlanEntry entry,
            Dictionary<string, SyncAnnotationRecord> lsaiAnnotations, Action<string> log)
        {
            switch (entry.Action)
            {
                case "create-cad":
                {
                    if (!lsaiAnnotations.TryGetValue(entry.Key, out var record))
                        return $"LSAI annotation '{entry.Key}' not found in snapshot";
                    CreateMTextAnnotation(db, tr, record, log);
                    return null;
                }

                case "update-cad":
                {
                    if (!lsaiAnnotations.TryGetValue(entry.Key, out var record))
                        return $"LSAI annotation '{entry.Key}' not found in snapshot";
                    var existing = FindAnnotationById(db, tr, entry.Key);
                    if (existing == null)
                    {
                        CreateMTextAnnotation(db, tr, record, log);
                        return null;
                    }
                    existing.UpgradeOpen();
                    if (existing is MText mt)
                    {
                        mt.Contents = record.Text;
                        mt.Location = new Point3d(record.X, record.Y, 0);
                        mt.Rotation = record.Angle * Math.PI / 180.0;
                        if (record.Height != null) mt.TextHeight = record.Height.Value;
                    }
                    else if (existing is DBText dt)
                    {
                        dt.TextString = record.Text;
                        dt.Position = new Point3d(record.X, record.Y, 0);
                        dt.Rotation = record.Angle * Math.PI / 180.0;
                        if (record.Height != null) dt.Height = record.Height.Value;
                    }
                    if (!string.IsNullOrEmpty(record.Layer))
                    {
                        EnsureLayerExists(db, tr, record.Layer, log);
                        existing.Layer = record.Layer;
                    }
                    return null;
                }

                case "delete-cad":
                {
                    var existing = FindAnnotationById(db, tr, entry.Key);
                    if (existing == null) return $"CAD annotation '{entry.Key}' not found";
                    existing.UpgradeOpen();
                    existing.Erase();
                    return null;
                }

                default:
                    return $"Unsupported annotation action '{entry.Action}'";
            }
        }

        private static void CreateMTextAnnotation(Database db, Transaction tr, SyncAnnotationRecord record, Action<string> log)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

            var mtext = new MText
            {
                Contents = record.Text,
                Location = new Point3d(record.X, record.Y, 0),
                Rotation = record.Angle * Math.PI / 180.0,
                TextHeight = record.Height ?? 2.5,
            };
            if (!string.IsNullOrEmpty(record.Layer))
            {
                EnsureLayerExists(db, tr, record.Layer, log);
                mtext.Layer = record.Layer;
            }

            ms.AppendEntity(mtext);
            tr.AddNewlyCreatedDBObject(mtext, true);
            CadSnapshot.StampXData(db, tr, mtext, CadSnapshot.RegAppAnnotationId, record.Id);
        }

        private static Entity FindAnnotationById(Database db, Transaction tr, string annotationId)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);
            foreach (ObjectId objId in ms)
            {
                Entity ent = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                if (!(ent is DBText) && !(ent is MText)) continue;
                string id = CadSnapshot.ReadXDataString(ent, CadSnapshot.RegAppAnnotationId);
                if (string.Equals(id, annotationId, StringComparison.Ordinal)) return ent;
                if (annotationId.StartsWith("cad-handle:")
                    && string.Equals("cad-handle:" + ent.Handle.ToString(), annotationId, StringComparison.Ordinal))
                    return ent;
            }
            return null;
        }

        // ── Symbols (block definitions) ───────────────────────────────────────

        private static string ExecuteSymbolAction(
            Database db, Transaction tr, SyncPlanEntry entry,
            Dictionary<string, SyncBlockRecord> lsaiSymbols, Action<string> log)
        {
            switch (entry.Action)
            {
                case "create-cad":
                {
                    if (!lsaiSymbols.TryGetValue(entry.Key, out var spec))
                        return $"LSAI symbol '{entry.Key}' not found in snapshot";
                    if (string.IsNullOrEmpty(spec.SvgPath))
                        return $"Symbol '{entry.Key}' has no SVG geometry to create";

                    var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForWrite);
                    string blockName = SanitizeBlockName(spec.Name);
                    if (bt.Has(blockName)) return null; // already exists — equal

                    var btr = new BlockTableRecord
                    {
                        Name = blockName,
                        Origin = Point3d.Origin,
                    };
                    bt.Add(btr);
                    tr.AddNewlyCreatedDBObject(btr, true);

                    // Draw the SVG geometry into the block definition at canonical
                    // 1-unit size, centered on the block origin (0,0); inserts scale it.
                    // Block-definition geometry lives on layer 0 so inserts adopt their
                    // target layer's properties (standard AutoCAD block practice).
                    var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                    ObjectId layerZeroId = lt.Has("0") ? lt["0"] : ObjectId.Null;
                    double size = Math.Max(1.0, spec.Scale ?? 1.0);
                    CivilAgent.DrawSvgSymbol(
                        btr, tr, spec.SvgPath, null, spec.ViewBox ?? "0 0 24 24",
                        0, 0, size, layerZeroId, log);
                    return null;
                }

                case "delete-cad":
                {
                    var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                    string blockName = SanitizeBlockName(entry.Key);
                    if (!bt.Has(blockName)) return $"Block '{blockName}' not found";
                    var btr = (BlockTableRecord)tr.GetObject(bt[blockName], OpenMode.ForWrite);
                    if (btr.GetBlockReferenceIds(false, true).Count > 0)
                        return $"Block '{blockName}' has references — purge after removing inserts";
                    btr.Erase();
                    return null;
                }

                default:
                    return $"Unsupported symbol action '{entry.Action}'";
            }
        }

        private static string SanitizeBlockName(string name)
        {
            var sb = new StringBuilder(name.Trim().ToUpperInvariant());
            foreach (char c in new[] { '<', '>', '/', '\\', '\"', ':', ';', '?', '*', '|', ',', '=' })
                sb.Replace(c, '_');
            return sb.ToString();
        }

        // ── Backup ────────────────────────────────────────────────────────────

        /// <summary>
        /// Snapshot the current CAD state of every affected key (plus the plan) to
        /// %APPDATA%\LandsurvConnector\backups before any mutation. Points also get
        /// a CSV for easy human diffing.
        /// </summary>
        private static string WriteBackup(
            Document doc, SyncApplyPlan plan,
            IEnumerable<string> affectedCategories, Action<string> log)
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "LandsurvConnector", "backups");
            Directory.CreateDirectory(dir);

            string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
            string drawingName = Path.GetFileNameWithoutExtension(doc.Name ?? "drawing");

            var snapshot = CadSnapshot.Capture(doc, log);
            var affected = new HashSet<string>(affectedCategories ?? Enumerable.Empty<string>());

            var backupPayload = new
            {
                backupId = $"backup-{stamp}",
                drawing = doc.Name,
                capturedAt = DateTime.UtcNow,
                plan,
                cadState = new
                {
                    points = affected.Contains("points") ? snapshot.Points : null,
                    layers = affected.Contains("layers") ? snapshot.Layers : null,
                    linework = affected.Contains("linework") ? snapshot.Linework : null,
                    annotations = affected.Contains("annotation") ? snapshot.Annotations : null,
                    symbols = affected.Contains("symbols") ? snapshot.Symbols : null,
                },
            };

            string jsonPath = Path.Combine(dir, $"sync-backup-{drawingName}-{stamp}.json");
            File.WriteAllText(jsonPath, JsonConvert.SerializeObject(backupPayload, Formatting.Indented));

            if (affected.Contains("points") && snapshot.Points.Count > 0)
            {
                var csv = new StringBuilder("PointNumber,Easting,Northing,Elevation,Description,Layer\n");
                foreach (var p in snapshot.Points)
                {
                    csv.AppendLine(string.Join(",",
                        p.PointNumber,
                        p.Easting.ToString("0.00000"),
                        p.Northing.ToString("0.00000"),
                        p.Elevation.ToString("0.00000"),
                        (p.Description ?? "").Replace(",", ";"),
                        p.Layer ?? ""));
                }
                File.WriteAllText(Path.Combine(dir, $"sync-backup-{drawingName}-{stamp}-points.csv"), csv.ToString());
            }

            log?.Invoke($"Backup written: {jsonPath}");
            return jsonPath;
        }
    }
}
