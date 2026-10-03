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
    /// <summary>CivilAgent (partial) � Standards concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Extract survey codes from the current drawing
        /// Used by CAD Manager for code matching
        /// </summary>
        private string GetSurveyCodes()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
                return "{\"success\": false, \"error\": \"No active document\"}";

            Database db = doc.Database;
            HashSet<string> uniqueCodes = new HashSet<string>();
            Dictionary<string, int> codeFrequency = new Dictionary<string, int>();

            try
            {
                using (Transaction tr = db.TransactionManager.StartTransaction())
                {
                    // Scan all entities in model space for point descriptions
                    BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                    BlockTableRecord modelSpace = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead) as BlockTableRecord;

                    foreach (ObjectId objId in modelSpace)
                    {
                        Entity ent = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                        if (ent == null) continue;

                        // Extract code from layer name (common pattern)
                        string layer = ent.Layer;
                        if (!string.IsNullOrWhiteSpace(layer) && !layer.Equals("0"))
                        {
                            if (uniqueCodes.Add(layer))
                                codeFrequency[layer] = 1;
                            else
                                codeFrequency[layer]++;
                        }

                        // Check for extended data (XData) with survey codes
                        ResultBuffer xdata = ent.XData;
                        if (xdata != null)
                        {
                            foreach (TypedValue tv in xdata)
                            {
                                if (tv.TypeCode == (int)DxfCode.Text && tv.Value != null)
                                {
                                    string code = tv.Value.ToString().Trim();
                                    if (!string.IsNullOrWhiteSpace(code))
                                    {
                                        if (uniqueCodes.Add(code))
                                            codeFrequency[code] = 1;
                                        else
                                            codeFrequency[code]++;
                                    }
                                }
                            }
                        }

                        // For DBText entities, check for point description patterns
                        if (ent is DBText dbText)
                        {
                            string text = dbText.TextString?.Trim();
                            // Look for common survey code patterns (e.g., "PL", "RW", "DP-001")
                            if (!string.IsNullOrWhiteSpace(text) && text.Length <= 20 && !text.Contains(" "))
                            {
                                if (uniqueCodes.Add(text))
                                    codeFrequency[text] = 1;
                                else
                                    codeFrequency[text]++;
                            }
                        }
                    }

                    tr.Commit();
                }

                // Build JSON response
                JObject response = new JObject();
                response["success"] = true;
                response["drawingName"] = doc.Name;
                response["totalCodes"] = uniqueCodes.Count;

                JArray codesArray = new JArray();
                foreach (var kvp in codeFrequency)
                {
                    codesArray.Add(new JObject
                    {
                        ["code"] = kvp.Key,
                        ["frequency"] = kvp.Value
                    });
                }
                response["codes"] = codesArray;

                this.PrintMessage($"✓ Extracted {uniqueCodes.Count} unique codes from drawing");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Apply code aliases to the current drawing
        /// Updates layer names and entity properties based on confirmed mappings
        /// </summary>
        private string ApplyCodeAliases(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
                return "{\"success\": false, \"error\": \"No active document\"}";

            Database db = doc.Database;
            int layersRenamed = 0;
            int entitiesUpdated = 0;

            try
            {
                // Parse aliases from args
                JArray aliasesArray = args["aliases"] as JArray;
                if (aliasesArray == null || aliasesArray.Count == 0)
                    return "{\"success\": false, \"error\": \"No aliases provided\"}";

                Dictionary<string, string> aliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (JObject alias in aliasesArray)
                {
                    string unknownCode = alias["unknownCode"]?.ToString();
                    string masterCode = alias["masterCode"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(unknownCode) && !string.IsNullOrWhiteSpace(masterCode))
                    {
                        aliases[unknownCode] = masterCode;
                    }
                }

                this.PrintMessage($"Applying {aliases.Count} code aliases...");

                using (Transaction tr = db.TransactionManager.StartTransaction())
                {
                    // Update layer names
                    LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;
                    foreach (ObjectId layerId in lt)
                    {
                        LayerTableRecord layer = tr.GetObject(layerId, OpenMode.ForRead) as LayerTableRecord;
                        if (layer == null || layer.Name == "0") continue;

                        if (aliases.TryGetValue(layer.Name, out string masterCode))
                        {
                            // Check if target layer exists
                            if (!lt.Has(masterCode))
                            {
                                // Rename layer
                                layer.UpgradeOpen();
                                string oldName = layer.Name;
                                layer.Name = masterCode;
                                layersRenamed++;
                                this.PrintMessage($"  Layer: {oldName} → {masterCode}");
                            }
                            else
                            {
                                // Move entities to existing layer
                                BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                                BlockTableRecord modelSpace = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead) as BlockTableRecord;

                                foreach (ObjectId objId in modelSpace)
                                {
                                    Entity ent = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                                    if (ent != null && ent.Layer.Equals(layer.Name, StringComparison.OrdinalIgnoreCase))
                                    {
                                        ent.UpgradeOpen();
                                        ent.Layer = masterCode;
                                        entitiesUpdated++;
                                    }
                                }
                            }
                        }
                    }

                    tr.Commit();
                }

                JObject response = new JObject();
                response["success"] = true;
                response["layersRenamed"] = layersRenamed;
                response["entitiesUpdated"] = entitiesUpdated;
                response["message"] = $"Applied {aliases.Count} aliases: {layersRenamed} layers renamed, {entitiesUpdated} entities updated";

                this.PrintMessage($"✓ Code aliases applied: {layersRenamed} layers, {entitiesUpdated} entities");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Create a Description Key Set in Civil 3D
        /// Description Key Sets are used for Field-to-Finish to map codes to layers/styles
        /// Location in C3D: Settings > Point > Description Key Sets
        /// </summary>
        private string CreateDescriptionKeySet(JObject args)
        {
            this.PrintMessage("[DEBUG] CreateDescriptionKeySet: Starting...");
            
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                this.PrintMessage("[DEBUG] CreateDescriptionKeySet: No active document!");
                return "{\"success\": false, \"error\": \"No active document\"}";
            }

            try
            {
                string keySetName = args["name"]?.ToString() ?? "CAD Manager Keys";
                string keySetDescription = args["description"]?.ToString() ?? "";
                JArray keysArray = args["keys"] as JArray;
                
                if (keysArray == null || keysArray.Count == 0)
                {
                    this.PrintMessage("[DEBUG] CreateDescriptionKeySet: No keys in args!");
                    return "{\"success\": false, \"error\": \"No description keys provided\"}";
                }

                this.PrintMessage($"Creating Description Key Set '{keySetName}' with {keysArray.Count} keys...");

                // Note: Creating Description Key Sets requires Civil 3D API
                // This is a placeholder that logs the keys and saves them to a file
                // When Civil 3D references are enabled, this will create actual keys
                
                int keysProcessed = 0;
                var keyList = new List<string>();
                
                foreach (JObject keyDef in keysArray)
                {
                    string code = keyDef["code"]?.ToString();
                    string pointLayer = keyDef["pointLayer"]?.ToString();
                    string lineLayer = keyDef["lineLayer"]?.ToString();
                    string pointStyle = keyDef["pointStyle"]?.ToString() ?? "Standard";
                    
                    if (string.IsNullOrWhiteSpace(code)) continue;
                    
                    keyList.Add($"  {code} -> {pointLayer}" + (lineLayer != null ? $" / {lineLayer}" : ""));
                    keysProcessed++;
                }

                // Log keys to command line
                this.PrintMessage($"Description Key Set: {keySetName}");
                foreach (var key in keyList.Take(10))
                {
                    this.PrintMessage(key);
                }
                if (keyList.Count > 10)
                {
                    this.PrintMessage($"  ... and {keyList.Count - 10} more keys");
                }

                // Save to a JSON file in the drawing directory for manual import
                string drawingPath = doc.Database.Filename;
                string drawingDir = System.IO.Path.GetDirectoryName(drawingPath);
                if (!string.IsNullOrEmpty(drawingDir))
                {
                    string outputPath = System.IO.Path.Combine(drawingDir, $"{keySetName.Replace(" ", "_")}_DescriptionKeys.json");
                    System.IO.File.WriteAllText(outputPath, args.ToString());
                    this.PrintMessage($"✓ Keys saved to: {outputPath}");
                }

                /* 
                // Civil 3D API Implementation (requires Autodesk.Civil references)
                // Uncomment when Civil 3D references are properly configured
                
                using (doc.LockDocument())
                {
                    CivilDocument civDoc = CivilApplication.ActiveDocument;
                    var settings = civDoc.Settings;
                    
                    // Create or get description key set
                    DescriptionKeySetStyle keySet = null;
                    // ... implementation with Civil 3D Settings API
                }
                */

                JObject response = new JObject();
                response["success"] = true;
                response["keySetName"] = keySetName;
                response["created"] = true;
                response["keysAdded"] = keysProcessed;
                response["keysUpdated"] = 0;
                response["totalKeys"] = keysProcessed;
                response["message"] = $"Description Key Set '{keySetName}' prepared with {keysProcessed} keys. JSON file saved to drawing directory.";
                response["note"] = "Full Description Key Set creation requires Civil 3D API integration. JSON file can be imported manually.";

                this.PrintMessage($"✓ Description Key Set prepared: {keysProcessed} keys");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"[DEBUG] CreateDescriptionKeySet error: {ex.Message}");
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

    }
}