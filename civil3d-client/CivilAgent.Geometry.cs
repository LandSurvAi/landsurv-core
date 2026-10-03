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
    /// <summary>CivilAgent (partial) � Geometry concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Create a line segment in Civil 3D
        /// </summary>
        private string CreateLineSegment(JObject args)
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;

            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    double startX = (double)args["startX"];
                    double startY = (double)args["startY"];
                    double endX = (double)args["endX"];
                    double endY = (double)args["endY"];

                    // Get the block table and model space
                    BlockTable blkTbl = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                    BlockTableRecord btr = (BlockTableRecord)tr.GetObject(blkTbl[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

                    // Create line
                    Autodesk.AutoCAD.DatabaseServices.Line line = new Autodesk.AutoCAD.DatabaseServices.Line(
                        new Autodesk.AutoCAD.Geometry.Point3d(startX, startY, 0),
                        new Autodesk.AutoCAD.Geometry.Point3d(endX, endY, 0)
                    );

                    btr.AppendEntity(line);
                    tr.AddNewlyCreatedDBObject(line, true);

                    tr.Commit();

                    this.PrintMessage($"✓ Created line from ({startX}, {startY}) to ({endX}, {endY})");

                    return $"Line created successfully from ({startX}, {startY}) to ({endX}, {endY})";
                }
                catch (System.Exception ex)
                {
                    tr.Abort();
                    throw new System.Exception($"Failed to create line: {ex.Message}");
                }
            }
        }

    }
}