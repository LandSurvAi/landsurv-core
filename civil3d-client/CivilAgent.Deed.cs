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
    /// <summary>CivilAgent (partial) � Deed concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Import deed boundary as a polyline in Civil 3D
        /// Creates a closed polyline from the deed parcel vertices with bearing/distance annotations
        /// </summary>
        private string ImportDeedPolyline(JObject args)
        {
            this.PrintMessage("[DEBUG] ImportDeedPolyline: Starting...");
            this.PrintMessage($"[DEBUG] args: {args?.ToString()}");

            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                this.PrintMessage("[DEBUG] ERROR: No active document");
                return "{\"success\": false, \"error\": \"No active document\"}";
            }

            Database db = doc.Database;

            try
            {
                // Extract vertices from args
                JArray vertices = args["vertices"] as JArray;
                this.PrintMessage($"[DEBUG] vertices: {vertices?.Count ?? 0} items");
                
                if (vertices == null || vertices.Count < 2)
                {
                    this.PrintMessage($"[DEBUG] ERROR: Invalid vertices - count={vertices?.Count ?? 0}");
                    return "{\"success\": false, \"error\": \"At least 2 vertices required\"}";
                }

                string polylineLayer = args["layer"]?.ToString() ?? "L-DEED-BOUNDARY";
                bool closed = args["closed"]?.ToObject<bool>() ?? true;
                string parcelName = args["parcelName"]?.ToString() ?? "Deed Parcel";
                // CHANGED: Default to false - only deed lines explicitly set this to true
                bool includeBearingDistance = args["includeBearingDistance"]?.ToObject<bool>() ?? false;
                // Linetype support - defaults to CONTINUOUS if not specified
                string lineType = args["lineType"]?.ToString() ?? "CONTINUOUS";
                string labelLayer = "L-PARCEL-LABEL";
                string bearingDistanceLayer = "L-BEARING-DISTANCE";

                this.PrintMessage($"[DEBUG] Creating polyline with {vertices.Count} vertices on layer '{polylineLayer}'");
                this.PrintMessage($"[DEBUG] closed={closed}, parcelName='{parcelName}', includeBearingDistance={includeBearingDistance}, lineType='{lineType}'");

                // Lock the document before starting transaction
                this.PrintMessage("[DEBUG] Acquiring document lock...");
                using (DocumentLock docLock = doc.LockDocument())
                {
                    this.PrintMessage("[DEBUG] Document lock acquired");
                    
                    using (Transaction tr = db.TransactionManager.StartTransaction())
                    {
                        this.PrintMessage("[DEBUG] Started transaction");
                    
                        // Get block table and model space
                        BlockTable bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                        BlockTableRecord btr = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);
                        this.PrintMessage("[DEBUG] Got model space");

                        // Ensure layers exist
                        LayerTable lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                        EnsureLayer(tr, lt, polylineLayer, 3, "Deed polyline boundary"); // Green
                        EnsureLayer(tr, lt, labelLayer, 2, "Parcel owner label"); // Yellow
                        EnsureLayer(tr, lt, bearingDistanceLayer, 1, "Bearing and distance annotations"); // Red

                        // Create polyline
                        Polyline pline = new Polyline();
                        pline.SetDatabaseDefaults();
                        pline.Layer = polylineLayer;
                        
                        // Apply linetype if specified and exists in drawing
                        if (!string.IsNullOrEmpty(lineType) && lineType.ToUpper() != "CONTINUOUS")
                        {
                            LinetypeTable ltt = (LinetypeTable)tr.GetObject(db.LinetypeTableId, OpenMode.ForRead);
                            if (ltt.Has(lineType))
                            {
                                pline.LinetypeId = ltt[lineType];
                                this.PrintMessage($"[DEBUG] Applied linetype '{lineType}' to polyline");
                            }
                            else
                            {
                                this.PrintMessage($"[DEBUG] Linetype '{lineType}' not found in drawing, using ByLayer");
                            }
                        }
                        this.PrintMessage($"[DEBUG] Created polyline object");

                        // Convert vertices to Point2d array for easier access
                        Point2d[] pts = new Point2d[vertices.Count];
                        int vertexIndex = 0;
                        foreach (JObject vertex in vertices)
                        {
                            double x = vertex["easting"]?.ToObject<double>() ?? vertex["x"]?.ToObject<double>() ?? 0;
                            double y = vertex["northing"]?.ToObject<double>() ?? vertex["y"]?.ToObject<double>() ?? 0;
                            double bulge = vertex["bulge"]?.ToObject<double>() ?? 0;

                            pts[vertexIndex] = new Point2d(x, y);
                            pline.AddVertexAt(vertexIndex, pts[vertexIndex], bulge, 0, 0);
                            this.PrintMessage($"[DEBUG] Added vertex {vertexIndex}: x={x}, y={y}");
                            vertexIndex++;
                        }

                        // Close the polyline if specified
                        if (closed && vertices.Count > 2)
                        {
                            pline.Closed = true;
                            this.PrintMessage("[DEBUG] Closed polyline");
                        }

                        // Add to model space
                        ObjectId plineId = btr.AppendEntity(pline);
                        tr.AddNewlyCreatedDBObject(pline, true);
                        this.PrintMessage($"[DEBUG] Added polyline to model space, ObjectId={plineId}");

                        // Calculate extents for text sizing
                        Extents3d extents = pline.GeometricExtents;
                        double polylineWidth = extents.MaxPoint.X - extents.MinPoint.X;
                        double polylineHeight = extents.MaxPoint.Y - extents.MinPoint.Y;
                        double parcelLabelHeight = Math.Max(5, Math.Min(polylineWidth, polylineHeight) / 40); // Smaller, scaled down
                        double bearingDistanceHeight = Math.Max(3, parcelLabelHeight * 0.6); // Even smaller for bearing/distance

                        // Add bearing and distance annotations along sides - ONLY if includeBearingDistance is true
                        // This flag should be true for deed lines and false for normal linework
                        if (includeBearingDistance)
                        {
                            this.PrintMessage("[DEBUG] Creating bearing and distance annotations...");
                            int segmentCount = closed ? vertices.Count : vertices.Count - 1;
                            for (int i = 0; i < segmentCount; i++)
                            {
                                int nextIdx = (i + 1) % vertices.Count;
                                if (!closed && i == vertices.Count - 1) break;

                                Point2d pt1 = pts[i];
                                Point2d pt2 = pts[nextIdx];
                                Point2d midpoint = new Point2d((pt1.X + pt2.X) / 2, (pt1.Y + pt2.Y) / 2);

                                // Calculate bearing (angle from north)
                                double dx = pt2.X - pt1.X;
                                double dy = pt2.Y - pt1.Y;
                                double radians = Math.Atan2(dx, dy);
                                double degrees = radians * 180 / Math.PI;
                                if (degrees < 0) degrees += 360;
                                
                                // Calculate rotation angle for text (perpendicular to line for readability)
                                double textRotation = radians;
                                // Adjust rotation so text reads left-to-right
                                if (textRotation > Math.PI / 2 && textRotation < 3 * Math.PI / 2)
                                {
                                    textRotation += Math.PI;
                                }

                                // Calculate distance
                                double distance = Math.Sqrt(dx * dx + dy * dy);

                                // Format bearing as N/S DD°MM'SS"E/W
                                string bearing = FormatBearing(degrees);
                                string distanceStr = distance.ToString("F2");

                                // Create SEPARATE bearing and distance MTEXT objects, rotated parallel to line
                                // Bearing text - slightly offset above the line
                                MText bearingText = new MText();
                                bearingText.SetDatabaseDefaults();
                                bearingText.Layer = bearingDistanceLayer;
                                Point3d bearingLocation = new Point3d(midpoint.X, midpoint.Y, 0);
                                bearingText.Location = bearingLocation;
                                bearingText.TextHeight = bearingDistanceHeight;
                                bearingText.Contents = bearing;
                                bearingText.Attachment = AttachmentPoint.BottomCenter;
                                bearingText.Rotation = textRotation;
                                
                                btr.AppendEntity(bearingText);
                                tr.AddNewlyCreatedDBObject(bearingText, true);
                                this.PrintMessage($"[DEBUG] Added bearing text: {bearing} at segment {i}, rotation={textRotation * 180 / Math.PI:F1}°");

                                // Distance text - slightly offset below the line
                                MText distanceText = new MText();
                                distanceText.SetDatabaseDefaults();
                                distanceText.Layer = bearingDistanceLayer;
                                Point3d distanceLocation = new Point3d(midpoint.X, midpoint.Y, 0);
                                distanceText.Location = distanceLocation;
                                distanceText.TextHeight = bearingDistanceHeight;
                                distanceText.Contents = distanceStr + "'";
                                distanceText.Attachment = AttachmentPoint.TopCenter;
                                distanceText.Rotation = textRotation;
                                
                                btr.AppendEntity(distanceText);
                                tr.AddNewlyCreatedDBObject(distanceText, true);
                                this.PrintMessage($"[DEBUG] Added distance text: {distanceStr}' at segment {i}, rotation={textRotation * 180 / Math.PI:F1}°");
                            }
                        }
                        else
                        {
                            this.PrintMessage("[DEBUG] Skipping bearing/distance annotations (includeBearingDistance=false)");
                        }

                        // Add parcel name label at centroid
                        if (!string.IsNullOrEmpty(parcelName))
                        {
                            this.PrintMessage("[DEBUG] Creating parcel name label...");
                            try
                            {
                                Point3d center = new Point3d(
                                    (extents.MinPoint.X + extents.MaxPoint.X) / 2,
                                    (extents.MinPoint.Y + extents.MaxPoint.Y) / 2,
                                    0
                                );
                                this.PrintMessage($"[DEBUG] Centroid: {center.X}, {center.Y}");

                                // Create MTEXT for parcel label (better formatting control)
                                MText labelText = new MText();
                                labelText.SetDatabaseDefaults();
                                labelText.Layer = labelLayer;
                                labelText.Location = center;
                                labelText.TextHeight = parcelLabelHeight;
                                labelText.Contents = parcelName;
                                labelText.Attachment = AttachmentPoint.MiddleCenter;

                                btr.AppendEntity(labelText);
                                tr.AddNewlyCreatedDBObject(labelText, true);
                                this.PrintMessage("[DEBUG] Added parcel name label");
                            }
                            catch (System.Exception labelEx)
                            {
                                this.PrintMessage($"[DEBUG] Label creation error: {labelEx.Message}");
                            }
                        }

                        tr.Commit();
                        this.PrintMessage("[DEBUG] Transaction committed");

                        JObject response = new JObject();
                        response["success"] = true;
                        response["vertexCount"] = vertices.Count;
                        response["polylineLayer"] = polylineLayer;
                        response["labelLayer"] = labelLayer;
                        response["bearingDistanceLayer"] = bearingDistanceLayer;
                        response["closed"] = closed;
                        response["parcelName"] = parcelName;
                        response["includeBearingDistance"] = includeBearingDistance;
                        
                        string bdMsg = includeBearingDistance 
                            ? $" and {(closed ? vertices.Count : vertices.Count - 1)} bearing/distance annotations" 
                            : "";
                        response["message"] = $"Created polyline with {vertices.Count} vertices{bdMsg}";

                        this.PrintMessage($"✓ Polyline created: {vertices.Count} vertices, B&D={includeBearingDistance}");
                        return response.ToString();
                    }
                }
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"ImportDeedPolyline error: {ex.Message}");
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// WYSIWYG import of deed geometry with exact curves and pre-computed labels
        /// Takes polyline vertices with bulge values for curves, and pre-computed MTEXT entities
        /// </summary>
        private string ImportDeedWysiwyg(JObject args)
        {
            this.PrintMessage("[DEBUG] ImportDeedWysiwyg: Starting...");

            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                return "{\"success\": false, \"error\": \"No active document\"}";
            }

            Database db = doc.Database;

            try
            {
                // Extract vertices array (each vertex has easting, northing, and optionally bulge)
                JArray vertices = args["vertices"] as JArray;
                if (vertices == null || vertices.Count < 2)
                {
                    return "{\"success\": false, \"error\": \"At least 2 vertices required\"}";
                }

                // Extract MTEXT labels array (pre-computed position, rotation, content)
                JArray labels = args["labels"] as JArray;
                
                string polylineLayer = args["layer"]?.ToString() ?? "L-DEED-BOUNDARY";
                string labelLayer = args["labelLayer"]?.ToString() ?? "L-BEARING-DISTANCE";
                string parcelLabelLayer = args["parcelLabelLayer"]?.ToString() ?? "L-PARCEL-LABEL";
                bool closed = args["closed"]?.ToObject<bool>() ?? true;
                string parcelName = args["parcelName"]?.ToString() ?? "";
                double textHeight = args["textHeight"]?.ToObject<double>() ?? 2.5;

                this.PrintMessage($"[DEBUG] WYSIWYG: {vertices.Count} vertices, {labels?.Count ?? 0} labels, closed={closed}");

                using (DocumentLock docLock = doc.LockDocument())
                {
                    using (Transaction tr = db.TransactionManager.StartTransaction())
                    {
                        BlockTable bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                        BlockTableRecord btr = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

                        // Ensure layers exist
                        LayerTable lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                        EnsureLayer(tr, lt, polylineLayer, 3, "Deed polyline boundary"); // Green
                        EnsureLayer(tr, lt, labelLayer, 1, "Bearing/distance labels"); // Red
                        EnsureLayer(tr, lt, parcelLabelLayer, 2, "Parcel label"); // Yellow

                        // Create polyline with bulge values for curves
                        Polyline pline = new Polyline();
                        pline.SetDatabaseDefaults();
                        pline.Layer = polylineLayer;

                        int vertexIndex = 0;
                        foreach (JObject vertex in vertices)
                        {
                            double x = vertex["easting"]?.ToObject<double>() ?? vertex["x"]?.ToObject<double>() ?? 0;
                            double y = vertex["northing"]?.ToObject<double>() ?? vertex["y"]?.ToObject<double>() ?? 0;
                            // BULGE: tan(angle/4) for curves, 0 for straight segments
                            double bulge = vertex["bulge"]?.ToObject<double>() ?? 0;

                            pline.AddVertexAt(vertexIndex, new Point2d(x, y), bulge, 0, 0);
                            this.PrintMessage($"[DEBUG] Vertex {vertexIndex}: ({x:F2}, {y:F2}), bulge={bulge:F6}");
                            vertexIndex++;
                        }

                        if (closed && vertices.Count > 2)
                        {
                            pline.Closed = true;
                        }

                        ObjectId plineId = btr.AppendEntity(pline);
                        tr.AddNewlyCreatedDBObject(pline, true);
                        this.PrintMessage($"[DEBUG] Polyline added: {vertices.Count} vertices");

                        // Add pre-computed MTEXT labels (exact WYSIWYG positioning)
                        int labelCount = 0;
                        if (labels != null)
                        {
                            foreach (JObject label in labels)
                            {
                                double x = label["x"]?.ToObject<double>() ?? 0;
                                double y = label["y"]?.ToObject<double>() ?? 0;
                                double rotation = label["rotation"]?.ToObject<double>() ?? 0; // Radians
                                string content = label["content"]?.ToString() ?? "";
                                string layer = label["layer"]?.ToString() ?? labelLayer;
                                double height = label["height"]?.ToObject<double>() ?? textHeight;
                                string attachment = label["attachment"]?.ToString() ?? "MiddleCenter";

                                if (string.IsNullOrWhiteSpace(content)) continue;

                                MText mtext = new MText();
                                mtext.SetDatabaseDefaults();
                                mtext.Layer = layer;
                                mtext.Location = new Point3d(x, y, 0);
                                mtext.TextHeight = height;
                                mtext.Contents = content;
                                mtext.Rotation = rotation;

                                // Parse attachment point
                                switch (attachment)
                                {
                                    case "TopLeft": mtext.Attachment = AttachmentPoint.TopLeft; break;
                                    case "TopCenter": mtext.Attachment = AttachmentPoint.TopCenter; break;
                                    case "TopRight": mtext.Attachment = AttachmentPoint.TopRight; break;
                                    case "MiddleLeft": mtext.Attachment = AttachmentPoint.MiddleLeft; break;
                                    case "MiddleCenter": mtext.Attachment = AttachmentPoint.MiddleCenter; break;
                                    case "MiddleRight": mtext.Attachment = AttachmentPoint.MiddleRight; break;
                                    case "BottomLeft": mtext.Attachment = AttachmentPoint.BottomLeft; break;
                                    case "BottomCenter": mtext.Attachment = AttachmentPoint.BottomCenter; break;
                                    case "BottomRight": mtext.Attachment = AttachmentPoint.BottomRight; break;
                                    default: mtext.Attachment = AttachmentPoint.MiddleCenter; break;
                                }

                                btr.AppendEntity(mtext);
                                tr.AddNewlyCreatedDBObject(mtext, true);
                                labelCount++;
                                this.PrintMessage($"[DEBUG] Label: '{content}' at ({x:F2}, {y:F2}), rot={rotation * 180 / Math.PI:F1}°");
                            }
                        }

                        // Add parcel name label at centroid if specified
                        if (!string.IsNullOrWhiteSpace(parcelName))
                        {
                            Extents3d extents = pline.GeometricExtents;
                            Point3d center = new Point3d(
                                (extents.MinPoint.X + extents.MaxPoint.X) / 2,
                                (extents.MinPoint.Y + extents.MaxPoint.Y) / 2,
                                0
                            );

                            double parcelTextHeight = Math.Max(5, Math.Min(
                                extents.MaxPoint.X - extents.MinPoint.X,
                                extents.MaxPoint.Y - extents.MinPoint.Y
                            ) / 40);

                            MText parcelLabel = new MText();
                            parcelLabel.SetDatabaseDefaults();
                            parcelLabel.Layer = parcelLabelLayer;
                            parcelLabel.Location = center;
                            parcelLabel.TextHeight = parcelTextHeight;
                            parcelLabel.Contents = parcelName;
                            parcelLabel.Attachment = AttachmentPoint.MiddleCenter;

                            btr.AppendEntity(parcelLabel);
                            tr.AddNewlyCreatedDBObject(parcelLabel, true);
                            this.PrintMessage($"[DEBUG] Parcel label: '{parcelName}'");
                        }

                        tr.Commit();

                        JObject response = new JObject();
                        response["success"] = true;
                        response["vertexCount"] = vertices.Count;
                        response["labelCount"] = labelCount;
                        response["polylineLayer"] = polylineLayer;
                        response["labelLayer"] = labelLayer;
                        response["closed"] = closed;
                        response["message"] = $"WYSIWYG: {vertices.Count} vertices, {labelCount} labels";

                        this.PrintMessage($"✓ WYSIWYG import complete: {vertices.Count} vertices, {labelCount} labels");
                        return response.ToString();
                    }
                }
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"ImportDeedWysiwyg error: {ex.Message}");
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Ensure a layer exists with specified color and description
        /// </summary>
        private void EnsureLayer(Transaction tr, LayerTable lt, string layerName, int colorIndex, string description)
        {
            if (!lt.Has(layerName))
            {
                this.PrintMessage($"[DEBUG] Layer '{layerName}' doesn't exist, creating...");
                lt.UpgradeOpen();
                LayerTableRecord ltr = new LayerTableRecord();
                ltr.Name = layerName;
                ltr.Color = Autodesk.AutoCAD.Colors.Color.FromColorIndex(Autodesk.AutoCAD.Colors.ColorMethod.ByAci, (short)colorIndex);
                ltr.Description = description;
                lt.Add(ltr);
                tr.AddNewlyCreatedDBObject(ltr, true);
                this.PrintMessage($"[DEBUG] Created layer: {layerName}");
            }
            else
            {
                this.PrintMessage($"[DEBUG] Layer '{layerName}' already exists");
            }
        }

        /// <summary>
        /// Format bearing angle as compass notation (N/S DD°MM'SS"E/W)
        /// </summary>
        private string FormatBearing(double degrees)
        {
            // Normalize to 0-360 range
            while (degrees < 0) degrees += 360;
            while (degrees >= 360) degrees -= 360;

            // Determine cardinal direction based on quadrant
            string ns, ew;
            double bearingAngle;

            if (degrees >= 0 && degrees < 90)
            {
                // NE quadrant
                ns = "N";
                ew = "E";
                bearingAngle = degrees;
            }
            else if (degrees >= 90 && degrees < 180)
            {
                // SE quadrant
                ns = "S";
                ew = "E";
                bearingAngle = 180 - degrees;
            }
            else if (degrees >= 180 && degrees < 270)
            {
                // SW quadrant
                ns = "S";
                ew = "W";
                bearingAngle = degrees - 180;
            }
            else
            {
                // NW quadrant (270 to 360)
                ns = "N";
                ew = "W";
                bearingAngle = 360 - degrees;
            }

            // Convert to degrees, minutes, seconds
            int deg = (int)bearingAngle;
            double minutesDecimal = (bearingAngle - deg) * 60;
            int min = (int)minutesDecimal;
            double sec = (minutesDecimal - min) * 60;

            return $"{ns} {deg:D2}°{min:D2}'{sec:F2}\"{ew}";
        }

    }
}