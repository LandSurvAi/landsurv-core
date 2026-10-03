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
    /// <summary>CivilAgent (partial) � Layers concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Create a single layer in Civil 3D
        /// </summary>
        private string CreateLayer(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
                return "{\"success\": false, \"error\": \"No active document\"}";

            Database db = doc.Database;

            try
            {
                string layerName = args["name"]?.ToString();
                if (string.IsNullOrWhiteSpace(layerName))
                    return "{\"success\": false, \"error\": \"Layer name is required\"}";

                int color = args["color"] != null ? (int)args["color"] : 7;
                string lineType = args["lineType"]?.ToString() ?? "Continuous";
                string description = args["description"]?.ToString() ?? "";

                bool created = false;

                using (Transaction tr = db.TransactionManager.StartTransaction())
                {
                    LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;

                    if (lt.Has(layerName))
                    {
                        // Layer exists - update properties
                        LayerTableRecord layer = tr.GetObject(lt[layerName], OpenMode.ForWrite) as LayerTableRecord;
                        layer.Color = Autodesk.AutoCAD.Colors.Color.FromColorIndex(Autodesk.AutoCAD.Colors.ColorMethod.ByAci, (short)color);
                        this.PrintMessage($"  Updated layer: {layerName} (color {color})");
                    }
                    else
                    {
                        // Create new layer
                        lt.UpgradeOpen();
                        LayerTableRecord newLayer = new LayerTableRecord();
                        newLayer.Name = layerName;
                        newLayer.Color = Autodesk.AutoCAD.Colors.Color.FromColorIndex(Autodesk.AutoCAD.Colors.ColorMethod.ByAci, (short)color);
                        
                        // Set linetype if available
                        LinetypeTable ltt = tr.GetObject(db.LinetypeTableId, OpenMode.ForRead) as LinetypeTable;
                        if (ltt.Has(lineType))
                        {
                            newLayer.LinetypeObjectId = ltt[lineType];
                        }

                        lt.Add(newLayer);
                        tr.AddNewlyCreatedDBObject(newLayer, true);
                        created = true;
                        this.PrintMessage($"  Created layer: {layerName} (color {color})");
                    }

                    tr.Commit();
                }

                JObject response = new JObject();
                response["success"] = true;
                response["layerName"] = layerName;
                response["created"] = created;
                response["color"] = color;
                response["lineType"] = lineType;
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Create the Landsurv custom linetype file with complex linetypes (text embedded in lines)
        /// </summary>
        private string CreateLandsurvLinetypeFile()
        {
            // Get the Support directory from AutoCAD
            string supportPath = (string)Application.GetSystemVariable("ROAMABLEROOTPREFIX");
            string landsurvLinPath = System.IO.Path.Combine(supportPath, "Support", "landsurv.lin");
            
            // Also save to drawing directory if available
            Document doc = Application.DocumentManager.MdiActiveDocument;
            string drawingDir = null;
            if (doc != null && !string.IsNullOrEmpty(doc.Database.Filename))
            {
                drawingDir = System.IO.Path.GetDirectoryName(doc.Database.Filename);
            }

            // Complex linetype definitions with embedded text
            // Format: *NAME,Description
            //         A,pattern,["TEXT",STANDARD,S=height,R=rotation,X=xoffset,Y=yoffset]
            // Note: In C# verbatim strings, "" represents a single quote in the output
            string linContent = @";;
;; LANDSURV.LIN - Custom Complex Linetypes with Embedded Text
;; Generated by LandSurv AI CAD Manager
;; These linetypes display letters within the line pattern
;;

;; UTILITY LINETYPES - Complex with embedded text
;;
*ELECTRIC,----E----E----E----E----
A,1.0,-.25,[""E"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""E"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*WATER,----W----W----W----W----
A,1.0,-.25,[""W"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""W"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*GAS,----G----G----G----G----
A,1.0,-.25,[""G"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""G"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*SEWER,----S----S----S----S----
A,1.0,-.25,[""S"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""S"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*TELEPHONE,----T----T----T----T----
A,1.0,-.25,[""T"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""T"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*STORM,----ST----ST----ST----
A,1.0,-.35,[""ST"",STANDARD,S=.15,R=0,X=-.15,Y=-.075],-.35,1.0,-.35,[""ST"",STANDARD,S=.15,R=0,X=-.15,Y=-.075],-.35

*FIBER,----F----F----F----F----
A,1.0,-.25,[""F"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""F"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*CABLE,----C----C----C----C----
A,1.0,-.25,[""C"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""C"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*IRRIGATION,----I----I----I----I----
A,1.0,-.25,[""I"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""I"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*FUEL,----FL----FL----FL----
A,1.0,-.35,[""FL"",STANDARD,S=.15,R=0,X=-.15,Y=-.075],-.35,1.0,-.35,[""FL"",STANDARD,S=.15,R=0,X=-.15,Y=-.075],-.35

*STEAM,----SM----SM----SM----
A,1.0,-.35,[""SM"",STANDARD,S=.15,R=0,X=-.15,Y=-.075],-.35,1.0,-.35,[""SM"",STANDARD,S=.15,R=0,X=-.15,Y=-.075],-.35

;; OVERHEAD UTILITY LINETYPES
;;
*ELEC_OH,--E--OH--E--OH--E--OH--
A,.75,-.25,[""E"",STANDARD,S=.12,R=0,X=-.08,Y=-.06],-.15,[""OH"",STANDARD,S=.12,R=0,X=-.12,Y=-.06],-.25

*TELE_OH,--T--OH--T--OH--T--OH--
A,.75,-.25,[""T"",STANDARD,S=.12,R=0,X=-.08,Y=-.06],-.15,[""OH"",STANDARD,S=.12,R=0,X=-.12,Y=-.06],-.25

;; UNDERGROUND UTILITY LINETYPES
;;
*ELEC_UG,--E--UG--E--UG--E--UG--
A,.75,-.25,[""E"",STANDARD,S=.12,R=0,X=-.08,Y=-.06],-.15,[""UG"",STANDARD,S=.12,R=0,X=-.12,Y=-.06],-.25

;; PROPERTY LINETYPES
;;
*EASEMENT,----ESMT----ESMT----
A,1.25,-.5,[""ESMT"",STANDARD,S=.12,R=0,X=-.2,Y=-.06],-.5

*ROW,----ROW----ROW----ROW----
A,1.0,-.4,[""ROW"",STANDARD,S=.12,R=0,X=-.15,Y=-.06],-.4

*SETBACK,----SETB----SETB----
A,1.0,-.45,[""SETB"",STANDARD,S=.12,R=0,X=-.18,Y=-.06],-.45

;; DRAINAGE LINETYPES
;;
*DRAINAGE,----D----D----D----D----
A,1.0,-.25,[""D"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25,1.0,-.25,[""D"",STANDARD,S=.15,R=0,X=-.1,Y=-.075],-.25

*CULVERT,----CV----CV----CV----
A,1.0,-.35,[""CV"",STANDARD,S=.15,R=0,X=-.15,Y=-.075],-.35,1.0,-.35,[""CV"",STANDARD,S=.15,R=0,X=-.15,Y=-.075],-.35
";

            try
            {
                // Ensure Support directory exists
                string supportDir = System.IO.Path.GetDirectoryName(landsurvLinPath);
                if (!System.IO.Directory.Exists(supportDir))
                {
                    System.IO.Directory.CreateDirectory(supportDir);
                }
                
                // Write the linetype file
                System.IO.File.WriteAllText(landsurvLinPath, linContent);
                this.PrintMessage($"[DEBUG] Created complex linetype file: {landsurvLinPath}");

                // Also save to drawing directory if available
                if (!string.IsNullOrEmpty(drawingDir) && System.IO.Directory.Exists(drawingDir))
                {
                    string localLinPath = System.IO.Path.Combine(drawingDir, "landsurv.lin");
                    System.IO.File.WriteAllText(localLinPath, linContent);
                    this.PrintMessage($"[DEBUG] Also saved to drawing directory: {localLinPath}");
                }

                return landsurvLinPath;
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"[DEBUG] Failed to create landsurv.lin: {ex.Message}");
                // Return empty string if failed
                return "";
            }
        }

        /// <summary>
        /// Create multiple layers in a batch operation
        /// </summary>
        private string CreateLayersBatch(JObject args)
        {
            this.PrintMessage("[DEBUG] CreateLayersBatch: Starting...");
            
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                this.PrintMessage("[DEBUG] CreateLayersBatch: No active document!");
                return "{\"success\": false, \"error\": \"No active document\"}";
            }

            this.PrintMessage($"[DEBUG] CreateLayersBatch: Document = {doc.Name}");
            Database db = doc.Database;

            // Create the custom linetype file with complex linetypes (embedded text)
            string landsurvLinPath = CreateLandsurvLinetypeFile();

            try
            {
                JArray layersArray = args["layers"] as JArray;
                if (layersArray == null || layersArray.Count == 0)
                {
                    this.PrintMessage("[DEBUG] CreateLayersBatch: No layers in args!");
                    return "{\"success\": false, \"error\": \"No layers provided\"}";
                }

                int created = 0;
                int updated = 0;
                int failed = 0;

                this.PrintMessage($"Creating {layersArray.Count} layers...");

                using (doc.LockDocument())  // Lock document for editing
                {
                    this.PrintMessage("[DEBUG] CreateLayersBatch: Document locked");
                    
                    using (Transaction tr = db.TransactionManager.StartTransaction())
                    {
                        this.PrintMessage("[DEBUG] CreateLayersBatch: Transaction started");
                        
                        LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForWrite) as LayerTable;
                        LinetypeTable ltt = tr.GetObject(db.LinetypeTableId, OpenMode.ForRead) as LinetypeTable;

                        this.PrintMessage($"[DEBUG] CreateLayersBatch: LayerTable has {lt.Cast<object>().Count()} layers before");
                        
                        // Build case-insensitive linetype lookup
                        var linetypeLookup = new Dictionary<string, ObjectId>(StringComparer.OrdinalIgnoreCase);
                        foreach (ObjectId ltId in ltt)
                        {
                            LinetypeTableRecord ltr = tr.GetObject(ltId, OpenMode.ForRead) as LinetypeTableRecord;
                            if (ltr != null && !string.IsNullOrEmpty(ltr.Name))
                            {
                                linetypeLookup[ltr.Name] = ltId;
                            }
                        }
                        this.PrintMessage($"[DEBUG] Available linetypes: {string.Join(", ", linetypeLookup.Keys.Take(20))}...");

                        foreach (JObject layerDef in layersArray)
                        {
                            try
                            {
                                string layerName = layerDef["name"]?.ToString();
                                if (string.IsNullOrWhiteSpace(layerName)) continue;

                                int color = layerDef["color"] != null ? (int)layerDef["color"] : 7;
                                string lineType = layerDef["lineType"]?.ToString() ?? "Continuous";
                                
                                // Try to find linetype (case-insensitive)
                                ObjectId linetypeId = ObjectId.Null;
                                if (!string.IsNullOrEmpty(lineType) && lineType.ToUpper() != "CONTINUOUS")
                                {
                                    string ltUpper = lineType.ToUpper();
                                    
                                    // First check if already in drawing
                                    if (linetypeLookup.TryGetValue(ltUpper, out linetypeId))
                                    {
                                        this.PrintMessage($"[DEBUG] Layer {layerName}: Found linetype '{ltUpper}' in drawing");
                                    }
                                    else
                                    {
                                        // Try loading from various .lin files (landsurv.lin first for complex linetypes)
                                        var linFiles = new List<string>();
                                        if (!string.IsNullOrEmpty(landsurvLinPath) && System.IO.File.Exists(landsurvLinPath))
                                        {
                                            linFiles.Add(landsurvLinPath);
                                        }
                                        // Also check drawing directory
                                        string drawingDir = System.IO.Path.GetDirectoryName(doc.Database.Filename);
                                        if (!string.IsNullOrEmpty(drawingDir))
                                        {
                                            string localLin = System.IO.Path.Combine(drawingDir, "landsurv.lin");
                                            if (System.IO.File.Exists(localLin) && !linFiles.Contains(localLin))
                                            {
                                                linFiles.Add(localLin);
                                            }
                                        }
                                        linFiles.AddRange(new[] { "acad.lin", "acadiso.lin", "ltypeshp.lin" });
                                        bool loaded = false;
                                        
                                        foreach (string linFile in linFiles)
                                        {
                                            if (loaded) break;
                                            try
                                            {
                                                db.LoadLineTypeFile(ltUpper, linFile);
                                                // Check if it loaded
                                                LinetypeTable lttRefresh = tr.GetObject(db.LinetypeTableId, OpenMode.ForRead) as LinetypeTable;
                                                if (lttRefresh.Has(ltUpper))
                                                {
                                                    linetypeId = lttRefresh[ltUpper];
                                                    linetypeLookup[ltUpper] = linetypeId;
                                                    this.PrintMessage($"[DEBUG] Layer {layerName}: Loaded linetype '{ltUpper}' from {linFile}");
                                                    loaded = true;
                                                }
                                            }
                                            catch { /* Not in this file */ }
                                        }
                                        
                                        if (!loaded)
                                        {
                                            this.PrintMessage($"[DEBUG] Layer {layerName}: Linetype '{ltUpper}' not found in any .lin file");
                                        }
                                    }
                                }

                                if (lt.Has(layerName))
                                {
                                    // Update existing layer (color and linetype)
                                    LayerTableRecord layer = tr.GetObject(lt[layerName], OpenMode.ForWrite) as LayerTableRecord;
                                    layer.Color = Autodesk.AutoCAD.Colors.Color.FromColorIndex(Autodesk.AutoCAD.Colors.ColorMethod.ByAci, (short)color);
                                    
                                    // Set linetype if we found one
                                    if (linetypeId != ObjectId.Null)
                                    {
                                        layer.LinetypeObjectId = linetypeId;
                                        this.PrintMessage($"[DEBUG] Layer {layerName}: Set linetype to '{lineType}'");
                                    }
                                    updated++;
                                }
                                else
                                {
                                    // Create new layer
                                    LayerTableRecord newLayer = new LayerTableRecord();
                                    newLayer.Name = layerName;
                                    newLayer.Color = Autodesk.AutoCAD.Colors.Color.FromColorIndex(Autodesk.AutoCAD.Colors.ColorMethod.ByAci, (short)color);
                                    
                                    // Set linetype if we found one
                                    if (linetypeId != ObjectId.Null)
                                    {
                                        newLayer.LinetypeObjectId = linetypeId;
                                        this.PrintMessage($"[DEBUG] Layer {layerName}: Set linetype to '{lineType}'");
                                    }

                                    lt.Add(newLayer);
                                    tr.AddNewlyCreatedDBObject(newLayer, true);
                                    created++;
                                }
                            }
                            catch (System.Exception layerEx)
                            {
                                this.PrintMessage($"[DEBUG] Layer creation error: {layerEx.Message}");
                                failed++;
                            }
                        }

                        this.PrintMessage($"[DEBUG] CreateLayersBatch: Committing transaction (created={created}, updated={updated}, failed={failed})");
                        tr.Commit();
                        this.PrintMessage("[DEBUG] CreateLayersBatch: Transaction committed!");
                    }
                }

                JObject response = new JObject();
                response["success"] = true;
                response["created"] = created;
                response["updated"] = updated;
                response["failed"] = failed;
                response["total"] = layersArray.Count;
                response["message"] = $"Layers: {created} created, {updated} updated, {failed} failed";

                this.PrintMessage($"✓ Layers batch complete: {created} created, {updated} updated, {failed} failed");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Load linetypes into the drawing's linetype table
        /// Also saves .lin file to drawing directory for persistence
        /// </summary>
        private string LoadLinetypes(JObject args)
        {
            this.PrintMessage("[DEBUG] LoadLinetypes: Starting...");
            
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                this.PrintMessage("[DEBUG] LoadLinetypes: No active document!");
                return "{\"success\": false, \"error\": \"No active document\"}";
            }

            Database db = doc.Database;

            try
            {
                JArray linetypesArray = args["linetypes"] as JArray;
                bool saveToFile = args["saveToFile"]?.ToObject<bool>() ?? true;
                string fileName = args["fileName"]?.ToString() ?? "custom_linetypes.lin";

                if (linetypesArray == null || linetypesArray.Count == 0)
                {
                    this.PrintMessage("[DEBUG] LoadLinetypes: No linetypes in args!");
                    return "{\"success\": false, \"error\": \"No linetypes provided\"}";
                }

                int loaded = 0;
                int alreadyExists = 0;
                int failed = 0;

                this.PrintMessage($"Loading {linetypesArray.Count} linetypes...");

                // Build .lin file content
                var linFileContent = new System.Text.StringBuilder();
                linFileContent.AppendLine(";;");
                linFileContent.AppendLine(";; Custom Linetypes - Generated by Landsurv AI CAD Manager");
                linFileContent.AppendLine($";; Created: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                linFileContent.AppendLine(";;");
                linFileContent.AppendLine();

                foreach (JObject ltDef in linetypesArray)
                {
                    string name = ltDef["name"]?.ToString()?.ToUpper();
                    string description = ltDef["description"]?.ToString() ?? "";
                    JArray patternArray = ltDef["pattern"] as JArray;
                    bool isComplex = ltDef["isComplex"]?.ToObject<bool>() ?? false;

                    if (string.IsNullOrWhiteSpace(name))
                    {
                        failed++;
                        continue;
                    }

                    // Build pattern string
                    string patternStr = "A";
                    if (patternArray != null && patternArray.Count > 0)
                    {
                        foreach (var element in patternArray)
                        {
                            patternStr += "," + element.ToString();
                        }
                    }
                    else
                    {
                        // Default to continuous if no pattern
                        patternStr = "";
                    }

                    // Add to .lin file content
                    linFileContent.AppendLine($"*{name},{description}");
                    if (!string.IsNullOrEmpty(patternStr))
                    {
                        linFileContent.AppendLine(patternStr);
                    }
                    else
                    {
                        linFileContent.AppendLine("A,0");
                    }
                    linFileContent.AppendLine();
                }

                // Save .lin file to drawing directory
                string linFilePath = "";
                if (saveToFile)
                {
                    string drawingPath = doc.Database.Filename;
                    string drawingDir = System.IO.Path.GetDirectoryName(drawingPath);
                    if (!string.IsNullOrEmpty(drawingDir))
                    {
                        linFilePath = System.IO.Path.Combine(drawingDir, fileName);
                        System.IO.File.WriteAllText(linFilePath, linFileContent.ToString());
                        this.PrintMessage($"✓ Linetype file saved: {linFilePath}");
                    }
                }

                // Load linetypes from file into drawing
                using (doc.LockDocument())
                {
                    using (Transaction tr = db.TransactionManager.StartTransaction())
                    {
                        LinetypeTable ltt = tr.GetObject(db.LinetypeTableId, OpenMode.ForRead) as LinetypeTable;

                        // If we saved a file, try to load from it
                        if (!string.IsNullOrEmpty(linFilePath) && System.IO.File.Exists(linFilePath))
                        {
                            foreach (JObject ltDef in linetypesArray)
                            {
                                string name = ltDef["name"]?.ToString()?.ToUpper();
                                if (string.IsNullOrWhiteSpace(name)) continue;

                                try
                                {
                                    if (ltt.Has(name))
                                    {
                                        alreadyExists++;
                                        this.PrintMessage($"  Linetype exists: {name}");
                                    }
                                    else
                                    {
                                        // Load from file
                                        db.LoadLineTypeFile(name, linFilePath);
                                        loaded++;
                                        this.PrintMessage($"  Loaded linetype: {name}");
                                    }
                                }
                                catch (System.Exception ltEx)
                                {
                                    this.PrintMessage($"  Failed to load linetype {name}: {ltEx.Message}");
                                    failed++;
                                }
                            }
                        }

                        tr.Commit();
                    }
                }

                JObject response = new JObject();
                response["success"] = true;
                response["loaded"] = loaded;
                response["alreadyExists"] = alreadyExists;
                response["failed"] = failed;
                response["total"] = linetypesArray.Count;
                response["linFilePath"] = linFilePath;
                response["message"] = $"Linetypes: {loaded} loaded, {alreadyExists} already exist, {failed} failed";

                this.PrintMessage($"✓ Linetypes complete: {loaded} loaded, {alreadyExists} exist, {failed} failed");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"LoadLinetypes error: {ex.Message}");
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

    }
}