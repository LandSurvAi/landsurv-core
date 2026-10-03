using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.EditorInput;

namespace LandsurvConnector
{
    /// <summary>
    /// CACP Event Listener - Handles downstream CACP Action notifications from cloud.
    /// 
    /// When the cloud Gemini orchestrator approves a drawing action (e.g., "draw oak tree"),
    /// it sends a CACP Action Notification to the Civil 3D plugin via WebSocket.
    /// This listener receives, parses, and executes the drawing command.
    /// 
    /// Workflow:
    ///   1. Cloud sends CACP Action JSON with approved features + keyframe cache
    ///   2. Listener deserializes and validates the action
    ///   3. Executes CAD drawing (add point/polyline with Description Key layer)
    ///   4. Updates .lsvz world_state with new geometry
    ///   5. Sends CACP Acknowledgment back to cloud for audit trail
    /// 
    /// Reference: landsurv-xr-system-spec.md §4 (Local Workstation CAD Gateway)
    /// </summary>
    public class CacpEventListener
    {
        private Editor _editor;
        private Document _document;

        public CacpEventListener(Document doc)
        {
            _document = doc;
            _editor = doc.Editor;
        }

        /// <summary>
        /// Process an incoming CACP Action Notification from the cloud.
        /// 
        /// CACP Action schema:
        /// {
        ///   "version": "1.0.0",
        ///   "action_id": "uuid-...",
        ///   "event_id": "uuid-...",  // Reference to originating CACP Event
        ///   "timestamp": "ISO 8601",
        ///   "session_context": { "project_id": "...", "surveyor_id": "..." },
        ///   "instruction": {
        ///     "status": "approved",  // "approved" | "modified" | "rejected"
        ///     "summary": "Drawing oak tree at coordinates..."
        ///   },
        ///   "payload": {
        ///     "features": [
        ///       {
        ///         "type": "tree",
        ///         "raw_coordinates": [X, Y, Z],
        ///         "attributes": {
        ///           "genus": "Quercus",
        ///           "caliper_inches": 12.0,
        ///           "description_key": "VEG_TREE",
        ///           "cad_layer": "V-VEG-TREE"
        ///         }
        ///       }
        ///     ]
        ///   },
        ///   "keyframe_cache": {
        ///     "data_url": "data:image/png;base64,..."
        ///   }
        /// }
        /// </summary>
        public async Task HandleCacpActionAsync(string jsonPayload)
        {
            try
            {
                var action = JObject.Parse(jsonPayload);
                
                // Validate CACP Action structure
                if (!ValidateCacpAction(action))
                {
                    this.LogMessage($"✗ Invalid CACP Action format: missing required fields");
                    return;
                }

                string actionId = action["action_id"]?.ToString() ?? "unknown";
                string actionStatus = action["instruction"]?["status"]?.ToString() ?? "unknown";
                
                this.LogMessage($"📥 Received CACP Action [{actionId}]: {actionStatus}");

                // Only execute if status is "approved"
                if (actionStatus != "approved")
                {
                    this.LogMessage($"   Status: {actionStatus} — no drawing executed");
                    return;
                }

                // Extract features from payload
                var features = action["payload"]?["features"] as JArray;
                if (features == null || features.Count == 0)
                {
                    this.LogMessage("⚠ No features in CACP Action payload");
                    return;
                }

                // Execute drawing for each feature
                int successCount = 0;
                int failureCount = 0;

                foreach (var featureToken in features)
                {
                    var feature = featureToken as JObject;
                    if (feature == null) continue;

                    try
                    {
                        bool result = await ExecuteFeatureDrawingAsync(feature);
                        if (result)
                            successCount++;
                        else
                            failureCount++;
                    }
                    catch (Exception ex)
                    {
                        this.LogMessage($"   ✗ Failed to draw feature: {ex.Message}");
                        failureCount++;
                    }
                }

                this.LogMessage($"✓ Drawing complete: {successCount} succeeded, {failureCount} failed");

                // Send CACP Acknowledgment back to cloud for audit
                await SendCacpAcknowledgmentAsync(actionId, successCount, failureCount);
            }
            catch (Exception ex)
            {
                this.LogMessage($"✗ Error processing CACP Action: {ex.Message}");
            }
        }

