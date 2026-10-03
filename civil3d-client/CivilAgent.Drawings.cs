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
    /// <summary>CivilAgent (partial) � Drawings concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Get list of all open drawings in Civil 3D
        /// </summary>
        private string GetOpenDrawings()
        {
            try
            {
                List<JObject> drawings = new List<JObject>();
                DocumentCollection docMgr = Application.DocumentManager;
                Document activeDoc = docMgr.MdiActiveDocument;
                
                foreach (Document doc in docMgr)
                {
                    if (doc == null) continue;
                    
                    JObject drawingInfo = new JObject();
                    drawingInfo["name"] = System.IO.Path.GetFileName(doc.Name);
                    drawingInfo["fullPath"] = doc.Name;
                    drawingInfo["isActive"] = (doc == activeDoc);
                    drawingInfo["isReadOnly"] = doc.IsReadOnly;
                    
                    // Get layer count
                    try
                    {
                        using (doc.LockDocument())
                        {
                            Database db = doc.Database;
                            using (Transaction tr = db.TransactionManager.StartTransaction())
                            {
                                LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;
                                int layerCount = 0;
                                foreach (ObjectId id in lt) layerCount++;
                                drawingInfo["layerCount"] = layerCount;
                                tr.Commit();
                            }
                        }
                    }
                    catch
                    {
                        drawingInfo["layerCount"] = -1;
                    }
                    
                    drawings.Add(drawingInfo);
                }
                
                JObject response = new JObject();
                response["success"] = true;
                response["drawings"] = new JArray(drawings);
                response["count"] = drawings.Count;
                
                this.PrintMessage($"✓ Found {drawings.Count} open drawings");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Get all layers from a specific drawing (by name or active document)
        /// </summary>
        private string GetLayersFromDrawing(JObject args)
        {
            try
            {
                string drawingName = args?["drawingName"]?.ToString();
                bool includeDetails = args?["includeDetails"]?.ToObject<bool>() ?? true;
                
                Document targetDoc = null;
                DocumentCollection docMgr = Application.DocumentManager;
                
                // Find the target document
                if (string.IsNullOrEmpty(drawingName))
                {
                    targetDoc = docMgr.MdiActiveDocument;
                }
                else
                {
                    foreach (Document doc in docMgr)
                    {
                        if (doc != null && 
                            (doc.Name.Equals(drawingName, StringComparison.OrdinalIgnoreCase) ||
                             System.IO.Path.GetFileName(doc.Name).Equals(drawingName, StringComparison.OrdinalIgnoreCase)))
                        {
                            targetDoc = doc;
                            break;
                        }
                    }
                }
                
                if (targetDoc == null)
                {
                    return $"{{\"success\": false, \"error\": \"Drawing not found: {drawingName}\"}}";
                }
                
                List<JObject> layers = new List<JObject>();
                
                using (targetDoc.LockDocument())
                {
                    Database db = targetDoc.Database;
                    using (Transaction tr = db.TransactionManager.StartTransaction())
                    {
                        LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;
                        LinetypeTable ltt = tr.GetObject(db.LinetypeTableId, OpenMode.ForRead) as LinetypeTable;
                        
                        foreach (ObjectId layerId in lt)
                        {
                            LayerTableRecord layer = tr.GetObject(layerId, OpenMode.ForRead) as LayerTableRecord;
                            if (layer == null) continue;
                            
                            JObject layerInfo = new JObject();
                            layerInfo["name"] = layer.Name;
                            
                            if (includeDetails)
                            {
                                // Get color
                                layerInfo["colorIndex"] = layer.Color.ColorIndex;
                                layerInfo["colorRgb"] = layer.Color.ColorValue.ToArgb().ToString("X8");
                                
                                // Get linetype name
                                string linetypeName = "Continuous";
                                try
                                {
                                    LinetypeTableRecord ltr = tr.GetObject(layer.LinetypeObjectId, OpenMode.ForRead) as LinetypeTableRecord;
                                    if (ltr != null) linetypeName = ltr.Name;
                                }
                                catch { }
                                layerInfo["linetype"] = linetypeName;
                                
                                // Get lineweight
                                layerInfo["lineWeight"] = layer.LineWeight.ToString();
                                
                                // Status flags
                                layerInfo["isOff"] = layer.IsOff;
                                layerInfo["isFrozen"] = layer.IsFrozen;
                                layerInfo["isLocked"] = layer.IsLocked;
                                layerInfo["isPlottable"] = layer.IsPlottable;
                                
                                // Description (if available via XData)
                                layerInfo["description"] = layer.Description ?? "";
                            }
                            
                            layers.Add(layerInfo);
                        }
                        
                        tr.Commit();
                    }
                }
                
                // Sort layers alphabetically
                layers.Sort((a, b) => string.Compare(a["name"]?.ToString(), b["name"]?.ToString(), StringComparison.OrdinalIgnoreCase));
                
                JObject response = new JObject();
                response["success"] = true;
                response["drawingName"] = System.IO.Path.GetFileName(targetDoc.Name);
                response["drawingPath"] = targetDoc.Name;
                response["layers"] = new JArray(layers);
                response["count"] = layers.Count;
                
                this.PrintMessage($"✓ Retrieved {layers.Count} layers from {System.IO.Path.GetFileName(targetDoc.Name)}");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Set the active drawing by name
        /// </summary>
        private string SetActiveDrawing(JObject args)
        {
            try
            {
                string drawingName = args?["drawingName"]?.ToString();
                
                if (string.IsNullOrEmpty(drawingName))
                {
                    return "{\"success\": false, \"error\": \"drawingName is required\"}";
                }
                
                Document targetDoc = null;
                DocumentCollection docMgr = Application.DocumentManager;
                
                foreach (Document doc in docMgr)
                {
                    if (doc != null && 
                        (doc.Name.Equals(drawingName, StringComparison.OrdinalIgnoreCase) ||
                         System.IO.Path.GetFileName(doc.Name).Equals(drawingName, StringComparison.OrdinalIgnoreCase)))
                    {
                        targetDoc = doc;
                        break;
                    }
                }
                
                if (targetDoc == null)
                {
                    return $"{{\"success\": false, \"error\": \"Drawing not found: {drawingName}\"}}";
                }
                
                // Set as active document
                docMgr.MdiActiveDocument = targetDoc;
                
                JObject response = new JObject();
                response["success"] = true;
                response["activeDrawing"] = System.IO.Path.GetFileName(targetDoc.Name);
                response["message"] = $"Active drawing set to: {System.IO.Path.GetFileName(targetDoc.Name)}";
                
                this.PrintMessage($"✓ Active drawing: {System.IO.Path.GetFileName(targetDoc.Name)}");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Refresh the drawings list in the chat form
        /// Called when user clicks refresh or on initial show
        /// NOTE: Cannot use Editor.WriteMessage here - called from WinForms event handler
        /// </summary>
        private static void RefreshDrawingsList()
        {
            try
            {
                if (_chatForm == null || _chatForm.IsDisposed) return;
                
                List<DrawingItem> drawings = new List<DrawingItem>();
                DocumentCollection docMgr = Application.DocumentManager;
                Document activeDoc = docMgr.MdiActiveDocument;
                
                foreach (Document doc in docMgr)
                {
                    if (doc == null) continue;
                    
                    int layerCount = -1;
                    try
                    {
                        // Get layer count (skip lock for performance)
                        Database db = doc.Database;
                        using (Transaction tr = db.TransactionManager.StartOpenCloseTransaction())
                        {
                            LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;
                            foreach (ObjectId id in lt) layerCount++;
                            // Don't commit - read-only
                        }
                    }
                    catch { }
                    
                    drawings.Add(new DrawingItem
                    {
                        Name = System.IO.Path.GetFileName(doc.Name),
                        FullPath = doc.Name,
                        IsActive = (doc == activeDoc),
                        LayerCount = layerCount
                    });
                }
                
                _chatForm.UpdateDrawingsList(drawings);
                _chatForm.AddMessage("System", $"Found {drawings.Count} open drawing(s)");
                PushDrawingsToWebapp(drawings);
            }
            catch (System.Exception ex)
            {
                if (_chatForm != null && !_chatForm.IsDisposed)
                {
                    _chatForm.AddMessage("System", $"Error refreshing drawings: {ex.Message}");
                }
            }
        }

        /// <summary>Push the current drawing list to the webapp so the header can
        /// mirror the active drawing + available drawings (like the DLL selector).</summary>
        private static void PushDrawingsToWebapp(List<DrawingItem> drawings)
        {
            try
            {
                if (_webSocket == null || _webSocket.State != WebSocketState.Open) return;
                var arr = new JArray();
                foreach (var d in drawings)
                {
                    arr.Add(new JObject
                    {
                        ["name"] = d.Name,
                        ["fullPath"] = d.FullPath,
                        ["isActive"] = d.IsActive,
                        ["layerCount"] = d.LayerCount,
                    });
                }
                SendWebSocketMessage(new JObject
                {
                    ["type"] = "drawings_update",
                    ["drawings"] = arr,
                    ["timestamp"] = DateTime.UtcNow.ToString("O"),
                }.ToString());
            }
            catch { /* non-fatal mirror */ }
        }

        /// <summary>
        /// Set the active drawing by full path (called from ChatForm drawing selector)
        /// NOTE: Cannot use Editor.WriteMessage here - called from WinForms event handler
        /// </summary>
        private static void SetActiveDrawingByPath(string drawingPath)
        {
            try
            {
                if (string.IsNullOrEmpty(drawingPath)) return;
                
                DocumentCollection docMgr = Application.DocumentManager;
                
                foreach (Document doc in docMgr)
                {
                    if (doc != null && doc.Name.Equals(drawingPath, StringComparison.OrdinalIgnoreCase))
                    {
                        docMgr.MdiActiveDocument = doc;
                        
                        if (_chatForm != null && !_chatForm.IsDisposed)
                        {
                            _chatForm.AddMessage("System", $"Active drawing: {System.IO.Path.GetFileName(doc.Name)}");
                        }
                        
                        // Refresh the list to update the active marker
                        RefreshDrawingsList();
                        return;
                    }
                }
                
                if (_chatForm != null && !_chatForm.IsDisposed)
                {
                    _chatForm.AddMessage("System", $"Drawing not found: {System.IO.Path.GetFileName(drawingPath)}");
                }
            }
            catch (System.Exception ex)
            {
                if (_chatForm != null && !_chatForm.IsDisposed)
                {
                    _chatForm.AddMessage("System", $"Error switching drawing: {ex.Message}");
                }
            }
        }

    }
}