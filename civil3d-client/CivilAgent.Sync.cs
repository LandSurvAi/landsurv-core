using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
// Civil 3D references disabled - not available in base AutoCAD
// using Autodesk.Civil.ApplicationServices;
// using Autodesk.Civil.DatabaseServices;
using Newtonsoft.Json.Linq;
using LandsurvConnector.UI;

namespace LandsurvConnector
{
    /// <summary>CivilAgent (partial) � Sync concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        private static bool _enableLiveAfterWizard;

        /// <summary>Sync button in the chat header → start the guarded wizard flow.</summary>
        private static void StartSyncWizardFlow(bool enableLiveAfterApply = false)
        {
            try
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc == null)
                {
                    _chatForm?.AddMessage("System", "Error: No active drawing to sync.");
                    return;
                }
                if (_webSocket == null || _webSocket.State != WebSocketState.Open)
                {
                    _chatForm?.AddMessage("System", "Error: Not connected to LandSurv.ai.");
                    return;
                }
                if (_syncWizard != null && !_syncWizard.IsDisposed)
                {
                    _syncWizard.BringToFront();
                    return;
                }

                _enableLiveAfterWizard = enableLiveAfterApply;
                _pendingWizardRequestId = $"state-{DateTime.Now.Ticks}";
                var req = new JObject
                {
                    ["type"] = "request_state",
                    ["requestId"] = _pendingWizardRequestId,
                    ["timestamp"] = DateTime.UtcNow.ToString("O"),
                };
                SendWebSocketMessage(req.ToString());
                _chatForm?.AddMessage("System", "Fetching LandSurv.ai session state for sync preview…");
            }
            catch (System.Exception ex)
            {
                _chatForm?.AddMessage("System", $"Sync error: {ex.Message}");
            }
        }

        /// <summary>HandleServerMessage case: webapp state arrived for the wizard.</summary>
        private static void OnWizardStateResponse(string requestId, JObject stateData)
        {
            if (requestId != _pendingWizardRequestId) return;
            _pendingWizardRequestId = null;

            try
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc == null)
                {
                    _chatForm?.AddMessage("System", "Error: No active drawing to sync.");
                    return;
                }

                // Map webapp state → sync records; capture CAD side; diff everything.
                _wizardLsaiSnapshot = Sync.WebappStateMapper.Map(stateData ?? new JObject());
                var cadSnapshot = Sync.CadSnapshot.Capture(doc, msg => _chatForm?.AddMessage("System", msg));
                var baseline = LoadSyncBaseline(doc);

                var diffs = new List<Sync.CategoryDiffResult>
                {
                    Sync.SyncEngine.DiffPoints(cadSnapshot.Points, _wizardLsaiSnapshot.Points, baseline?.Points),
                    Sync.SyncEngine.DiffLayers(cadSnapshot.Layers, _wizardLsaiSnapshot.Layers, baseline?.Layers),
                    Sync.SyncEngine.DiffLinework(cadSnapshot.Linework, _wizardLsaiSnapshot.Linework, baseline?.Linework),
                    Sync.SyncEngine.DiffAnnotations(cadSnapshot.Annotations, _wizardLsaiSnapshot.Annotations, baseline?.Annotations),
                    Sync.SyncEngine.DiffSymbols(cadSnapshot.Symbols, _wizardLsaiSnapshot.Symbols, baseline?.Symbols),
                };

                int totalDiffs = diffs.Sum(d => d.Counts
                    .Where(kv => kv.Key != Sync.SyncItemState.Equal).Sum(kv => kv.Value));

                if (totalDiffs == 0)
                {
                    SaveSyncBaseline(doc, cadSnapshot);
                    if (_enableLiveAfterWizard)
                    {
                        _enableLiveAfterWizard = false;
                        SetLiveSyncEnabled(true);
                    }
                    _chatForm?.AddMessage("System", "✓ Everything is in sync — points, layers, linework, annotations, and symbols all match.");
                    return;
                }

                ShowSyncWizard(doc, diffs);
                _chatForm?.AddMessage("System", $"Sync preview ready: {totalDiffs} difference(s) found. Review and apply in the Sync window.");
            }
            catch (System.Exception ex)
            {
                _chatForm?.AddMessage("System", $"Error preparing sync: {ex.Message}");
            }
        }

        /// <summary>
        /// Build and show the modeless sync wizard for a set of diffs. Shared by the
        /// manual Sync button and live-sync's conflict/ambiguity escalation. Assumes
        /// <see cref="_wizardLsaiSnapshot"/> is already set to the LSAI snapshot the
        /// diffs were computed against (ExecuteWizardApply reads it).
        /// </summary>
        private static void ShowSyncWizard(Document doc, List<Sync.CategoryDiffResult> diffs)
        {
            if (_syncWizard != null && !_syncWizard.IsDisposed)
            {
                _syncWizard.BringToFront();
                return;
            }
            var wizard = new UI.SyncWizardForm(diffs, System.IO.Path.GetFileName(doc.Name));
            _syncWizard = wizard;
            wizard.FormClosed += (s, e) =>
            {
                if (ReferenceEquals(_syncWizard, wizard))
                {
                    _syncWizard = null;
                    // A successful review clears the held-back bookkeeping so live
                    // sync retries the resolved items; a plain dismissal leaves it
                    // untouched so nothing reopens or re-fires on its own.
                    if (wizard.ApplyCompletedSuccessfully)
                    {
                        _lastUnsafeSignature = null;
                        ResetLiveConvergenceState();
                        _cadDirty = true;
                    }
                }
            };
            wizard.ApplyRequested += (s, e) => ExecuteWizardApply(e.Plan, e.Cancellation);
            // Modeless, kept above Civil 3D (MainWindow isn't an IWin32Window).
            wizard.TopMost = true;
            wizard.Show();
        }

        private static void OnWizardStateError(string requestId, string error)
        {
            if (requestId != _pendingWizardRequestId) return;
            _pendingWizardRequestId = null;
            _chatForm?.AddMessage("System", $"⚠ Cannot sync: {error}");
        }

        private static void OnWizardLsaiApplyResult(string requestId, bool success, string summary)
        {
            if (requestId != _pendingLsaiApplyId) return;
            _pendingLsaiApplyId = null;

            if (_syncWizard != null && !_syncWizard.IsDisposed)
            {
                _syncWizard.ReportApplyComplete(
                    _wizardApplySucceeded, _wizardApplyFailed, _wizardApplySkipped,
                    _wizardApplyBackupPath,
                    success ? $"LandSurv.ai: {summary}" : $"⚠ LandSurv.ai side failed: {summary}");
            }
            SendSyncEnd();
            if (_enableLiveAfterWizard)
            {
                _enableLiveAfterWizard = false;
                SetLiveSyncEnabled(true);
            }
        }

        private static void OnWizardSyncRejected(string reason)
        {
            if (_syncWizard != null && !_syncWizard.IsDisposed)
            {
                _syncWizard.ReportApplyError(reason);
            }
        }

        /// <summary>Wizard confirmed → run the apply (CAD side here; LSAI side via relay).</summary>
        private static void ExecuteWizardApply(Sync.SyncApplyPlan plan, CancellationTokenSource cts)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                _syncWizard?.ReportApplyError("No active drawing.");
                return;
            }

            _syncApplyCts = cts;
            string syncId = $"dll-{DateTime.Now.Ticks}";

            // Take the relay mutex (rejected → sync_rejected message → OnWizardSyncRejected).
            // The webapp cannot double-apply because its applies take the same mutex.
            SendWebSocketMessage(new JObject
            {
                ["type"] = "sync_begin",
                ["syncId"] = syncId,
                ["timestamp"] = DateTime.UtcNow.ToString("O"),
            }.ToString());

            var progress = new Progress<Sync.SyncProgressInfo>(info =>
            {
                _syncWizard?.ReportProgress(info);
                // Keep the wizard painting during the main-thread apply. The wizard
                // guards against re-entrancy (Back disabled; Cancel only flips the
                // cancellation token; form close is blocked while running).
                System.Windows.Forms.Application.DoEvents();
                // Stream progress to the webapp Sync Center
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
                doc, plan, _wizardLsaiSnapshot, progress, cts.Token,
                msg => _chatForm?.AddMessage("System", msg));

            _wizardApplySucceeded = outcome.Succeeded;
            _wizardApplyFailed = outcome.Failed;
            _wizardApplySkipped = outcome.Skipped;
            _wizardApplyBackupPath = outcome.BackupPath;

            // Post-apply CAD snapshot → baseline for next sync's conflict detection
            var postCad = Sync.CadSnapshot.Capture(doc, msg => _chatForm?.AddMessage("System", msg));
            SaveSyncBaseline(doc, BuildPostSyncBaseline(postCad, _wizardLsaiSnapshot, plan));

            // LSAI-side actions (create-lsai / update-lsai / delete-lsai) are applied
            // by the webapp, which owns React state.
            var lsaiCategories = plan.Categories
                .Select(c => new Sync.CategoryPlan
                {
                    Category = c.Category,
                    Direction = c.Direction,
                    Entries = c.Entries.Where(e => e.Action.EndsWith("-lsai")).ToList(),
                })
                .Where(c => c.Entries.Count > 0)
                .ToList();

            if (lsaiCategories.Count > 0)
            {
                _pendingLsaiApplyId = $"lsai-apply-{DateTime.Now.Ticks}";
                SendWebSocketMessage(new JObject
                {
                    ["type"] = "sync_lsai_apply",
                    ["requestId"] = _pendingLsaiApplyId,
                    ["plan"] = new JObject
                    {
                        ["planId"] = plan.PlanId,
                        ["categories"] = JArray.FromObject(lsaiCategories),
                    },
                    ["cadSnapshot"] = JObject.FromObject(postCad),
                    ["timestamp"] = DateTime.UtcNow.ToString("O"),
                }.ToString());
                // Completion reported when sync_lsai_result arrives (OnWizardLsaiApplyResult)
                return;
            }

            SendSyncEnd();
            _syncWizard?.ReportApplyComplete(
                outcome.Succeeded, outcome.Failed, outcome.Skipped,
                outcome.BackupPath, null);
            if (_enableLiveAfterWizard)
            {
                _enableLiveAfterWizard = false;
                SetLiveSyncEnabled(true);
            }
        }

        private static void SendSyncEnd()
        {
            SendWebSocketMessage(new JObject
            {
                ["type"] = "sync_end",
                ["timestamp"] = DateTime.UtcNow.ToString("O"),
            }.ToString());
        }

        // ── Webapp-initiated tools ────────────────────────────────────────────

        /// <summary>Tool: get_sync_snapshot — full CAD-side sync records as JSON.</summary>
        private string GetSyncSnapshotJson()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            var snapshot = Sync.CadSnapshot.Capture(doc, this.PrintMessage);
            var result = new JObject
            {
                ["success"] = true,
                ["civil3d"] = Sync.CogoPointAdapter.CanUseCogoPoints,
                ["drawing"] = doc.Name,
                ["snapshot"] = JObject.FromObject(snapshot),
            };
            this.PrintMessage($"Sync snapshot: {snapshot.Points.Count} points, {snapshot.Layers.Count} layers, {snapshot.Linework.Count} linework, {snapshot.Annotations.Count} annotations, {snapshot.Symbols.Count} blocks");
            return result.ToString();
        }

        /// <summary>Tool: sync_apply — execute the CAD-side of a webapp-built plan.</summary>
        private string SyncApplyFromWebapp(JObject args, string requestId)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            var plan = args?["plan"]?.ToObject<Sync.SyncApplyPlan>();
            var lsaiSnapshot = args?["lsaiSnapshot"]?.ToObject<Sync.SyncSnapshot>();
            if (plan == null) return "{\"success\": false, \"error\": \"Missing plan\"}";

            _syncApplyCts = new CancellationTokenSource();

            var progress = new Progress<Sync.SyncProgressInfo>(info =>
            {
                SendWebSocketMessage(new JObject
                {
                    ["type"] = "sync_progress",
                    ["syncId"] = requestId,
                    ["phase"] = info.Phase,
                    ["current"] = info.Current,
                    ["total"] = info.Total,
                    ["message"] = info.Message,
                }.ToString());
            });

            var outcome = Sync.SyncApplier.Apply(doc, plan, lsaiSnapshot, progress, _syncApplyCts.Token, this.PrintMessage);

            // Refresh baseline after webapp-initiated applies too.
            var postCad = Sync.CadSnapshot.Capture(doc, this.PrintMessage);
            if (lsaiSnapshot != null)
            {
                SaveSyncBaseline(doc, BuildPostSyncBaseline(postCad, lsaiSnapshot, plan));
            }

            this.PrintMessage($"✓ sync_apply complete: {outcome.Succeeded} ok, {outcome.Failed} failed, {outcome.Skipped} skipped");

            return new JObject
            {
                ["success"] = outcome.Failed == 0,
                ["applied"] = outcome.Succeeded,
                ["failed"] = outcome.Failed,
                ["skipped"] = outcome.Skipped,
                ["backup"] = outcome.BackupPath ?? "",
                ["results"] = JArray.FromObject(outcome.Results),
                ["cadSnapshot"] = JObject.FromObject(postCad),
            }.ToString();
        }

        // ── Baseline persistence (per drawing) ───────────────────────────────

        private static string BaselinePath(Document doc)
        {
            string dir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "LandsurvConnector", "sync-baselines");
            System.IO.Directory.CreateDirectory(dir);
            string name = doc.Name ?? "unknown";
            foreach (char c in System.IO.Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            return System.IO.Path.Combine(dir, name + ".json");
        }

        private static Sync.SyncSnapshot LoadSyncBaseline(Document doc)
        {
            try
            {
                string path = BaselinePath(doc);
                if (!System.IO.File.Exists(path)) return null;
                return Newtonsoft.Json.JsonConvert.DeserializeObject<Sync.SyncSnapshot>(
                    System.IO.File.ReadAllText(path));
            }
            catch
            {
                return null;
            }
        }

        private static void SaveSyncBaseline(Document doc, Sync.SyncSnapshot baseline)
        {
            try
            {
                System.IO.File.WriteAllText(BaselinePath(doc),
                    Newtonsoft.Json.JsonConvert.SerializeObject(baseline));
            }
            catch (System.Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Baseline save failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Baseline = post-apply CAD truth PLUS the LSAI records that won on
        /// LSAI-side actions (create-lsai / update-lsai) so both-way comparisons
        /// against the baseline detect true both-changed conflicts next time.
        /// </summary>
        private static Sync.SyncSnapshot BuildPostSyncBaseline(
            Sync.SyncSnapshot postCad, Sync.SyncSnapshot lsai, Sync.SyncApplyPlan plan)
        {
            if (lsai == null || plan == null) return postCad;

            foreach (var cat in plan.Categories)
            {
                var lsaiWonKeys = new HashSet<string>(
                    cat.Entries
                        .Where(e => (e.Action == "create-lsai" || e.Action == "update-lsai"))
                        .Select(e => e.Key),
                    StringComparer.OrdinalIgnoreCase);
                if (lsaiWonKeys.Count == 0) continue;

                switch (cat.Category)
                {
                    case "points":
                        MergeBaseline(postCad.Points, lsai.Points, lsaiWonKeys,
                            p => p.PointNumber, (a, b) => { a.Easting = b.Easting; a.Northing = b.Northing; a.Elevation = b.Elevation; a.Description = b.Description; });
                        break;
                    case "layers":
                        MergeBaseline(postCad.Layers, lsai.Layers, lsaiWonKeys,
                            l => l.Name, (a, b) => { a.Color = b.Color; a.LineType = b.LineType; a.LineWeight = b.LineWeight; });
                        break;
                    case "linework":
                        MergeBaseline(postCad.Linework, lsai.Linework, lsaiWonKeys,
                            l => l.Id, (a, b) => { a.Vertices = b.Vertices; a.Closed = b.Closed; a.Layer = b.Layer; });
                        break;
                    case "annotation":
                        MergeBaseline(postCad.Annotations, lsai.Annotations, lsaiWonKeys,
                            a2 => a2.Id, (a, b) => { a.Text = b.Text; a.X = b.X; a.Y = b.Y; a.Angle = b.Angle; a.Layer = b.Layer; });
                        break;
                    case "symbols":
                        MergeBaseline(postCad.Symbols, lsai.Symbols, lsaiWonKeys,
                            s => s.Name, (a, b) => { a.SvgPath = b.SvgPath; a.Scale = b.Scale; });
                        break;
                }
            }
            return postCad;
        }

        private static void MergeBaseline<T>(
            List<T> baseline, List<T> lsaiSource, HashSet<string> wonKeys,
            Func<T, string> keyOf, Action<T, T> copyFrom)
        {
            foreach (var record in lsaiSource)
            {
                if (!wonKeys.Contains(keyOf(record))) continue;
                var existing = baseline.FirstOrDefault(b =>
                    string.Equals(keyOf(b), keyOf(record), StringComparison.OrdinalIgnoreCase));
                if (existing != null) copyFrom(existing, record);
                else baseline.Add(record);
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // AGENTIC C3D TOOLS (connector overhaul Phase 3 / dll-tool-expansion)
        // These are the DLL-side handlers invoked by the backend c3d_* agent tools
        // (services/c3dAgentChat.ts) via the CadBridge command channel.
        // ══════════════════════════════════════════════════════════════════════

        /// <summary>Tool: count_entities — count entities by type/layer/description.</summary>
        private string CountEntities(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            string entityType = args?["entityType"]?.ToString()?.ToLowerInvariant();
            string layer = args?["layer"]?.ToString();
            string descContains = args?["descriptionContains"]?.ToString();

            Database db = doc.Database;
            int count = 0;
            var layerCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);

                foreach (ObjectId objId in ms)
                {
                    Entity ent = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                    if (ent == null) continue;

                    // Type filter
                    if (!string.IsNullOrEmpty(entityType))
                    {
                        bool typeMatch =
                            (entityType == "point" || entityType == "dbpoint" || entityType == "cogopoint") && ent is DBPoint
                            || entityType == "line" && ent is Line
                            || entityType == "polyline" && ent is Polyline
                            || (entityType == "text" || entityType == "mtext") && (ent is DBText || ent is MText)
                            || entityType == "block_reference" && ent is BlockReference;
                        if (!typeMatch) continue;
                    }

                    // Layer filter
                    if (!string.IsNullOrEmpty(layer)
                        && !string.Equals(ent.Layer, layer, StringComparison.OrdinalIgnoreCase)) continue;

                    // Description filter (points only)
                    if (!string.IsNullOrEmpty(descContains))
                    {
                        string desc = ent is DBPoint p
                            ? (Sync.CadSnapshot.ReadXDataString(p, Sync.CadSnapshot.RegAppDesc) ?? "")
                            : "";
                        if (desc.IndexOf(descContains, StringComparison.OrdinalIgnoreCase) < 0) continue;
                    }

                    count++;
                    if (!layerCounts.ContainsKey(ent.Layer)) layerCounts[ent.Layer] = 0;
                    layerCounts[ent.Layer]++;
                }
                tr.Commit();
            }

            var layers = new JObject();
            foreach (var kv in layerCounts.OrderByDescending(kv => kv.Value).Take(20))
                layers[kv.Key] = kv.Value;

            return new JObject
            {
                ["success"] = true,
                ["count"] = count,
                ["total"] = count,
                ["layer"] = layer ?? "",
                ["entityType"] = entityType ?? "all",
                ["byLayer"] = layers,
            }.ToString();
        }

        /// <summary>Tool: add_point_labels — label points (number/elevation/description).</summary>
        private string AddPointLabels(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            string layer = args?["layer"]?.ToString();
            string descContains = args?["descriptionContains"]?.ToString();
            string labelStyle = args?["labelStyle"]?.ToString() ?? "full";
            var pointNumbers = args?["pointNumbers"] as JArray;

            Database db = doc.Database;
            int labeled = 0;

            using (doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

                var wanted = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (pointNumbers != null) foreach (var pn in pointNumbers) wanted.Add(pn.ToString());

                int positional = 1;
                foreach (ObjectId objId in ms)
                {
                    if (!(tr.GetObject(objId, OpenMode.ForRead) is DBPoint point)) continue;
                    string num = Sync.CadSnapshot.ReadXDataString(point, Sync.CadSnapshot.RegAppPointNumber) ?? (positional++).ToString();
                    string desc = Sync.CadSnapshot.ReadXDataString(point, Sync.CadSnapshot.RegAppDesc) ?? "";

                    if (wanted.Count > 0 && !wanted.Contains(num)) continue;
                    if (!string.IsNullOrEmpty(layer) && !string.Equals(point.Layer, layer, StringComparison.OrdinalIgnoreCase)) continue;
                    if (!string.IsNullOrEmpty(descContains) && desc.IndexOf(descContains, StringComparison.OrdinalIgnoreCase) < 0) continue;

                    string text = labelStyle switch
                    {
                        "number" => num,
                        "elevation" => point.Position.Z.ToString("0.00"),
                        "description" => desc,
                        "number-elevation" => $"{num}  {point.Position.Z:0.00}",
                        _ => string.IsNullOrEmpty(desc) ? $"{num}  {point.Position.Z:0.00}" : $"{num}  {point.Position.Z:0.00}  {desc}",
                    };
                    if (string.IsNullOrWhiteSpace(text)) continue;

                    // Small text entity offset up-right from the point.
                    var label = new DBText
                    {
                        TextString = text,
                        Position = new Point3d(point.Position.X + 1.0, point.Position.Y + 1.0, 0),
                        Height = 2.5,
                        Layer = point.Layer,
                    };
                    ms.AppendEntity(label);
                    tr.AddNewlyCreatedDBObject(label, true);
                    labeled++;
                }
                tr.Commit();
            }

            return new JObject { ["success"] = true, ["labeled"] = labeled, ["count"] = labeled }.ToString();
        }

        /// <summary>Tool: insert_blocks — place a block/symbol at matching point locations.</summary>
        private string InsertBlocks(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            string blockName = args?["blockName"]?.ToString();
            string layer = args?["layer"]?.ToString();
            string descContains = args?["descriptionContains"]?.ToString();
            double scale = args?["scale"]?.ToObject<double>() ?? 1.0;
            var pointNumbers = args?["pointNumbers"] as JArray;

            if (string.IsNullOrWhiteSpace(blockName))
                return "{\"success\": false, \"error\": \"blockName is required\"}";

            Database db = doc.Database;
            int inserted = 0;

            using (doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

                // Block must exist (created via sync symbols or already in the drawing).
                string resolvedName = null;
                foreach (ObjectId btrId in bt)
                {
                    var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
                    if (btr.IsAnonymous || btr.IsLayout || btr.Name.StartsWith("*")) continue;
                    if (string.Equals(btr.Name, blockName, StringComparison.OrdinalIgnoreCase))
                    {
                        resolvedName = btr.Name;
                        break;
                    }
                }
                if (resolvedName == null)
                    return new JObject { ["success"] = false, ["error"] = $"Block '{blockName}' not found in the drawing. Create/sync it first." }.ToString();

                ObjectId blockId = bt[resolvedName];
                var wanted = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (pointNumbers != null) foreach (var pn in pointNumbers) wanted.Add(pn.ToString());

                int positional = 1;
                foreach (ObjectId objId in ms)
                {
                    if (!(tr.GetObject(objId, OpenMode.ForRead) is DBPoint point)) continue;
                    string num = Sync.CadSnapshot.ReadXDataString(point, Sync.CadSnapshot.RegAppPointNumber) ?? (positional++).ToString();
                    string desc = Sync.CadSnapshot.ReadXDataString(point, Sync.CadSnapshot.RegAppDesc) ?? "";

                    if (wanted.Count > 0 && !wanted.Contains(num)) continue;
                    if (!string.IsNullOrEmpty(descContains) && desc.IndexOf(descContains, StringComparison.OrdinalIgnoreCase) < 0) continue;

                    var br = new BlockReference(point.Position, blockId)
                    {
                        ScaleFactors = new Scale3d(scale),
                    };
                    if (!string.IsNullOrEmpty(layer))
                    {
                        // Ensure layer exists before assigning.
                        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                        if (!lt.Has(layer))
                        {
                            lt.UpgradeOpen();
                            var ltr = new LayerTableRecord { Name = layer };
                            lt.Add(ltr);
                            tr.AddNewlyCreatedDBObject(ltr, true);
                        }
                        br.Layer = layer;
                    }
                    ms.AppendEntity(br);
                    tr.AddNewlyCreatedDBObject(br, true);
                    inserted++;
                }
                tr.Commit();
            }

            return new JObject { ["success"] = true, ["inserted"] = inserted, ["count"] = inserted, ["blockName"] = blockName }.ToString();
        }

        /// <summary>Tool: create_polyline_batch — draw a polyline with optional arc (bulge) segments.
        /// Robust to vertices given as {x,y,bulge} objects OR [x,y] / [x,y,bulge] arrays.</summary>
        private string CreatePolylineBatch(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            var vertices = args?["vertices"] as JArray;
            string layer = args?["layer"]?.ToString();
            bool closed = args?["closed"]?.ToObject<bool>() ?? false;

            if (vertices == null || vertices.Count < 2)
                return "{\"success\": false, \"error\": \"At least 2 vertices are required\"}";

            // Parse vertices tolerantly: accept {x,y,bulge} objects and [x,y(,bulge)] arrays.
            var parsed = new List<(double x, double y, double bulge)>();
            foreach (var vt in vertices)
            {
                double x, y, bulge = 0;
                if (vt is JObject vo)
                {
                    x = vo["x"]?.ToObject<double>() ?? vo["X"]?.ToObject<double>()
                        ?? vo["easting"]?.ToObject<double>() ?? double.NaN;
                    y = vo["y"]?.ToObject<double>() ?? vo["Y"]?.ToObject<double>()
                        ?? vo["northing"]?.ToObject<double>() ?? double.NaN;
                    bulge = vo["bulge"]?.ToObject<double>() ?? 0;
                }
                else if (vt is JArray va && va.Count >= 2)
                {
                    x = va[0]?.ToObject<double>() ?? double.NaN;
                    y = va[1]?.ToObject<double>() ?? double.NaN;
                    if (va.Count >= 3) bulge = va[2]?.ToObject<double>() ?? 0;
                }
                else continue;

                if (double.IsNaN(x) || double.IsNaN(y)) continue;
                parsed.Add((x, y, bulge));
            }

            if (parsed.Count < 2)
                return "{\"success\": false, \"error\": \"Could not parse at least 2 numeric vertices. Provide vertices as [{x,y}] or [[x,y]].\"}";

            Database db = doc.Database;
            try
            {
                using (doc.LockDocument())
                using (Transaction tr = db.TransactionManager.StartTransaction())
                {
                    var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                    var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

                    var pline = new Polyline();
                    for (int i = 0; i < parsed.Count; i++)
                        pline.AddVertexAt(i, new Point2d(parsed[i].x, parsed[i].y), parsed[i].bulge, 0, 0);
                    pline.Closed = closed;

                    if (!string.IsNullOrEmpty(layer))
                    {
                        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                        if (!lt.Has(layer))
                        {
                            lt.UpgradeOpen();
                            var ltr = new LayerTableRecord { Name = layer };
                            lt.Add(ltr);
                            tr.AddNewlyCreatedDBObject(ltr, true);
                        }
                        pline.Layer = layer;
                    }

                    ms.AppendEntity(pline);
                    tr.AddNewlyCreatedDBObject(pline, true);
                    tr.Commit();
                }
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"✗ create_polyline_batch failed: {ex.Message}");
                return new JObject { ["success"] = false, ["error"] = $"Failed to draw polyline: {ex.Message}" }.ToString();
            }

            return new JObject { ["success"] = true, ["vertexCount"] = parsed.Count, ["closed"] = closed, ["layer"] = layer ?? "" }.ToString();
        }

        // ── Layer tools (agentic): list / create / delete ─────────────────────

        /// <summary>Tool: list_layers — return the drawing's layers with attributes.</summary>
        private string ListLayersAgent()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            var arr = new JArray();
            using (Transaction tr = doc.Database.TransactionManager.StartTransaction())
            {
                var lt = (LayerTable)tr.GetObject(doc.Database.LayerTableId, OpenMode.ForRead);
                foreach (ObjectId id in lt)
                {
                    var layer = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
                    arr.Add(new JObject
                    {
                        ["name"] = layer.Name,
                        ["color"] = Sync.CadSnapshot.NormalizeColor(layer.Color),
                        ["lineWeight"] = layer.LineWeight == LineWeight.ByLayer ? null : (int?)(int)layer.LineWeight,
                        ["isOff"] = layer.IsOff,
                        ["isFrozen"] = layer.IsFrozen,
                    });
                }
                tr.Commit();
            }
            return new JObject { ["success"] = true, ["count"] = arr.Count, ["layers"] = arr }.ToString();
        }

        /// <summary>Tool: create_layers_agent — create/update layers from the agent.</summary>
        private string CreateLayersAgent(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            var layers = args?["layers"] as JArray;
            if (layers == null || layers.Count == 0)
                return "{\"success\": false, \"error\": \"No layers provided\"}";

            int created = 0, updated = 0, failed = 0;
            Database db = doc.Database;
            using (doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForWrite);
                var ltt = (LinetypeTable)tr.GetObject(db.LinetypeTableId, OpenMode.ForRead);

                foreach (var l in layers.OfType<JObject>())
                {
                    string name = l["name"]?.ToString();
                    if (string.IsNullOrWhiteSpace(name)) { failed++; continue; }
                    try
                    {
                        LayerTableRecord layer;
                        bool isNew = !lt.Has(name);
                        if (isNew)
                        {
                            layer = new LayerTableRecord { Name = name };
                            lt.Add(layer);
                            tr.AddNewlyCreatedDBObject(layer, true);
                        }
                        else
                        {
                            layer = (LayerTableRecord)tr.GetObject(lt[name], OpenMode.ForWrite);
                        }

                        string colorStr = l["color"]?.ToString();
                        if (!string.IsNullOrEmpty(colorStr))
                        {
                            var col = ParseAgentColor(colorStr);
                            if (col != null) layer.Color = col;
                        }
                        string lineType = l["lineType"]?.ToString();
                        if (!string.IsNullOrEmpty(lineType) && ltt.Has(lineType))
                            layer.LinetypeObjectId = ltt[lineType];
                        var lw = l["lineWeight"]?.ToObject<double?>();
                        if (lw != null) layer.LineWeight = MmToLineWeight(lw.Value);
                        string desc = l["description"]?.ToString();
                        if (!string.IsNullOrEmpty(desc)) layer.Description = desc;

                        if (isNew) created++; else updated++;
                    }
                    catch (System.Exception ex)
                    {
                        this.PrintMessage($"  ✗ layer '{name}' failed: {ex.Message}");
                        failed++;
                    }
                }
                tr.Commit();
            }
            this.PrintMessage($"✓ Layers: {created} created, {updated} updated, {failed} failed");
            return new JObject { ["success"] = failed == 0, ["created"] = created, ["updated"] = updated, ["failed"] = failed }.ToString();
        }

        /// <summary>Tool: delete_layers_agent — delete layers, skipping in-use / protected ones.</summary>
        private string DeleteLayersAgent(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return "{\"success\": false, \"error\": \"No active document\"}";

            var names = args?["names"] as JArray;
            if (names == null || names.Count == 0)
                return "{\"success\": false, \"error\": \"No layer names provided\"}";

            int deleted = 0, skipped = 0;
            var skippedNames = new JArray();
            Database db = doc.Database;
            using (doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForWrite);
                // Which layers are referenced by objects? Build a used-set from model space.
                var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                foreach (ObjectId btrId in bt)
                {
                    var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
                    foreach (ObjectId entId in btr)
                    {
                        var ent = tr.GetObject(entId, OpenMode.ForRead) as Entity;
                        if (ent != null) used.Add(ent.Layer);
                    }
                }
                string currentLayer = ((LayerTableRecord)tr.GetObject(db.Clayer, OpenMode.ForRead)).Name;

                foreach (var nt in names)
                {
                    string name = nt?.ToString();
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    if (!lt.Has(name)
                        || string.Equals(name, "0", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(name, currentLayer, StringComparison.OrdinalIgnoreCase)
                        || used.Contains(name))
                    {
                        skipped++; skippedNames.Add(name);
                        continue;
                    }
                    try
                    {
                        var layer = (LayerTableRecord)tr.GetObject(lt[name], OpenMode.ForWrite);
                        layer.Erase();
                        deleted++;
                    }
                    catch { skipped++; skippedNames.Add(name); }
                }
                tr.Commit();
            }
            this.PrintMessage($"✓ Deleted {deleted} layer(s), skipped {skipped}");
            return new JObject { ["success"] = true, ["deleted"] = deleted, ["skipped"] = skipped, ["skippedNames"] = skippedNames }.ToString();
        }

        /// <summary>Parse "#RRGGBB" or an ACI number string into an AutoCAD color.</summary>
        private static Autodesk.AutoCAD.Colors.Color ParseAgentColor(string value)
        {
            value = value?.Trim();
            if (string.IsNullOrEmpty(value)) return null;
            try
            {
                if (value.StartsWith("#") && value.Length == 7)
                {
                    int r = Convert.ToInt32(value.Substring(1, 2), 16);
                    int g = Convert.ToInt32(value.Substring(3, 2), 16);
                    int b = Convert.ToInt32(value.Substring(5, 2), 16);
                    return Autodesk.AutoCAD.Colors.Color.FromRgb((byte)r, (byte)g, (byte)b);
                }
                if (short.TryParse(value, out short aci) && aci >= 0 && aci <= 256)
                    return Autodesk.AutoCAD.Colors.Color.FromColorIndex(Autodesk.AutoCAD.Colors.ColorMethod.ByAci, aci);
            }
            catch { }
            return null;
        }

        /// <summary>Map mm lineweight to the nearest AutoCAD LineWeight enum value.</summary>
        private static LineWeight MmToLineWeight(double mm)
        {
            int hundredths = (int)Math.Round(mm * 100.0);
            LineWeight best = LineWeight.ByLineWeightDefault;
            int bestDiff = int.MaxValue;
            foreach (LineWeight lw in Enum.GetValues(typeof(LineWeight)))
            {
                int v = (int)lw;
                if (v < 0) continue; // skip ByLayer/ByBlock/Default sentinels
                int diff = Math.Abs(v - hundredths);
                if (diff < bestDiff) { bestDiff = diff; best = lw; }
            }
            return best;
        }
    }
}