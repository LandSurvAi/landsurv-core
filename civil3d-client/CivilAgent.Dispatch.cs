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
    /// <summary>CivilAgent (partial) � Dispatch concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Execute a command from the AI server
        /// </summary>
        private void ExecuteCommand(string tool, JObject args, string requestId)
        {
            try
            {
                string result = "";
                bool success = false;

                switch (tool)
                {
                    case "create_cogo_point":
                        {
                            result = CreateCogoPoint(args);
                            success = true;
                            break;
                        }

                    case "create_line_segment":
                        {
                            result = CreateLineSegment(args);
                            success = true;
                            break;
                        }

                    case "get_drawing_info":
                        {
                            result = GetDrawingInfo();
                            success = true;
                            break;
                        }

                    case "get_survey_codes":
                        {
                            result = GetSurveyCodes();
                            success = true;
                            break;
                        }

                    case "apply_code_aliases":
                        {
                            result = ApplyCodeAliases(args);
                            success = true;
                            break;
                        }

                    case "create_layer":
                        {
                            result = CreateLayer(args);
                            success = true;
                            break;
                        }

                    case "create_layers_batch":
                        {
                            result = CreateLayersBatch(args);
                            success = true;
                            break;
                        }

                    case "create_description_key_set":
                        {
                            result = CreateDescriptionKeySet(args);
                            success = true;
                            break;
                        }

                    case "create_layer_legend":
                        {
                            result = CreateLayerLegend(args);
                            success = true;
                            break;
                        }

                    case "load_linetypes":
                        {
                            result = LoadLinetypes(args);
                            success = true;
                            break;
                        }

                    case "import_deed_polyline":
                        {
                            this.PrintMessage("→ import_deed_polyline case reached");
                            result = ImportDeedPolyline(args);
                            success = true;
                            break;
                        }

                    case "import_deed_wysiwyg":
                        {
                            this.PrintMessage("→ import_deed_wysiwyg case reached");
                            result = ImportDeedWysiwyg(args);
                            success = true;
                            break;
                        }

                    case "get_cogo_points":
                        {
                            this.PrintMessage("→ get_cogo_points case reached");
                            result = GetCogoPoints(args);
                            success = true;
                            break;
                        }

                    case "sync_points_batch":
                        {
                            this.PrintMessage("→ sync_points_batch case reached");
                            result = SyncPointsBatch(args);
                            success = true;
                            break;
                        }

                    case "delete_cogo_points":
                        {
                            this.PrintMessage("→ delete_cogo_points case reached");
                            result = DeleteCogoPoints(args);
                            success = true;
                            break;
                        }

                    case "get_open_drawings":
                        {
                            this.PrintMessage("→ get_open_drawings case reached");
                            result = GetOpenDrawings();
                            success = true;
                            break;
                        }

                    case "get_layers_from_drawing":
                        {
                            this.PrintMessage("→ get_layers_from_drawing case reached");
                            result = GetLayersFromDrawing(args);
                            success = true;
                            break;
                        }

                    case "set_active_drawing":
                        {
                            this.PrintMessage("→ set_active_drawing case reached");
                            result = SetActiveDrawing(args);
                            success = true;
                            break;
                        }

                    case "get_sync_snapshot":
                        {
                            this.PrintMessage("→ get_sync_snapshot case reached");
                            result = GetSyncSnapshotJson();
                            success = true;
                            break;
                        }

                    case "sync_apply":
                        {
                            this.PrintMessage("→ sync_apply case reached");
                            result = SyncApplyFromWebapp(args, requestId);
                            success = true;
                            break;
                        }

                    case "sync_cancel":
                        {
                            _syncApplyCts?.Cancel();
                            result = "{\"success\": true, \"message\": \"Sync cancel requested\"}";
                            success = true;
                            break;
                        }

                    // ── Agentic C3D tools (connector overhaul Phase 3 / dll-tool-expansion) ──
                    case "count_entities":
                        {
                            this.PrintMessage("→ count_entities case reached");
                            result = CountEntities(args);
                            success = true;
                            break;
                        }

                    case "add_point_labels":
                        {
                            this.PrintMessage("→ add_point_labels case reached");
                            result = AddPointLabels(args);
                            success = true;
                            break;
                        }

                    case "insert_blocks":
                        {
                            this.PrintMessage("→ insert_blocks case reached");
                            result = InsertBlocks(args);
                            success = true;
                            break;
                        }

                    case "create_polyline_batch":
                        {
                            this.PrintMessage("→ create_polyline_batch case reached");
                            result = CreatePolylineBatch(args);
                            success = true;
                            break;
                        }

                    case "list_layers":
                        {
                            this.PrintMessage("→ list_layers case reached");
                            result = ListLayersAgent();
                            success = true;
                            break;
                        }

                    case "create_layers_agent":
                        {
                            this.PrintMessage("→ create_layers_agent case reached");
                            result = CreateLayersAgent(args);
                            success = true;
                            break;
                        }

                    case "delete_layers_agent":
                        {
                            this.PrintMessage("→ delete_layers_agent case reached");
                            result = DeleteLayersAgent(args);
                            success = true;
                            break;
                        }

                    default:
                        {
                            result = $"Unknown tool: {tool}";
                            success = false;
                            break;
                        }
                }

                // Send result back to server
                SendToolResult(requestId, result, success);
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"Command execution error: {ex.Message}");
                SendToolResult(requestId, $"Error: {ex.Message}", false);
            }
        }

        /// <summary>
        /// Get information about the current drawing
        /// </summary>
        private string GetDrawingInfo()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
                return "No active document";

            Database db = doc.Database;
            return $"Drawing: {doc.Name}, Units: {db.Ucsname}";
        }

        /// <summary>
        /// Send tool execution result back to the server
        /// </summary>
        private void SendToolResult(string requestId, string result, bool success)
        {
            try
            {
                JObject resultMessage = new JObject();
                resultMessage["type"] = "result";
                resultMessage["requestId"] = requestId;
                resultMessage["data"] = new JObject
                {
                    ["success"] = success,
                    ["message"] = result,
                    ["timestamp"] = DateTime.UtcNow.ToString("O")
                };

                string json = resultMessage.ToString();
                SendWebSocketMessage(json);
                this.PrintMessage($"→ Result sent for request {requestId}");
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"Error sending result: {ex.Message}");
            }
        }

        /// <summary>
        /// Helper method to print messages to the editor
        /// </summary>
        private void PrintMessage(string message)
        {
            try
            {
                if (_editor != null)
                {
                    _editor.WriteMessage($"\n[Landsurv] {message}");
                }
            }
            catch
            {
                System.Diagnostics.Debug.WriteLine(message);
            }
        }

        /// <summary>
        /// Configuration command: Set session token and other settings
        /// Command: "LandsurvConfig"
        /// </summary>
        [CommandMethod("LandsurvConfig")]
        public void ConfigureLandsurvAI()
        {
            try
            {
                // Show settings form dialog for Google API Key
                SettingsForm settingsForm = new SettingsForm();
                settingsForm.ShowDialog();
            }
            catch (System.Exception ex)
            {
                System.Windows.Forms.MessageBox.Show($"Configuration error: {ex.Message}");
            }
        }

        /// <summary>
        /// Status command: Check connection status
        /// Command: "LandsurvStatus"
        /// </summary>
        [CommandMethod("LandsurvStatus")]
        public void CheckLandsurvStatus()
        {
            try
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc == null) return;

                _editor = doc.Editor;
                var config = ConfigurationManager.Instance;

                string sessionToken = config.Get("SessionToken", "");
                string serverUrl = config.Get("ServerUrl", SERVER_URL);

                this.PrintMessage("╔════════════════════════════════════════════════════════════╗");
                this.PrintMessage("║  LANDSURV.AI STATUS                                        ║");
                this.PrintMessage("╠════════════════════════════════════════════════════════════╣");
                this.PrintMessage($"║  Connected: {(_isConnected ? "Yes ✓" : "No ✗")}");
                this.PrintMessage($"║  Session ID: {_sessionId ?? "(none)"}");
                this.PrintMessage($"║  Token: {(string.IsNullOrEmpty(sessionToken) ? "(not set)" : sessionToken)}");
                this.PrintMessage($"║  Server: {serverUrl}");
                this.PrintMessage("╚════════════════════════════════════════════════════════════╝");

                if (!_isConnected && !string.IsNullOrWhiteSpace(sessionToken))
                {
                    this.PrintMessage("Run LANDSURVAI to connect.");
                }
                else if (string.IsNullOrWhiteSpace(sessionToken))
                {
                    this.PrintMessage("Run LANDSURVCONFIG to set your session token.");
                }
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"Status error: {ex.Message}");
            }
        }

    }
}