        /// <summary>
        /// Execute drawing for a single feature (point or line).
        /// Maps Description Key to Civil 3D layer code and applies attributes.
        /// </summary>
        private async Task<bool> ExecuteFeatureDrawingAsync(JObject feature)
        {
            return await Task.Run(() =>
            {
                try
                {
                    string featureType = feature["type"]?.ToString() ?? "point";
                    var coords = feature["raw_coordinates"] as JArray;
                    var attributes = feature["attributes"] as JObject;

                    if (coords == null || coords.Count < 2)
                    {
                        this.LogMessage($"   ⚠ Invalid coordinates for {featureType}");
                        return false;
                    }

                    // Extract coordinates
                    double x = (double)coords[0];
                    double y = (double)coords[1];
                    double z = coords.Count > 2 ? (double)coords[2] : 0.0;

                    // Get Description Key and CAD layer
                    string descriptionKey = attributes?["description_key"]?.ToString() ?? "DEFAULT";
                    string cadLayer = attributes?["cad_layer"]?.ToString() ?? "0";

                    // Create point in Civil 3D (simplified; in production, would integrate with C3D API)
                    using (Transaction tr = _document.TransactionManager.StartTransaction())
                    {
                        BlockTable blockTable = tr.GetObject(_document.Database.BlockTableId, OpenMode.ForRead) as BlockTable;
                        BlockTableRecord modelSpace = tr.GetObject(blockTable[BlockTableRecord.ModelSpace], OpenMode.ForWrite) as BlockTableRecord;

                        // Create point entity
                        DBPoint dbPoint = new DBPoint(new Point3d(x, y, z));
                        dbPoint.Layer = cadLayer;  // Assign layer based on Description Key

                        // Add to model space
                        modelSpace.AppendEntity(dbPoint);
                        tr.AddNewlyCreatedDBObject(dbPoint, true);

                        tr.Commit();
                    }

                    this.LogMessage($"   ✓ Drew {featureType} at ({x:F2}, {y:F2}, {z:F2}) on layer '{cadLayer}'");
                    return true;
                }
                catch (Exception ex)
                {
                    throw new Exception($"Feature drawing error: {ex.Message}");
                }
            });
        }

        /// <summary>
        /// Send CACP Acknowledgment back to cloud (via existing WebSocket) for audit trail.
        /// </summary>
        private async Task SendCacpAcknowledgmentAsync(string actionId, int successCount, int failureCount)
        {
            try
            {
                // Build CACP Acknowledgment JSON
                var ack = new JObject
                {
                    ["type"] = "cacp_acknowledgment",
                    ["version"] = "1.0.0",
                    ["ack_id"] = Guid.NewGuid().ToString(),
                    ["action_id"] = actionId,
                    ["timestamp"] = DateTime.UtcNow.ToString("O"),
                    ["result"] = new JObject
                    {
                        ["status"] = failureCount > 0 ? "partial" : "success",
                        ["features_drawn"] = successCount,
                        ["error_message"] = failureCount > 0 ? $"{failureCount} features failed to draw" : null
                    }
                };

                CivilAgent.SendCacpAcknowledgment(ack.ToString());
                this.LogMessage($"📤 Sent CACP Acknowledgment: {ack}");
            }
            catch (Exception ex)
            {
                this.LogMessage($"⚠ Failed to send CACP Acknowledgment: {ex.Message}");
            }
        }

        /// <summary>
        /// Validate CACP Action JSON structure (required fields only).
        /// </summary>
        private bool ValidateCacpAction(JObject action)
        {
            // Check required top-level fields
            string[] requiredFields = { "version", "action_id", "event_id", "timestamp", "instruction", "payload" };
            
            foreach (string field in requiredFields)
            {
                if (action[field] == null)
                {
                    this.LogMessage($"   ✗ Missing required field: {field}");
                    return false;
                }
            }

            // Check instruction.status enum
            string status = action["instruction"]?["status"]?.ToString();
            if (!new[] { "approved", "modified", "rejected" }.Contains(status))
            {
                this.LogMessage($"   ✗ Invalid instruction.status: {status}");
                return false;
            }

            return true;
        }

        /// <summary>
        /// Log a message to the Civil 3D console (replicates CivilAgent.PrintMessage behavior).
        /// </summary>
        private void LogMessage(string message)
        {
            _editor.WriteMessage($"\n{message}");
        }
    }
}
