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
    /// <summary>CivilAgent (partial) � Points concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Create a COGO point in Civil 3D
        /// Proof of Concept implementation
        /// </summary>
        private string CreateCogoPoint(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            Editor ed = doc.Editor;

            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    // Get parameters from args
                    double easting = (double)args["easting"];
                    double northing = (double)args["northing"];
                    double elevation = args["elevation"] != null ? (double)args["elevation"] : 0.0;
                    string description = args["rawDescription"]?.ToString() ?? "";

                    // Civil 3D functionality temporarily disabled
                    // Requires Autodesk.Civil.DatabaseServices namespace
                    /*
                    CivilDocument civDoc = CivilApplication.ActiveDocument;
                    ObjectId pointSetId = civDoc.GetPointSetIds()[0];
                    CogoPointSet pointSet = (CogoPointSet)tr.GetObject(pointSetId, OpenMode.ForWrite);
                    ObjectId pointId = pointSet.AddPoint(easting, northing, elevation, description, null);
                    CogoPoint pt = (CogoPoint)tr.GetObject(pointId, OpenMode.ForRead);
                    this.PrintMessage($"✓ Created point: {pt.PointNumber} at ({easting}, {northing})");
                    return $"Point created successfully: #{pt.PointNumber} at ({easting}, {northing}, {elevation}) - {description}";
                    */

                    tr.Commit();
                    this.PrintMessage($"✓ Point logged: ({easting}, {northing}, {elevation})");
                    return $"Point logged: ({easting}, {northing}, {elevation}) - {description} (Civil 3D API required for COGO points)";
                }
                catch (System.Exception ex)
                {
                    tr.Abort();
                    throw new System.Exception($"Failed to create COGO point: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Get COGO points from the drawing
        /// Used by Point Editor to retrieve points for sync
        /// </summary>
        private string GetCogoPoints(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
                return "{\"success\": false, \"error\": \"No active document\"}";

            Database db = doc.Database;
            List<JObject> points = new List<JObject>();

            try
            {
                // Parse optional filters
                JArray pointNumbersFilter = args?["pointNumbers"] as JArray;
                int? minPointNumber = args?["minPointNumber"]?.ToObject<int?>();
                int? maxPointNumber = args?["maxPointNumber"]?.ToObject<int?>();

                HashSet<int> requestedPointNumbers = new HashSet<int>();
                if (pointNumbersFilter != null)
                {
                    foreach (var pn in pointNumbersFilter)
                    {
                        requestedPointNumbers.Add((int)pn);
                    }
                }

                using (Transaction tr = db.TransactionManager.StartTransaction())
                {
                    // Scan model space for DBPoint entities (universal across AutoCAD/Civil 3D)
                    BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                    BlockTableRecord modelSpace = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead) as BlockTableRecord;

                    int pointNumber = 1;
                    foreach (ObjectId objId in modelSpace)
                    {
                        Entity ent = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                        if (ent == null) continue;

                        // Check for DBPoint entities
                        if (ent is DBPoint dbPoint)
                        {
                            // Apply filters
                            if (requestedPointNumbers.Count > 0 && !requestedPointNumbers.Contains(pointNumber))
                            {
                                pointNumber++;
                                continue;
                            }
                            if (minPointNumber.HasValue && pointNumber < minPointNumber.Value)
                            {
                                pointNumber++;
                                continue;
                            }
                            if (maxPointNumber.HasValue && pointNumber > maxPointNumber.Value)
                            {
                                pointNumber++;
                                continue;
                            }

                            Point3d position = dbPoint.Position;
                            
                            // Try to get description from XData
                            string rawDescription = "";
                            string fullDescription = "";
                            ResultBuffer xdata = dbPoint.XData;
                            if (xdata != null)
                            {
                                foreach (TypedValue tv in xdata)
                                {
                                    if (tv.TypeCode == (int)DxfCode.Text && tv.Value != null)
                                    {
                                        rawDescription = tv.Value.ToString();
                                        break;
                                    }
                                }
                            }

                            JObject pointObj = new JObject();
                            pointObj["pointNumber"] = pointNumber;
                            pointObj["easting"] = Math.Round(position.X, 6);
                            pointObj["northing"] = Math.Round(position.Y, 6);
                            pointObj["elevation"] = Math.Round(position.Z, 6);
                            pointObj["rawDescription"] = rawDescription;
                            pointObj["fullDescription"] = fullDescription;
                            pointObj["layer"] = dbPoint.Layer;
                            pointObj["objectId"] = objId.ToString();

                            points.Add(pointObj);
                            pointNumber++;
                        }
                    }

                    tr.Commit();
                }

                JObject response = new JObject();
                response["success"] = true;
                response["totalPoints"] = points.Count;
                response["points"] = new JArray(points);
                response["drawingName"] = doc.Name;

                this.PrintMessage($"✓ Retrieved {points.Count} points from drawing");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Sync multiple points to the drawing in batch
        /// Used by Point Editor for bulk point synchronization
        /// </summary>
        private string SyncPointsBatch(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
                return "{\"success\": false, \"error\": \"No active document\"}";

            Database db = doc.Database;
            
            int created = 0;
            int updated = 0;
            int skipped = 0;
            int failed = 0;
            List<JObject> results = new List<JObject>();

            try
            {
                JArray pointsArray = args?["points"] as JArray;
                if (pointsArray == null || pointsArray.Count == 0)
                    return "{\"success\": false, \"error\": \"No points provided\"}";

                bool createIfNotExists = args?["createIfNotExists"]?.ToObject<bool>() ?? true;
                bool updateExisting = args?["updateExisting"]?.ToObject<bool>() ?? true;

                this.PrintMessage($"Syncing {pointsArray.Count} points (create={createIfNotExists}, update={updateExisting})...");

                using (Transaction tr = db.TransactionManager.StartTransaction())
                {
                    BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                    BlockTableRecord modelSpace = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite) as BlockTableRecord;

                    // Build a dictionary of existing points by point number
                    Dictionary<int, ObjectId> existingPoints = new Dictionary<int, ObjectId>();
                    int currentPointNum = 1;
                    foreach (ObjectId objId in modelSpace)
                    {
                        Entity ent = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                        if (ent is DBPoint)
                        {
                            existingPoints[currentPointNum] = objId;
                            currentPointNum++;
                        }
                    }

                    foreach (JObject pointData in pointsArray)
                    {
                        JObject resultItem = new JObject();
                        int pointNumber = pointData["pointNumber"]?.ToObject<int>() ?? 0;
                        resultItem["pointNumber"] = pointNumber;

                        try
                        {
                            double easting = (double)pointData["easting"];
                            double northing = (double)pointData["northing"];
                            double elevation = pointData["elevation"]?.ToObject<double>() ?? 0.0;
                            string rawDescription = pointData["rawDescription"]?.ToString() ?? "";

                            if (existingPoints.ContainsKey(pointNumber))
                            {
                                if (updateExisting)
                                {
                                    // Update existing point
                                    ObjectId existingId = existingPoints[pointNumber];
                                    DBPoint existingPoint = tr.GetObject(existingId, OpenMode.ForWrite) as DBPoint;
                                    if (existingPoint != null)
                                    {
                                        existingPoint.Position = new Point3d(easting, northing, elevation);
                                        
                                        // Update XData with description
                                        if (!string.IsNullOrEmpty(rawDescription))
                                        {
                                            RegAppTable rat = tr.GetObject(db.RegAppTableId, OpenMode.ForWrite) as RegAppTable;
                                            if (!rat.Has("LANDSURV_DESC"))
                                            {
                                                RegAppTableRecord ratr = new RegAppTableRecord();
                                                ratr.Name = "LANDSURV_DESC";
                                                rat.Add(ratr);
                                                tr.AddNewlyCreatedDBObject(ratr, true);
                                            }
                                            
                                            ResultBuffer rb = new ResultBuffer(
                                                new TypedValue((int)DxfCode.ExtendedDataRegAppName, "LANDSURV_DESC"),
                                                new TypedValue((int)DxfCode.ExtendedDataAsciiString, rawDescription)
                                            );
                                            existingPoint.XData = rb;
                                        }

                                        updated++;
                                        resultItem["status"] = "updated";
                                        this.PrintMessage($"  → Updated point #{pointNumber}");
                                    }
                                }
                                else
                                {
                                    skipped++;
                                    resultItem["status"] = "skipped";
                                    resultItem["reason"] = "Point exists and updateExisting is false";
                                }
                            }
                            else if (createIfNotExists)
                            {
                                // Create new point
                                DBPoint newPoint = new DBPoint(new Point3d(easting, northing, elevation));
                                
                                // Add XData with description
                                if (!string.IsNullOrEmpty(rawDescription))
                                {
                                    RegAppTable rat = tr.GetObject(db.RegAppTableId, OpenMode.ForWrite) as RegAppTable;
                                    if (!rat.Has("LANDSURV_DESC"))
                                    {
                                        RegAppTableRecord ratr = new RegAppTableRecord();
                                        ratr.Name = "LANDSURV_DESC";
                                        rat.Add(ratr);
                                        tr.AddNewlyCreatedDBObject(ratr, true);
                                    }
                                    
                                    ResultBuffer rb = new ResultBuffer(
                                        new TypedValue((int)DxfCode.ExtendedDataRegAppName, "LANDSURV_DESC"),
                                        new TypedValue((int)DxfCode.ExtendedDataAsciiString, rawDescription)
                                    );
                                    newPoint.XData = rb;
                                }

                                modelSpace.AppendEntity(newPoint);
                                tr.AddNewlyCreatedDBObject(newPoint, true);

                                created++;
                                resultItem["status"] = "created";
                                this.PrintMessage($"  → Created point #{pointNumber} at ({easting}, {northing})");
                            }
                            else
                            {
                                skipped++;
                                resultItem["status"] = "skipped";
                                resultItem["reason"] = "Point does not exist and createIfNotExists is false";
                            }
                        }
                        catch (System.Exception ex)
                        {
                            failed++;
                            resultItem["status"] = "failed";
                            resultItem["error"] = ex.Message;
                            this.PrintMessage($"  ✗ Point #{pointNumber} failed: {ex.Message}");
                        }

                        results.Add(resultItem);
                    }

                    tr.Commit();
                }

                JObject response = new JObject();
                response["success"] = true;
                response["created"] = created;
                response["updated"] = updated;
                response["skipped"] = skipped;
                response["failed"] = failed;
                response["results"] = new JArray(results);

                this.PrintMessage($"✓ Sync complete: {created} created, {updated} updated, {skipped} skipped, {failed} failed");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Delete COGO points from the drawing by point number
        /// </summary>
        private string DeleteCogoPoints(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
                return "{\"success\": false, \"error\": \"No active document\"}";

            Database db = doc.Database;
            
            int deleted = 0;
            int notFound = 0;
            int failed = 0;
            List<JObject> results = new List<JObject>();

            try
            {
                JArray pointNumbersArray = args?["pointNumbers"] as JArray;
                if (pointNumbersArray == null || pointNumbersArray.Count == 0)
                    return "{\"success\": false, \"error\": \"No point numbers provided\"}";

                HashSet<int> pointNumbersToDelete = new HashSet<int>();
                foreach (var pn in pointNumbersArray)
                {
                    pointNumbersToDelete.Add((int)pn);
                }

                this.PrintMessage($"Deleting {pointNumbersToDelete.Count} points...");

                using (Transaction tr = db.TransactionManager.StartTransaction())
                {
                    BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                    BlockTableRecord modelSpace = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite) as BlockTableRecord;

                    // Build a dictionary of existing points by point number
                    Dictionary<int, ObjectId> existingPoints = new Dictionary<int, ObjectId>();
                    int currentPointNum = 1;
                    foreach (ObjectId objId in modelSpace)
                    {
                        Entity ent = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                        if (ent is DBPoint)
                        {
                            existingPoints[currentPointNum] = objId;
                            currentPointNum++;
                        }
                    }

                    foreach (int pointNumber in pointNumbersToDelete)
                    {
                        JObject resultItem = new JObject();
                        resultItem["pointNumber"] = pointNumber;

                        try
                        {
                            if (existingPoints.ContainsKey(pointNumber))
                            {
                                ObjectId pointId = existingPoints[pointNumber];
                                DBPoint point = tr.GetObject(pointId, OpenMode.ForWrite) as DBPoint;
                                if (point != null)
                                {
                                    point.Erase();
                                    deleted++;
                                    resultItem["status"] = "deleted";
                                    this.PrintMessage($"  → Deleted point #{pointNumber}");
                                }
                            }
                            else
                            {
                                notFound++;
                                resultItem["status"] = "notFound";
                                this.PrintMessage($"  ? Point #{pointNumber} not found");
                            }
                        }
                        catch (System.Exception ex)
                        {
                            failed++;
                            resultItem["status"] = "failed";
                            resultItem["error"] = ex.Message;
                            this.PrintMessage($"  ✗ Point #{pointNumber} delete failed: {ex.Message}");
                        }

                        results.Add(resultItem);
                    }

                    tr.Commit();
                }

                JObject response = new JObject();
                response["success"] = true;
                response["deleted"] = deleted;
                response["notFound"] = notFound;
                response["failed"] = failed;
                response["results"] = new JArray(results);

                this.PrintMessage($"✓ Delete complete: {deleted} deleted, {notFound} not found, {failed} failed");
                return response.ToString();
            }
            catch (System.Exception ex)
            {
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

    }
}