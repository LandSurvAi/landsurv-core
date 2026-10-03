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
    /// <summary>CivilAgent (partial) � Legend concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Create a Layer Legend in the drawing
        /// Creates horizontal lines (1' long) on each layer with MText labels
        /// This shows the linetype/color of each layer for reference
        /// </summary>
        private string CreateLayerLegend(JObject args)
        {
            this.PrintMessage("[DEBUG] CreateLayerLegend: Starting...");
            
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                this.PrintMessage("[DEBUG] CreateLayerLegend: No active document!");
                return "{\"success\": false, \"error\": \"No active document\"}";
            }

            Database db = doc.Database;
            Editor ed = doc.Editor;

            try
            {
                // Get parameters - support both old (layers) and new (codes) format
                JArray codesArray = args["codes"] as JArray;
                JArray layersArray = args["layers"] as JArray;
                double startX = args["startX"] != null ? (double)args["startX"] : 0.0;
                double startY = args["startY"] != null ? (double)args["startY"] : 0.0;
                // Text height scaled for civil drawings - 4' text as shown in example
                double textHeight = args["textHeight"] != null ? (double)args["textHeight"] : 4.0;
                // Row spacing - tight like the example (about 1.5x text height)
                double rowSpacing = args["rowSpacing"] != null ? (double)args["rowSpacing"] : 6.0;
                string title = args["title"]?.ToString() ?? "CODE LEGEND";
                string textLayer = args["textLayer"]?.ToString() ?? "0";
                // Option to include/exclude symbol geometry rendering
                bool includeSymbolGeometry = args["includeSymbolGeometry"] != null ? (bool)args["includeSymbolGeometry"] : true;

                // === DYNAMIC COLUMN WIDTH CALCULATION ===
                // Scan all codes to find the longest text in each column
                // Character width factor: approximately 0.6 * textHeight for average character width
                double charWidthFactor = textHeight * 0.6;
                double columnPadding = textHeight * 2.0;  // Padding on each side
                
                // Minimum column widths (in drawing units)
                double minColCode = 25.0;
                double minColDesc = 50.0;
                double minColLayer = 40.0;
                double minColLinetype = 35.0;
                double minColLineSample = 50.0;  // Fixed - needs space for line pattern
                double minColSymbol = 25.0;       // Fixed - needs space for symbol geometry
                double minColSymName = 35.0;
                double minColSymLayer = 40.0;
                double minColCategory = 35.0;
                
                // Track max lengths
                int maxCodeLen = 4;  // "Code" header
                int maxDescLen = 11; // "Description" header
                int maxLayerLen = 5; // "Layer" header
                int maxLinetypeLen = 8; // "Linetype" header
                int maxSymNameLen = 8;  // "Sym Name" header
                int maxSymLayerLen = 9; // "Sym Layer" header
                int maxCategoryLen = 8; // "Category" header
                
                // Scan codes for max lengths
                if (codesArray != null)
                {
                    foreach (JObject codeDef in codesArray)
                    {
                        string code = codeDef["code"]?.ToString() ?? "";
                        string description = codeDef["description"]?.ToString() ?? "";
                        string pointLayer = codeDef["pointLayer"]?.ToString() ?? "";
                        string lineLayer = codeDef["lineLayer"]?.ToString() ?? "";
                        string lineType = codeDef["lineType"]?.ToString() ?? "";
                        string symbol = codeDef["symbol"]?.ToString() ?? "";
                        string category = codeDef["category"]?.ToString() ?? "";
                        
                        // Skip category headers
                        if (code.Contains("**") || description.Contains("**")) continue;
                        
                        // Get symbol name from symbolData if available
                        JObject symbolData = codeDef["symbolData"] as JObject;
                        string symbolName = symbolData?["name"]?.ToString() ?? symbol;
                        
                        // Primary layer (prefer line layer)
                        string primaryLayer = lineLayer != "-" && !string.IsNullOrEmpty(lineLayer) ? lineLayer : pointLayer;
                        string symbolLayer = pointLayer != "-" && !string.IsNullOrEmpty(pointLayer) ? pointLayer : "-";
                        
                        // Update max lengths
                        if (code.Length > maxCodeLen) maxCodeLen = code.Length;
                        if (description.Length > maxDescLen) maxDescLen = description.Length;
                        if (primaryLayer.Length > maxLayerLen) maxLayerLen = primaryLayer.Length;
                        if (lineType.Length > maxLinetypeLen) maxLinetypeLen = lineType.Length;
                        if (symbolName.Length > maxSymNameLen) maxSymNameLen = symbolName.Length;
                        if (symbolLayer.Length > maxSymLayerLen) maxSymLayerLen = symbolLayer.Length;
                        if (category.Length > maxCategoryLen) maxCategoryLen = category.Length;
                    }
                }
                
                // Calculate column widths based on max text length
                double colCode = Math.Max(minColCode, maxCodeLen * charWidthFactor + columnPadding);
                double colDesc = Math.Max(minColDesc, maxDescLen * charWidthFactor + columnPadding);
                double colLayer = Math.Max(minColLayer, maxLayerLen * charWidthFactor + columnPadding);
                double colLinetype = Math.Max(minColLinetype, maxLinetypeLen * charWidthFactor + columnPadding);
                double colLineSample = minColLineSample;  // Fixed width for line sample
                double colSymbol = minColSymbol;          // Fixed width for symbol geometry
                double colSymName = Math.Max(minColSymName, maxSymNameLen * charWidthFactor + columnPadding);
                double colSymLayer = Math.Max(minColSymLayer, maxSymLayerLen * charWidthFactor + columnPadding);
                double colCategory = Math.Max(minColCategory, maxCategoryLen * charWidthFactor + columnPadding);
                
                this.PrintMessage($"[Legend] Dynamic column widths - Code:{colCode:F1} Desc:{colDesc:F1} Layer:{colLayer:F1} LT:{colLinetype:F1} SymName:{colSymName:F1} SymLayer:{colSymLayer:F1} Cat:{colCategory:F1}");
                
                double columnWidth = colCode + colDesc + colLayer + colLinetype + colLineSample + colSymbol + colSymName + colSymLayer + colCategory;
                double columnGap = 30.0;      // Gap between EXISTING and DESIGN columns
                double totalWidth = columnWidth * 2 + columnGap;

                int rowsCreated = 0;
                int textCreated = 0;
                int linesCreated = 0;

                // New format with full code data
                if (codesArray != null && codesArray.Count > 0)
                {
                    this.PrintMessage($"Creating code legend table with {codesArray.Count} entries at ({startX}, {startY})...");

                    using (doc.LockDocument())
                    {
                        using (Transaction tr = db.TransactionManager.StartTransaction())
                        {
                            BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                            BlockTableRecord ms = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite) as BlockTableRecord;
                            LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;

                            double currentY = startY;
                            double headerHeight = textHeight * 1.5;

                            // Ensure text layer exists
                            ObjectId textLayerId = lt.Has(textLayer) ? lt[textLayer] : db.Clayer;

                            // Create title
                            if (!string.IsNullOrEmpty(title))
                            {
                                MText titleText = new MText();
                                titleText.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX, currentY, 0);
                                titleText.Contents = $"\\L{title}"; // Underlined
                                titleText.TextHeight = textHeight * 2.0;
                                titleText.Attachment = AttachmentPoint.TopLeft;
                                titleText.LayerId = textLayerId;
                                ms.AppendEntity(titleText);
                                tr.AddNewlyCreatedDBObject(titleText, true);
                                textCreated++;
                                currentY -= rowSpacing * 2.5;
                            }

                            // === LAYER NAMING CONVENTION DIAGRAM ===
                            // Create a clean, well-organized explanation of layer naming format
                            double diagramY = currentY;
                            double diagramTextHeight = textHeight * 0.85;
                            double smallTextHeight = textHeight * 0.7;
                            double labelColWidth = 90.0;  // Width for labels like "Format:", "Discipline:"

                            // Section title
                            MText conventionTitle = new MText();
                            conventionTitle.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX, diagramY, 0);
                            conventionTitle.Contents = "\\BLAYER NAMING CONVENTION (AEC/NCS Standard)";
                            conventionTitle.TextHeight = textHeight * 1.0;
                            conventionTitle.Attachment = AttachmentPoint.TopLeft;
                            conventionTitle.LayerId = textLayerId;
                            ms.AppendEntity(conventionTitle);
                            tr.AddNewlyCreatedDBObject(conventionTitle, true);
                            textCreated++;
                            diagramY -= rowSpacing * 1.8;

                            // Row 1: Format and Example on same line
                            MText formatLabel = new MText();
                            formatLabel.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX, diagramY, 0);
                            formatLabel.Contents = "\\BFormat:";
                            formatLabel.TextHeight = diagramTextHeight;
                            formatLabel.Attachment = AttachmentPoint.TopLeft;
                            formatLabel.LayerId = textLayerId;
                            ms.AppendEntity(formatLabel);
                            tr.AddNewlyCreatedDBObject(formatLabel, true);
                            textCreated++;

                            MText formatValue = new MText();
                            formatValue.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX + labelColWidth, diagramY, 0);
                            formatValue.Contents = "\\BC-MAJOR-MINOR-STATUS";
                            formatValue.TextHeight = diagramTextHeight;
                            formatValue.Attachment = AttachmentPoint.TopLeft;
                            formatValue.LayerId = textLayerId;
                            ms.AppendEntity(formatValue);
                            tr.AddNewlyCreatedDBObject(formatValue, true);
                            textCreated++;

                            MText exampleLabel = new MText();
                            exampleLabel.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX + 300, diagramY, 0);
                            exampleLabel.Contents = "\\BExample:";
                            exampleLabel.TextHeight = diagramTextHeight;
                            exampleLabel.Attachment = AttachmentPoint.TopLeft;
                            exampleLabel.LayerId = textLayerId;
                            ms.AppendEntity(exampleLabel);
                            tr.AddNewlyCreatedDBObject(exampleLabel, true);
                            textCreated++;

                            MText exampleValue = new MText();
                            exampleValue.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX + 370, diagramY, 0);
                            exampleValue.Contents = "C-PROP-ESMT-E = Civil Property Easement Existing";
                            exampleValue.TextHeight = diagramTextHeight;
                            exampleValue.Attachment = AttachmentPoint.TopLeft;
                            exampleValue.LayerId = textLayerId;
                            ms.AppendEntity(exampleValue);
                            tr.AddNewlyCreatedDBObject(exampleValue, true);
                            textCreated++;
                            diagramY -= rowSpacing * 1.5;

                            // Row 2: Discipline codes - all on one line
                            MText disciplineLabel = new MText();
                            disciplineLabel.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX, diagramY, 0);
                            disciplineLabel.Contents = "\\BDiscipline:";
                            disciplineLabel.TextHeight = smallTextHeight;
                            disciplineLabel.Attachment = AttachmentPoint.TopLeft;
                            disciplineLabel.LayerId = textLayerId;
                            ms.AppendEntity(disciplineLabel);
                            tr.AddNewlyCreatedDBObject(disciplineLabel, true);
                            textCreated++;

                            string[] disciplines = {
                                "C = Civil", "V = Survey", "A = Architectural", "E = Electrical",
                                "L = Landscape", "S = Structural", "M = Mechanical", "G = General"
                            };
                            double discX = startX + labelColWidth;
                            double discSpacing = 100.0;
                            for (int d = 0; d < disciplines.Length; d++)
                            {
                                MText discText = new MText();
                                discText.Location = new Autodesk.AutoCAD.Geometry.Point3d(discX + (d * discSpacing), diagramY, 0);
                                discText.Contents = disciplines[d];
                                discText.TextHeight = smallTextHeight;
                                discText.Attachment = AttachmentPoint.TopLeft;
                                discText.LayerId = textLayerId;
                                ms.AppendEntity(discText);
                                tr.AddNewlyCreatedDBObject(discText, true);
                                textCreated++;
                            }
                            diagramY -= rowSpacing * 1.3;

                            // Row 3: Status suffix - all on one line
                            MText statusLabel = new MText();
                            statusLabel.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX, diagramY, 0);
                            statusLabel.Contents = "\\BStatus Suffix:";
                            statusLabel.TextHeight = smallTextHeight;
                            statusLabel.Attachment = AttachmentPoint.TopLeft;
                            statusLabel.LayerId = textLayerId;
                            ms.AppendEntity(statusLabel);
                            tr.AddNewlyCreatedDBObject(statusLabel, true);
                            textCreated++;

                            string[] statuses = { "-E = Existing", "-N = New", "-D = Demo", "-F = Future" };
                            for (int s = 0; s < statuses.Length; s++)
                            {
                                MText statusText = new MText();
                                statusText.Location = new Autodesk.AutoCAD.Geometry.Point3d(discX + (s * discSpacing), diagramY, 0);
                                statusText.Contents = statuses[s];
                                statusText.TextHeight = smallTextHeight;
                                statusText.Attachment = AttachmentPoint.TopLeft;
                                statusText.LayerId = textLayerId;
                                ms.AppendEntity(statusText);
                                tr.AddNewlyCreatedDBObject(statusText, true);
                                textCreated++;
                            }
                            diagramY -= rowSpacing * 2.0;  // Space before separator

                            // Draw separator line
                            Autodesk.AutoCAD.DatabaseServices.Line sepLine = new Autodesk.AutoCAD.DatabaseServices.Line(
                                new Autodesk.AutoCAD.Geometry.Point3d(startX, diagramY, 0),
                                new Autodesk.AutoCAD.Geometry.Point3d(startX + totalWidth, diagramY, 0)
                            );
                            sepLine.LayerId = textLayerId;
                            ms.AppendEntity(sepLine);
                            tr.AddNewlyCreatedDBObject(sepLine, true);
                            linesCreated++;

                            currentY = diagramY - rowSpacing;
                            // === END LAYER NAMING CONVENTION DIAGRAM ===

                            // === REORGANIZE CODES BY STATUS: EXISTING vs DESIGN/NEW ===
                            // Separate codes into Existing and Design groups based on layer naming AND description
                            var existingCodes = new List<JObject>();
                            var designCodes = new List<JObject>();
                            
                            foreach (JObject codeDef in codesArray)
                            {
                                string lineLayer = codeDef["lineLayer"]?.ToString() ?? "";
                                string pointLayer = codeDef["pointLayer"]?.ToString() ?? "";
                                string description = codeDef["description"]?.ToString() ?? "";
                                string code = codeDef["code"]?.ToString() ?? "";
                                
                                // SKIP category headers (entries with ** in code or description)
                                if (code.Contains("**") || description.Contains("**") || 
                                    code.StartsWith("*") || description.StartsWith("*"))
                                {
                                    continue;  // Skip category separator rows
                                }
                                
                                // Skip entries with no real layer data
                                if (string.IsNullOrEmpty(lineLayer) && string.IsNullOrEmpty(pointLayer))
                                {
                                    continue;
                                }
                                if (lineLayer == "-" && pointLayer == "-")
                                {
                                    continue;
                                }
                                
                                // Check if this is an existing/found feature:
                                // 1. Layer ends with -E (existing suffix)
                                // 2. Layer contains EXIST
                                // 3. Description contains "Found" or "Existing" (survey markers that were found)
                                bool isExisting = lineLayer.EndsWith("-E") || pointLayer.EndsWith("-E") ||
                                                  lineLayer.Contains("EXIST") || pointLayer.Contains("EXIST") ||
                                                  lineLayer.EndsWith("-E-") || pointLayer.EndsWith("-E-") ||
                                                  description.Contains("Found") || description.Contains("Existing");
                                
                                if (isExisting)
                                    existingCodes.Add(codeDef);
                                else
                                    designCodes.Add(codeDef);
                            }

                            // Sort each group by category
                            existingCodes = existingCodes.OrderBy(c => c["category"]?.ToString() ?? "").ToList();
                            designCodes = designCodes.OrderBy(c => c["category"]?.ToString() ?? "").ToList();

                            LinetypeTable ltt = tr.GetObject(db.LinetypeTableId, OpenMode.ForRead) as LinetypeTable;
                            
                            // Define column structure - EXISTING has Code column, DESIGN does not
                            // EXISTING: Code | Description | Layer | Linetype | Line | Symbol | SymName | SymLayer | Category
                            // DESIGN:   Description | Layer | Linetype | Line | Symbol | SymName | SymLayer | Category (NO CODE)
                            string[] existingHeaders = { "Code", "Description", "Layer", "Linetype", "Line", "Symbol", "Sym Name", "Sym Layer", "Category" };
                            double[] existingWidths = { colCode, colDesc, colLayer, colLinetype, colLineSample, colSymbol, colSymName, colSymLayer, colCategory };
                            
                            string[] designHeaders = { "Description", "Layer", "Linetype", "Line", "Symbol", "Sym Name", "Sym Layer", "Category" };
                            double[] designWidths = { colDesc + colCode, colLayer, colLinetype, colLineSample, colSymbol, colSymName, colSymLayer, colCategory };  // Description gets extra space

                            // Helper function to draw a column table (EXISTING or DESIGN)
                            // isExistingTable: true = show Code column, false = no Code column (design doesn't need codes)
                            Action<double, string, string, List<JObject>, bool> drawColumnTable = (colStartX, tableTitle, subtitle, codesList, isExistingTable) =>
                            {
                                // Select headers and widths based on table type
                                string[] tableHeaders = isExistingTable ? existingHeaders : designHeaders;
                                double[] tableWidths = isExistingTable ? existingWidths : designWidths;
                                double tableColumnWidth = 0;
                                foreach (double w in tableWidths) tableColumnWidth += w;
                                
                                double tableY = currentY;
                                
                                // Draw section title
                                MText sectionTitle = new MText();
                                sectionTitle.Location = new Autodesk.AutoCAD.Geometry.Point3d(colStartX, tableY, 0);
                                sectionTitle.Contents = $"\\B{tableTitle}";
                                sectionTitle.TextHeight = textHeight * 1.3;
                                sectionTitle.Attachment = AttachmentPoint.TopLeft;
                                sectionTitle.LayerId = textLayerId;
                                ms.AppendEntity(sectionTitle);
                                tr.AddNewlyCreatedDBObject(sectionTitle, true);
                                textCreated++;
                                
                                // Draw subtitle
                                MText subtitleText = new MText();
                                subtitleText.Location = new Autodesk.AutoCAD.Geometry.Point3d(colStartX, tableY - rowSpacing * 0.8, 0);
                                subtitleText.Contents = subtitle;
                                subtitleText.TextHeight = textHeight * 0.7;
                                subtitleText.Attachment = AttachmentPoint.TopLeft;
                                subtitleText.LayerId = textLayerId;
                                ms.AppendEntity(subtitleText);
                                tr.AddNewlyCreatedDBObject(subtitleText, true);
                                textCreated++;
                                
                                tableY -= rowSpacing * 1.8;
                                
                                // Draw header row
                                double xOffset = colStartX;
                                for (int i = 0; i < tableHeaders.Length; i++)
                                {
                                    MText headerText = new MText();
                                    headerText.Location = new Autodesk.AutoCAD.Geometry.Point3d(xOffset, tableY, 0);
                                    headerText.Contents = $"\\B{tableHeaders[i]}";
                                    headerText.TextHeight = textHeight * 1.1;
                                    headerText.Attachment = AttachmentPoint.TopLeft;
                                    headerText.LayerId = textLayerId;
                                    ms.AppendEntity(headerText);
                                    tr.AddNewlyCreatedDBObject(headerText, true);
                                    textCreated++;
                                    xOffset += tableWidths[i];
                                }
                                
                                // Header underline
                                Autodesk.AutoCAD.DatabaseServices.Line headerLine = new Autodesk.AutoCAD.DatabaseServices.Line(
                                    new Autodesk.AutoCAD.Geometry.Point3d(colStartX, tableY - rowSpacing * 0.7, 0),
                                    new Autodesk.AutoCAD.Geometry.Point3d(colStartX + tableColumnWidth, tableY - rowSpacing * 0.7, 0)
                                );
                                headerLine.LayerId = textLayerId;
                                ms.AppendEntity(headerLine);
                                tr.AddNewlyCreatedDBObject(headerLine, true);
                                linesCreated++;
                                
                                tableY -= rowSpacing * 1.2;
                                
                                // Draw data rows
                                string lastCategory = "";
                                foreach (JObject codeDef in codesList)
                                {
                                    try
                                    {
                                        string code = codeDef["code"]?.ToString() ?? "";
                                        string description = codeDef["description"]?.ToString() ?? "";
                                        string pointLayer = codeDef["pointLayer"]?.ToString() ?? "-";
                                        string lineLayer = codeDef["lineLayer"]?.ToString() ?? "-";
                                        string lineType = codeDef["lineType"]?.ToString() ?? "-";
                                        string symbol = codeDef["symbol"]?.ToString() ?? "-";
                                        string category = codeDef["category"]?.ToString() ?? "-";
                                        
                                        // Get primary layer (prefer line layer, then point layer)
                                        string primaryLayer = lineLayer != "-" ? lineLayer : pointLayer;
                                        
                                        // Get symbol info - check both symbolData object and direct properties
                                        JObject symbolData = codeDef["symbolData"] as JObject;
                                        string symbolName = symbolData?["name"]?.ToString() ?? symbol;
                                        // Try multiple sources for SVG path
                                        string symbolSvgPath = symbolData?["svgPath"]?.ToString() 
                                            ?? symbolData?["path"]?.ToString()
                                            ?? codeDef["svgPath"]?.ToString()
                                            ?? codeDef["symbolPath"]?.ToString();
                                        string symbolFillPath = symbolData?["fillPath"]?.ToString()
                                            ?? codeDef["fillPath"]?.ToString();
                                        string symbolViewBox = symbolData?["viewBox"]?.ToString() 
                                            ?? codeDef["viewBox"]?.ToString()
                                            ?? "0 0 24 24";

                                        // Add category separator if category changed
                                        if (category != lastCategory && category != "-" && !string.IsNullOrEmpty(category))
                                        {
                                            if (lastCategory != "")
                                            {
                                                tableY -= rowSpacing * 0.2;
                                            }
                                            lastCategory = category;
                                        }

                                        xOffset = colStartX;
                                        
                                        // Get symbol layer (pointLayer for symbols)
                                        string symbolLayer = pointLayer != "-" ? pointLayer : "-";
                                        
                                        // Build values array based on table type
                                        // EXISTING: Code | Description | Layer | Linetype | Line | Symbol | SymName | SymLayer | Category
                                        // DESIGN:   Description | Layer | Linetype | Line | Symbol | SymName | SymLayer | Category
                                        string[] values;
                                        int lineColIndex, symbolColIndex, symNameColIndex, symLayerColIndex, layerColIndex;
                                        if (isExistingTable)
                                        {
                                            values = new string[] { code, description, primaryLayer, lineType, "", "", symbolName, symbolLayer, category };
                                            lineColIndex = 4;
                                            symbolColIndex = 5;     // Symbol geometry column
                                            symNameColIndex = 6;    // Symbol name column  
                                            symLayerColIndex = 7;   // Symbol layer column
                                            layerColIndex = 2;
                                        }
                                        else
                                        {
                                            // Design table - no Code column
                                            values = new string[] { description, primaryLayer, lineType, "", "", symbolName, symbolLayer, category };
                                            lineColIndex = 3;
                                            symbolColIndex = 4;     // Symbol geometry column
                                            symNameColIndex = 5;    // Symbol name column
                                            symLayerColIndex = 6;   // Symbol layer column
                                            layerColIndex = 1;
                                        }

                                        for (int i = 0; i < values.Length; i++)
                                        {
                                            // Line sample column - draw actual line
                                            if (i == lineColIndex)
                                            {
                                                double lineY = tableY - textHeight * 0.5;
                                                double lineStartX = xOffset + 2.5;
                                                double lineEndX = xOffset + tableWidths[i] - 5;
                                                
                                                ObjectId lineLayerToUse = textLayerId;
                                                if (lineLayer != "-" && !string.IsNullOrEmpty(lineLayer) && lt.Has(lineLayer))
                                                {
                                                    lineLayerToUse = lt[lineLayer];
                                                }
                                                else if (pointLayer != "-" && !string.IsNullOrEmpty(pointLayer) && lt.Has(pointLayer))
                                                {
                                                    lineLayerToUse = lt[pointLayer];
                                                }
                                                
                                                Autodesk.AutoCAD.DatabaseServices.Line sampleLine = new Autodesk.AutoCAD.DatabaseServices.Line(
                                                    new Autodesk.AutoCAD.Geometry.Point3d(lineStartX, lineY, 0),
                                                    new Autodesk.AutoCAD.Geometry.Point3d(lineEndX, lineY, 0)
                                                );
                                                sampleLine.LayerId = lineLayerToUse;
                                                sampleLine.LinetypeId = db.ByLayerLinetype;
                                                sampleLine.LinetypeScale = 0.15;
                                                
                                                ms.AppendEntity(sampleLine);
                                                tr.AddNewlyCreatedDBObject(sampleLine, true);
                                                linesCreated++;
                                                
                                                xOffset += tableWidths[i];
                                                continue;
                                            }
                                            
                                            // Symbol geometry column - draw the actual symbol shape
                                            if (i == symbolColIndex)
                                            {
                                                if (includeSymbolGeometry && !string.IsNullOrEmpty(symbolSvgPath) && symbolSvgPath != "-")
                                                {
                                                    ObjectId symbolLayerId = textLayerId;
                                                    if (pointLayer != "-" && lt.Has(pointLayer))
                                                    {
                                                        symbolLayerId = lt[pointLayer];
                                                    }

                                                    double symbolSize = textHeight * 1.4;
                                                    double symbolCenterX = xOffset + tableWidths[i] / 2;
                                                    double symbolCenterY = tableY - textHeight * 0.4;

                                                    int entitiesDrawn = DrawSvgSymbol(
                                                        ms, tr, symbolSvgPath, symbolFillPath, symbolViewBox,
                                                        symbolCenterX, symbolCenterY, symbolSize, symbolLayerId,
                                                        msg => this.PrintMessage(msg)
                                                    );
                                                    linesCreated += entitiesDrawn;
                                                }
                                                
                                                xOffset += tableWidths[i];
                                                continue;
                                            }
                                            
                                            // Symbol name column - just text
                                            if (i == symNameColIndex)
                                            {
                                                if (!string.IsNullOrEmpty(symbolName) && symbolName != "-")
                                                {
                                                    MText symNameText = new MText();
                                                    symNameText.Location = new Autodesk.AutoCAD.Geometry.Point3d(xOffset, tableY, 0);
                                                    symNameText.Contents = symbolName;
                                                    symNameText.TextHeight = textHeight * 0.85;
                                                    symNameText.Attachment = AttachmentPoint.TopLeft;
                                                    symNameText.LayerId = textLayerId;
                                                    ms.AppendEntity(symNameText);
                                                    tr.AddNewlyCreatedDBObject(symNameText, true);
                                                    textCreated++;
                                                }
                                                
                                                xOffset += tableWidths[i];
                                                continue;
                                            }
                                            
                                            // Symbol layer column - text with layer color
                                            if (i == symLayerColIndex)
                                            {
                                                if (!string.IsNullOrEmpty(symbolLayer) && symbolLayer != "-")
                                                {
                                                    MText symLayerText = new MText();
                                                    symLayerText.Location = new Autodesk.AutoCAD.Geometry.Point3d(xOffset, tableY, 0);
                                                    symLayerText.Contents = symbolLayer;
                                                    symLayerText.TextHeight = textHeight * 0.85;
                                                    symLayerText.Attachment = AttachmentPoint.TopLeft;
                                                    symLayerText.LayerId = textLayerId;
                                                    
                                                    // Color by layer if layer exists
                                                    if (lt.Has(symbolLayer))
                                                    {
                                                        LayerTableRecord ltr = tr.GetObject(lt[symbolLayer], OpenMode.ForRead) as LayerTableRecord;
                                                        if (ltr != null && !ltr.Color.IsByAci)
                                                        {
                                                            symLayerText.Color = ltr.Color;
                                                        }
                                                    }
                                                    
                                                    ms.AppendEntity(symLayerText);
                                                    tr.AddNewlyCreatedDBObject(symLayerText, true);
                                                    textCreated++;
                                                }
                                                
                                                xOffset += tableWidths[i];
                                                continue;
                                            }
                                            
                                            MText cellText = new MText();
                                            cellText.Location = new Autodesk.AutoCAD.Geometry.Point3d(xOffset, tableY, 0);
                                            cellText.Contents = values[i];
                                            cellText.TextHeight = textHeight;
                                            cellText.Attachment = AttachmentPoint.TopLeft;
                                            cellText.LayerId = textLayerId;
                                            
                                            // Color the layer column if the layer exists
                                            if (i == layerColIndex && values[i] != "-" && lt.Has(values[i]))
                                            {
                                                LayerTableRecord ltr = tr.GetObject(lt[values[i]], OpenMode.ForRead) as LayerTableRecord;
                                                if (ltr != null && !ltr.Color.IsByAci)
                                                {
                                                    cellText.Color = ltr.Color;
                                                }
                                            }
                                            
                                            ms.AppendEntity(cellText);
                                            tr.AddNewlyCreatedDBObject(cellText, true);
                                            textCreated++;
                                            xOffset += tableWidths[i];
                                        }

                                        rowsCreated++;
                                        tableY -= rowSpacing;
                                    }
                                    catch (System.Exception rowEx)
                                    {
                                        this.PrintMessage($"  Error creating row: {rowEx.Message}");
                                    }
                                }
                                
                                // Draw bottom border for this column
                                Autodesk.AutoCAD.DatabaseServices.Line bottomLine = new Autodesk.AutoCAD.DatabaseServices.Line(
                                    new Autodesk.AutoCAD.Geometry.Point3d(colStartX, tableY + rowSpacing * 0.3, 0),
                                    new Autodesk.AutoCAD.Geometry.Point3d(colStartX + tableColumnWidth, tableY + rowSpacing * 0.3, 0)
                                );
                                bottomLine.LayerId = textLayerId;
                                ms.AppendEntity(bottomLine);
                                tr.AddNewlyCreatedDBObject(bottomLine, true);
                                linesCreated++;
                            };

                            // === DRAW TWO SIDE-BY-SIDE COLUMNS ===
                            double existingStartX = startX;
                            double designStartX = startX + columnWidth + columnGap;
                            
                            if (existingCodes.Count > 0)
                            {
                                drawColumnTable(existingStartX, "EXISTING FEATURES", "(Survey codes for found monuments)", existingCodes, true);  // true = show Code column
                            }
                            
                            if (designCodes.Count > 0)
                            {
                                drawColumnTable(designStartX, "DESIGN / NEW FEATURES", "(Staking - no codes needed)", designCodes, false);  // false = no Code column
                            }

                            tr.Commit();
                        }
                    }

                    ed.Command("_.ZOOM", "_E");

                    JObject response = new JObject();
                    response["success"] = true;
                    response["rowsCreated"] = rowsCreated;
                    response["textCreated"] = textCreated;
                    response["linesCreated"] = linesCreated;
                    response["startPoint"] = $"({startX}, {startY})";
                    response["message"] = $"Code legend table created: {rowsCreated} rows, {textCreated} text labels, {linesCreated} line samples";

                    this.PrintMessage($"✓ Code legend complete: {rowsCreated} rows, {textCreated} text labels, {linesCreated} line samples");
                    return response.ToString();
                }
                // Legacy format with just layer names
                else if (layersArray != null && layersArray.Count > 0)
                {
                    double lineLength = args["lineLength"] != null ? (double)args["lineLength"] : 1.0;
                    double spacing = args["spacing"] != null ? (double)args["spacing"] : 0.25;
                    double textOffset = args["textOffset"] != null ? (double)args["textOffset"] : 0.15;

                    this.PrintMessage($"Creating layer legend with {layersArray.Count} entries at ({startX}, {startY})...");

                    using (doc.LockDocument())
                    {
                        using (Transaction tr = db.TransactionManager.StartTransaction())
                        {
                            BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                            BlockTableRecord ms = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite) as BlockTableRecord;
                            LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;

                            double currentY = startY;
                            ObjectId textLayerId = lt.Has(textLayer) ? lt[textLayer] : db.Clayer;

                            // Create title
                            if (!string.IsNullOrEmpty(title))
                            {
                                MText titleText = new MText();
                                titleText.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX, currentY, 0);
                                titleText.Contents = title;
                                titleText.TextHeight = textHeight * 1.5;
                                titleText.Attachment = AttachmentPoint.TopLeft;
                                titleText.LayerId = textLayerId;
                                ms.AppendEntity(titleText);
                                tr.AddNewlyCreatedDBObject(titleText, true);
                                textCreated++;
                                currentY -= spacing * 2;
                            }

                            // Create line + text for each layer
                            foreach (JObject layerDef in layersArray)
                            {
                                try
                                {
                                    string layerName = layerDef["name"]?.ToString();
                                    if (string.IsNullOrWhiteSpace(layerName)) continue;

                                    if (!lt.Has(layerName))
                                    {
                                        this.PrintMessage($"  Warning: Layer '{layerName}' not found, skipping");
                                        continue;
                                    }

                                    ObjectId layerId = lt[layerName];

                                    Autodesk.AutoCAD.DatabaseServices.Line line = new Autodesk.AutoCAD.DatabaseServices.Line(
                                        new Autodesk.AutoCAD.Geometry.Point3d(startX, currentY, 0),
                                        new Autodesk.AutoCAD.Geometry.Point3d(startX + lineLength, currentY, 0)
                                    );
                                    line.LayerId = layerId;
                                    ms.AppendEntity(line);
                                    tr.AddNewlyCreatedDBObject(line, true);
                                    rowsCreated++;

                                    MText label = new MText();
                                    label.Location = new Autodesk.AutoCAD.Geometry.Point3d(startX + lineLength + textOffset, currentY + (textHeight / 2), 0);
                                    label.Contents = layerName;
                                    label.TextHeight = textHeight;
                                    label.Attachment = AttachmentPoint.MiddleLeft;
                                    label.LayerId = textLayerId;
                                    ms.AppendEntity(label);
                                    tr.AddNewlyCreatedDBObject(label, true);
                                    textCreated++;

                                    currentY -= spacing;
                                }
                                catch (System.Exception layerEx)
                                {
                                    this.PrintMessage($"  Error creating legend entry: {layerEx.Message}");
                                }
                            }

                            tr.Commit();
                        }
                    }

                    ed.Command("_.ZOOM", "_E");

                    JObject response = new JObject();
                    response["success"] = true;
                    response["linesCreated"] = rowsCreated;
                    response["textCreated"] = textCreated;
                    response["startPoint"] = $"({startX}, {startY})";
                    response["message"] = $"Layer legend created: {rowsCreated} lines, {textCreated} text labels";

                    this.PrintMessage($"✓ Layer legend complete: {rowsCreated} lines, {textCreated} text labels");
                    return response.ToString();
                }
                else
                {
                    this.PrintMessage("[DEBUG] CreateLayerLegend: No codes or layers in args!");
                    return "{\"success\": false, \"error\": \"No codes or layers provided\"}";
                }
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"[DEBUG] CreateLayerLegend error: {ex.Message}");
                return $"{{\"success\": false, \"error\": \"{ex.Message.Replace("\"", "\\\"")}\"}}";
            }
        }

        /// <summary>
        /// Draw an SVG symbol as AutoCAD entities
        /// Parses simple SVG path commands (M, L, A, H, V, Z) and draws lines/circles/arcs
        /// </summary>
        /// <param name="ms">Model space to add entities to</param>
        /// <param name="tr">Transaction</param>
        /// <param name="svgPath">SVG path d attribute (stroke path)</param>
        /// <param name="fillPath">Optional fill path (for filled shapes)</param>
        /// <param name="viewBox">SVG viewBox (e.g., "0 0 24 24")</param>
        /// <param name="centerX">Center X coordinate in drawing</param>
        /// <param name="centerY">Center Y coordinate in drawing</param>
        /// <param name="size">Desired size of symbol</param>
        /// <param name="layerId">Layer to place entities on</param>
        /// <returns>Number of entities created</returns>
        internal static int DrawSvgSymbol(
            BlockTableRecord ms,
            Transaction tr,
            string svgPath,
            string fillPath,
            string viewBox,
            double centerX,
            double centerY,
            double size,
            ObjectId layerId,
            Action<string> log)
        {
            int entitiesCreated = 0;
            
            try
            {
                // Parse viewBox to get scale factor
                double[] vb = viewBox.Split(' ').Select(s => double.Parse(s)).ToArray();
                double vbWidth = vb.Length >= 3 ? vb[2] : 24;
                double vbHeight = vb.Length >= 4 ? vb[3] : 24;
                double scale = size / Math.Max(vbWidth, vbHeight);

                // Offset to center the symbol
                double offsetX = centerX - (vbWidth / 2.0) * scale;
                double offsetY = centerY + (vbHeight / 2.0) * scale;

                // Helper to transform SVG coords to drawing coords
                Func<double, double, Autodesk.AutoCAD.Geometry.Point3d> toDrawing = (sx, sy) =>
                {
                    double dx = offsetX + sx * scale;
                    double dy = offsetY - sy * scale; // SVG Y is inverted
                    return new Autodesk.AutoCAD.Geometry.Point3d(dx, dy, 0);
                };

                // Parse and draw the path
                entitiesCreated += ParseAndDrawSvgPath(ms, tr, svgPath, toDrawing, layerId, false, log);
                
                // Draw fill path if provided (as hatched region - simplified to polyline for now)
                if (!string.IsNullOrEmpty(fillPath))
                {
                    entitiesCreated += ParseAndDrawSvgPath(ms, tr, fillPath, toDrawing, layerId, true, log);
                }
            }
            catch (System.Exception ex)
            {
                log?.Invoke($"  Error drawing SVG symbol: {ex.Message}");
            }

            return entitiesCreated;
        }

        /// <summary>
        /// Parse SVG path and draw as AutoCAD entities
        /// </summary>
        internal static int ParseAndDrawSvgPath(
            BlockTableRecord ms,
            Transaction tr,
            string pathData,
            Func<double, double, Autodesk.AutoCAD.Geometry.Point3d> toDrawing,
            ObjectId layerId,
            bool isFill,
            Action<string> log)
        {
            int entitiesCreated = 0;
            
            try
            {
                // Parse SVG path commands
                // Supported: M (moveto), L (lineto), H (horizontal), V (vertical), A (arc), Z (close)
                var commands = System.Text.RegularExpressions.Regex.Matches(
                    pathData, 
                    @"([MLHVAZmlhvaz])\s*([-\d.,\s]*)"
                );

                double currentX = 0, currentY = 0;
                double startX = 0, startY = 0;
                bool pathStarted = false;
                var polyPoints = new List<Autodesk.AutoCAD.Geometry.Point2d>();

                foreach (System.Text.RegularExpressions.Match cmd in commands)
                {
                    char command = cmd.Groups[1].Value[0];
                    string args = cmd.Groups[2].Value.Trim();
                    double[] nums = string.IsNullOrEmpty(args) ? new double[0] :
                        args.Split(new[] { ',', ' ' }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(s => double.Parse(s))
                            .ToArray();

                    bool isRelative = char.IsLower(command);
                    command = char.ToUpper(command);

                    switch (command)
                    {
                        case 'M': // MoveTo
                            // Flush previous polyline if exists
                            if (polyPoints.Count > 1)
                            {
                                var pline = new Autodesk.AutoCAD.DatabaseServices.Polyline();
                                for (int j = 0; j < polyPoints.Count; j++)
                                {
                                    pline.AddVertexAt(j, polyPoints[j], 0, 0, 0);
                                }
                                pline.LayerId = layerId;
                                if (isFill) pline.Closed = true;
                                ms.AppendEntity(pline);
                                tr.AddNewlyCreatedDBObject(pline, true);
                                entitiesCreated++;
                            }
                            polyPoints.Clear();

                            if (nums.Length >= 2)
                            {
                                currentX = isRelative ? currentX + nums[0] : nums[0];
                                currentY = isRelative ? currentY + nums[1] : nums[1];
                                startX = currentX;
                                startY = currentY;
                                var pt = toDrawing(currentX, currentY);
                                polyPoints.Add(new Autodesk.AutoCAD.Geometry.Point2d(pt.X, pt.Y));
                                pathStarted = true;
                            }
                            break;

                        case 'L': // LineTo
                            for (int j = 0; j + 1 < nums.Length; j += 2)
                            {
                                currentX = isRelative ? currentX + nums[j] : nums[j];
                                currentY = isRelative ? currentY + nums[j + 1] : nums[j + 1];
                                var pt = toDrawing(currentX, currentY);
                                polyPoints.Add(new Autodesk.AutoCAD.Geometry.Point2d(pt.X, pt.Y));
                            }
                            break;

                        case 'H': // Horizontal LineTo
                            foreach (double x in nums)
                            {
                                currentX = isRelative ? currentX + x : x;
                                var pt = toDrawing(currentX, currentY);
                                polyPoints.Add(new Autodesk.AutoCAD.Geometry.Point2d(pt.X, pt.Y));
                            }
                            break;

                        case 'V': // Vertical LineTo
                            foreach (double y in nums)
                            {
                                currentY = isRelative ? currentY + y : y;
                                var pt = toDrawing(currentX, currentY);
                                polyPoints.Add(new Autodesk.AutoCAD.Geometry.Point2d(pt.X, pt.Y));
                            }
                            break;

                        case 'A': // Arc (rx ry x-rotation large-arc-flag sweep-flag x y)
                            // Simplified: draw as circle if rx == ry, else approximate with line
                            for (int j = 0; j + 6 < nums.Length; j += 7)
                            {
                                double rx = nums[j];
                                double ry = nums[j + 1];
                                double endX = isRelative ? currentX + nums[j + 5] : nums[j + 5];
                                double endY = isRelative ? currentY + nums[j + 6] : nums[j + 6];

                                // If it's a full circle (start == end after transform), draw circle
                                if (Math.Abs(rx - ry) < 0.01 && j == 0 && nums.Length == 7)
                                {
                                    // Likely a circle - calculate center
                                    double circleX = (currentX + endX) / 2;
                                    double circleY = currentY; // Center Y is at start Y for horizontal arc
                                    var centerPt = toDrawing(circleX, circleY);
                                    var radiusPt = toDrawing(currentX, currentY);
                                    double radius = Math.Abs(centerPt.X - radiusPt.X);
                                    
                                    if (radius > 0.001)
                                    {
                                        var circle = new Circle(centerPt, Autodesk.AutoCAD.Geometry.Vector3d.ZAxis, radius);
                                        circle.LayerId = layerId;
                                        ms.AppendEntity(circle);
                                        tr.AddNewlyCreatedDBObject(circle, true);
                                        entitiesCreated++;
                                    }
                                }
                                else
                                {
                                    // Approximate arc with line for now
                                    var pt = toDrawing(endX, endY);
                                    polyPoints.Add(new Autodesk.AutoCAD.Geometry.Point2d(pt.X, pt.Y));
                                }

                                currentX = endX;
                                currentY = endY;
                            }
                            break;

                        case 'Z': // ClosePath
                            if (polyPoints.Count > 1)
                            {
                                // Close by returning to start
                                var startPt = toDrawing(startX, startY);
                                polyPoints.Add(new Autodesk.AutoCAD.Geometry.Point2d(startPt.X, startPt.Y));
                            }
                            break;
                    }
                }

                // Flush any remaining polyline
                if (polyPoints.Count > 1)
                {
                    var pline = new Autodesk.AutoCAD.DatabaseServices.Polyline();
                    for (int j = 0; j < polyPoints.Count; j++)
                    {
                        pline.AddVertexAt(j, polyPoints[j], 0, 0, 0);
                    }
                    pline.LayerId = layerId;
                    if (isFill) pline.Closed = true;
                    ms.AppendEntity(pline);
                    tr.AddNewlyCreatedDBObject(pline, true);
                    entitiesCreated++;
                }
            }
            catch (System.Exception ex)
            {
                log?.Invoke($"  Error parsing SVG path: {ex.Message}");
            }

            return entitiesCreated;
        }

    }
}