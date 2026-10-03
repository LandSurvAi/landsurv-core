using System;
using System.Collections.Generic;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace LandsurvConnector.Sync
{
    /// <summary>
    /// Reads the active drawing into a SyncSnapshot for the sync engine.
    ///
    /// XData registry used by the connector (one value per regapp name, matching
    /// the existing LANDSURV_DESC convention in CivilAgent):
    ///   LANDSURV_DESC    (string)  point description on DBPoint fallback points
    ///   LANDSURV_PNUM    (int)     stable point number on DBPoint fallback points
    ///   LANDSURV_LINE_ID (string)  stable linework id on polylines
    ///   LANDSURV_ANNO_ID (string)  stable annotation id on text/mtext
    ///
    /// Point identity: real CogoPoints (Civil 3D) carry true point numbers. In
    /// plain AutoCAD, DBPoints stamped with LANDSURV_PNUM use that number;
    /// unstamped legacy DBPoints fall back to positional numbering (previous
    /// behavior) and get stamped on their first sync write.
    /// </summary>
    internal static class CadSnapshot
    {
        public const string RegAppDesc = "LANDSURV_DESC";
        public const string RegAppPointNumber = "LANDSURV_PNUM";
        public const string RegAppLineId = "LANDSURV_LINE_ID";
        public const string RegAppAnnotationId = "LANDSURV_ANNO_ID";

        /// <summary>Capture the full syncable snapshot of a document's model space.</summary>
        public static SyncSnapshot Capture(Document doc, Action<string> log)
        {
            var snapshot = new SyncSnapshot { CapturedAt = DateTime.UtcNow };
            if (doc == null) return snapshot;

            Database db = doc.Database;
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                CaptureLayers(db, tr, snapshot, log);
                CaptureModelSpace(db, tr, snapshot, log);
                CaptureBlocks(db, tr, snapshot, log);
                tr.Commit();
            }
            return snapshot;
        }

        /// <summary>
        /// Single pass over model space feeding points, linework and annotations.
        /// Each of those used to walk every entity in the drawing separately, so a
        /// large drawing was read three times per sync poll.
        /// </summary>
        private static void CaptureModelSpace(Database db, Transaction tr, SyncSnapshot snapshot, Action<string> log)
        {
            // Real CogoPoints (Civil 3D) come from their own collection; the
            // DBPoint walk below is only the plain-AutoCAD fallback.
            var cogoPoints = CogoPointAdapter.TryReadAll(db, tr, log);
            bool haveCogoPoints = cogoPoints != null;
            if (haveCogoPoints) snapshot.Points.AddRange(cogoPoints);

            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);

            int positional = 1;
            foreach (ObjectId objId in ms)
            {
                var ent = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                if (ent == null) continue;

                if (ent is DBPoint point)
                {
                    if (!haveCogoPoints) CapturePoint(point, snapshot, ref positional);
                }
                else if (ent is DBText || ent is MText)
                {
                    CaptureAnnotation(ent, snapshot);
                }
                else
                {
                    CaptureLineworkEntity(tr, ent, snapshot);
                }
            }
        }

        // ── Points ───────────────────────────────────────────────────────────

        private static void CapturePoint(DBPoint point, SyncSnapshot snapshot, ref int positional)
        {
            string stampedNumber = ReadXDataString(point, RegAppPointNumber);
            string number = !string.IsNullOrEmpty(stampedNumber)
                ? stampedNumber
                : (positional++).ToString();

            snapshot.Points.Add(new SyncPointRecord
            {
                PointNumber = number,
                Easting = point.Position.X,
                Northing = point.Position.Y,
                Elevation = point.Position.Z,
                Description = ReadXDataString(point, RegAppDesc) ?? "",
                Layer = point.Layer,
            });
        }

        // ── Layers ───────────────────────────────────────────────────────────

        private static void CaptureLayers(Database db, Transaction tr, SyncSnapshot snapshot, Action<string> log)
        {
            var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
            var ltt = (LinetypeTable)tr.GetObject(db.LinetypeTableId, OpenMode.ForRead);

            foreach (ObjectId layerId in lt)
            {
                var layer = (LayerTableRecord)tr.GetObject(layerId, OpenMode.ForRead);
                string linetypeName = null;
                if (!layer.LinetypeObjectId.IsNull && ltt.Has(layer.LinetypeObjectId))
                {
                    var ltype = tr.GetObject(layer.LinetypeObjectId, OpenMode.ForRead) as LinetypeTableRecord;
                    linetypeName = ltype?.Name;
                }

                snapshot.Layers.Add(new SyncLayerRecord
                {
                    Name = layer.Name,
                    Color = NormalizeColor(layer.Color),
                    LineType = linetypeName,
                    LineWeight = layer.LineWeight == LineWeight.ByLayer ? (int?)null : (int)layer.LineWeight,
                });
            }
        }

        /// <summary>Normalize an AutoCAD color to "#RRGGBB" (ACI resolved to RGB).</summary>
        internal static string NormalizeColor(Autodesk.AutoCAD.Colors.Color color)
        {
            if (color == null) return null;
            try
            {
                var rgb = color.ColorValue; // resolves ACI to RGB
                return $"#{rgb.R:X2}{rgb.G:X2}{rgb.B:X2}";
            }
            catch
            {
                return null;
            }
        }

        // ── Linework (2D polylines, bulge preserved) ─────────────────────────

        /// <summary>Stable linework identity: the LandSurv stamp when present, else
        /// the entity handle (which survives grip edits, STRETCH and MOVE).</summary>
        private static string LineworkId(Entity entity)
        {
            string id = ReadXDataString(entity, RegAppLineId);
            return string.IsNullOrEmpty(id) ? "cad-handle:" + entity.Handle.ToString() : id;
        }

        private static void CaptureLineworkEntity(Transaction tr, Entity ent, SyncSnapshot snapshot)
        {
                if (ent is Polyline pline)
                {
                    if (WebappStateMapper.IsExcludedLineworkLayer(pline.Layer)) return;

                    string id = ReadXDataString(pline, RegAppLineId);
                    if (string.IsNullOrEmpty(id)) id = "cad-handle:" + pline.Handle.ToString();

                    var record = new SyncLineRecord
                    {
                        Id = id,
                        Layer = pline.Layer,
                        Closed = pline.Closed,
                    };

                    for (int i = 0; i < pline.NumberOfVertices; i++)
                    {
                        Point2d pt = pline.GetPoint2dAt(i);
                        double bulge = pline.GetBulgeAt(i);
                        record.Vertices.Add(new SyncLineVertex
                        {
                            X = pt.X,
                            Y = pt.Y,
                            Bulge = Math.Abs(bulge) > 1e-12 ? (double?)bulge : null,
                        });
                    }

                    if (record.Vertices.Count >= 2) snapshot.Linework.Add(record);
                }
                else if (ent is Line line)
                {
                    // Plain LINE entities were previously invisible to sync, so
                    // stretching or grip-moving one end never reached LandSurv.ai.
                    // Captured as a 2-vertex open run; the vertex diff then reports
                    // exactly which end moved.
                    if (WebappStateMapper.IsExcludedLineworkLayer(line.Layer)) return;

                    var record = new SyncLineRecord
                    {
                        Id = LineworkId(line),
                        Layer = line.Layer,
                        Closed = false,
                    };
                    record.Vertices.Add(new SyncLineVertex { X = line.StartPoint.X, Y = line.StartPoint.Y });
                    record.Vertices.Add(new SyncLineVertex { X = line.EndPoint.X, Y = line.EndPoint.Y });
                    snapshot.Linework.Add(record);
                }
                else if (ent is Arc arc)
                {
                    // Arcs run counter-clockwise from StartAngle to EndAngle, so the
                    // included sweep maps directly to a positive bulge.
                    if (WebappStateMapper.IsExcludedLineworkLayer(arc.Layer)) return;

                    double sweep = arc.EndAngle - arc.StartAngle;
                    if (sweep <= 0) sweep += 2 * Math.PI;

                    var record = new SyncLineRecord
                    {
                        Id = LineworkId(arc),
                        Layer = arc.Layer,
                        Closed = false,
                    };
                    record.Vertices.Add(new SyncLineVertex
                    {
                        X = arc.StartPoint.X,
                        Y = arc.StartPoint.Y,
                        Bulge = Math.Tan(sweep / 4.0),
                    });
                    record.Vertices.Add(new SyncLineVertex { X = arc.EndPoint.X, Y = arc.EndPoint.Y });
                    snapshot.Linework.Add(record);
                }
                else if (ent is Polyline2d p2d)
                {
                    if (WebappStateMapper.IsExcludedLineworkLayer(p2d.Layer)) return;

                    var record = new SyncLineRecord
                    {
                        Id = LineworkId(p2d),
                        Layer = p2d.Layer,
                        Closed = p2d.Closed,
                    };

                    foreach (ObjectId vertexId in p2d)
                    {
                        var vertex = tr.GetObject(vertexId, OpenMode.ForRead) as Vertex2d;
                        if (vertex == null) continue;
                        record.Vertices.Add(new SyncLineVertex
                        {
                            X = vertex.Position.X,
                            Y = vertex.Position.Y,
                            Bulge = Math.Abs(vertex.Bulge) > 1e-12 ? (double?)vertex.Bulge : null,
                        });
                    }

                    if (record.Vertices.Count >= 2) snapshot.Linework.Add(record);
                }
                else if (ent is Polyline3d p3d)
                {
                    if (WebappStateMapper.IsExcludedLineworkLayer(p3d.Layer)) return;

                    var record = new SyncLineRecord
                    {
                        Id = LineworkId(p3d),
                        Layer = p3d.Layer,
                        Closed = p3d.Closed,
                    };

                    foreach (ObjectId vertexId in p3d)
                    {
                        var vertex = tr.GetObject(vertexId, OpenMode.ForRead) as PolylineVertex3d;
                        if (vertex == null) continue;
                        record.Vertices.Add(new SyncLineVertex
                        {
                            X = vertex.Position.X,
                            Y = vertex.Position.Y,
                        });
                    }

                    if (record.Vertices.Count >= 2) snapshot.Linework.Add(record);
                }
                else if (ent is Circle circle)
                {
                    // A full circle has no polyline vertices, so it was previously
                    // skipped entirely. Represent it as a CLOSED 2-vertex polyline of
                    // two 180° arcs (bulge = tan(180°/4) = 1.0) at the horizontal
                    // extremes — geometrically identical to the circle, and it flows
                    // through the existing linework diff/apply pipeline both ways.
                    if (WebappStateMapper.IsExcludedLineworkLayer(circle.Layer)) return;

                    string id = ReadXDataString(circle, RegAppLineId);
                    if (string.IsNullOrEmpty(id)) id = "cad-handle:" + circle.Handle.ToString();

                    double cx = circle.Center.X, cy = circle.Center.Y, r = circle.Radius;
                    var record = new SyncLineRecord
                    {
                        Id = id,
                        Layer = circle.Layer,
                        Closed = true,
                    };
                    record.Vertices.Add(new SyncLineVertex { X = cx + r, Y = cy, Bulge = 1.0 });
                    record.Vertices.Add(new SyncLineVertex { X = cx - r, Y = cy, Bulge = 1.0 });
                    snapshot.Linework.Add(record);
                }
        }

        // ── Annotations (DBText + MText) ─────────────────────────────────────

        private static void CaptureAnnotation(Entity ent, SyncSnapshot snapshot)
        {
                if (ent is DBText dbText)
                {
                    snapshot.Annotations.Add(new SyncAnnotationRecord
                    {
                        Id = ReadXDataString(dbText, RegAppAnnotationId) ?? "cad-handle:" + dbText.Handle.ToString(),
                        Kind = InferAnnotationKind(dbText.Layer),
                        X = dbText.Position.X,
                        Y = dbText.Position.Y,
                        Angle = dbText.Rotation * 180.0 / Math.PI,
                        Text = dbText.TextString,
                        Layer = dbText.Layer,
                        Height = dbText.Height,
                    });
                }
                else if (ent is MText mtext)
                {
                    snapshot.Annotations.Add(new SyncAnnotationRecord
                    {
                        Id = ReadXDataString(mtext, RegAppAnnotationId) ?? "cad-handle:" + mtext.Handle.ToString(),
                        Kind = InferAnnotationKind(mtext.Layer),
                        X = mtext.Location.X,
                        Y = mtext.Location.Y,
                        Angle = mtext.Rotation * 180.0 / Math.PI,
                        Text = mtext.Contents,
                        Layer = mtext.Layer,
                        Height = mtext.TextHeight,
                    });
                }
        }

        private static string InferAnnotationKind(string layer)
        {
            if (string.IsNullOrEmpty(layer)) return "note";
            string n = layer.ToUpperInvariant();
            if (n.Contains("STREET") || n.Contains("ROAD")) return "street-label";
            if (n.Contains("PARCEL") || n.Contains("OWNER")) return "parcel-label";
            if (n.Contains("POINT")) return "point-label";
            return "note";
        }

        // ── Block definitions ────────────────────────────────────────────────

        private static void CaptureBlocks(Database db, Transaction tr, SyncSnapshot snapshot, Action<string> log)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            foreach (ObjectId btrId in bt)
            {
                var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
                if (btr.IsAnonymous || btr.IsLayout) continue;
                if (btr.Name.StartsWith("*")) continue;

                int refs = 0;
                try { refs = btr.GetBlockReferenceIds(false, true).Count; } catch { /* best-effort count */ }

                snapshot.Symbols.Add(new SyncBlockRecord
                {
                    Name = btr.Name,
                    ReferenceCount = refs,
                });
            }
        }

        // ── XData helpers ────────────────────────────────────────────────────

        /// <summary>Read the single value stored under a LandSurv regapp name.
        /// Uses GetXDataForApplication so multiple LandSurv regapps (DESC + PNUM on
        /// the same point) never cross-read each other's payloads.</summary>
        internal static string ReadXDataString(Entity ent, string regAppName)
        {
            try
            {
                ResultBuffer xdata = ent.GetXDataForApplication(regAppName);
                if (xdata == null) return null;
                foreach (TypedValue tv in xdata)
                {
                    // Skip the regapp name marker itself; return the first payload value.
                    if (tv.TypeCode == (int)DxfCode.ExtendedDataRegAppName) continue;
                    return tv.Value?.ToString();
                }
            }
            catch { /* unreadable xdata */ }
            return null;
        }

        /// <summary>Ensure a regapp name is registered (call inside a write transaction).</summary>
        internal static void EnsureRegApp(Database db, Transaction tr, string regAppName)
        {
            var rat = (RegAppTable)tr.GetObject(db.RegAppTableId, OpenMode.ForRead);
            if (rat.Has(regAppName)) return;
            rat.UpgradeOpen();
            var record = new RegAppTableRecord { Name = regAppName };
            rat.Add(record);
            tr.AddNewlyCreatedDBObject(record, true);
        }

        /// <summary>Stamp an entity with a single-value XData payload under a regapp name.</summary>
        internal static void StampXData(Database db, Transaction tr, Entity ent, string regAppName, string value)
        {
            if (string.IsNullOrEmpty(value)) return;
            EnsureRegApp(db, tr, regAppName);
            ent.XData = new ResultBuffer(
                new TypedValue((int)DxfCode.ExtendedDataRegAppName, regAppName),
                new TypedValue((int)DxfCode.ExtendedDataAsciiString, value));
        }
    }
}
