using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace LandsurvConnector.Sync
{
    /// <summary>
    /// Maps the webapp's `fetch_state` payload (see hooks/useC3DStateSync.ts) into
    /// SyncSnapshot records for the sync engine. Pure logic — unit-testable, no
    /// AutoCAD dependencies.
    ///
    /// Wire shape consumed here:
    ///   data.points.lists[].points[]        { number, easting, northing, elevation, rawDescription }
    ///   data.lines.{boundary,breaklines,inclusions,exclusions,overlays}[]  SurveyLine
    ///     overlays = agent-generated GIS parcel lines, contours, soils, FEMA
    ///     flood, steep slope and TIN edges, pre-chained with stable polylineIds.
    ///   data.centerlines[]                  SurveyLine
    ///   data.cadManager.layers[]            { name, color, lineType, lineWeight }
    ///   data.annotations.streetLabels[]     { x, y, text, angle }
    ///   data.annotations.parcelLabels[]     { id, x, y, angle, parcelId, owner, deedRef }
    ///   data.symbols[]                      { id, name, svgPath, fillPath, viewBox, scale, hidden }
    /// </summary>
    public static class WebappStateMapper
    {
        /// <summary>Regex-free layer exclusion for linework: legend/annotation helper
        /// geometry drawn by the connector itself should not sync back as linework.</summary>
        public static bool IsExcludedLineworkLayer(string layerName)
        {
            if (string.IsNullOrEmpty(layerName)) return false;
            string n = layerName.ToUpperInvariant();
            return n.Contains("LEGEND") || n.Contains("ANNO") || n.Contains("LABEL") || n.Contains("SYMBOL");
        }

        public static SyncSnapshot Map(JObject stateData)
        {
            var snapshot = new SyncSnapshot { CapturedAt = DateTime.UtcNow };
            if (stateData == null) return snapshot;

            MapPoints(stateData["points"] as JObject, snapshot);
            MapLinework(stateData, snapshot);            MapLayers(stateData["cadManager"] as JObject, snapshot);
            MapAnnotations(stateData["annotations"] as JObject, snapshot);
            MapSymbols(stateData["symbols"] as JArray, snapshot);
            return snapshot;
        }

        // ── Points ───────────────────────────────────────────────────────────

        private static void MapPoints(JObject points, SyncSnapshot snapshot)
        {
            var lists = points?["lists"] as JArray;
            if (lists == null) return;

            foreach (var list in lists.OfType<JObject>())
            {
                var pts = list["points"] as JArray;
                if (pts == null) continue;
                foreach (var p in pts.OfType<JObject>())
                {
                    string number = p["number"]?.ToString();
                    if (string.IsNullOrWhiteSpace(number)) continue;
                    snapshot.Points.Add(new SyncPointRecord
                    {
                        PointNumber = number,
                        Easting = p["easting"]?.ToObject<double>() ?? 0,
                        Northing = p["northing"]?.ToObject<double>() ?? 0,
                        Elevation = p["elevation"]?.ToObject<double>() ?? 0,
                        Description = p["rawDescription"]?.ToString() ?? "",
                    });
                }
            }
        }

        // ── Linework ─────────────────────────────────────────────────────────

        private static IEnumerable<JObject> AllLines(JObject stateData)
        {
            var lines = stateData["lines"] as JObject;
            if (lines != null)
            {
                foreach (var bucket in new[] { "boundary", "breaklines", "inclusions", "exclusions", "overlays" })
                {
                    var arr = lines[bucket] as JArray;
                    if (arr == null) continue;
                    foreach (var l in arr.OfType<JObject>()) yield return l;
                }
            }
            var centerlines = stateData["centerlines"] as JArray;
            if (centerlines != null)
            {
                foreach (var l in centerlines.OfType<JObject>()) yield return l;
            }
        }

        private static void MapLinework(JObject stateData, SyncSnapshot snapshot)
        {
            // Survey points are the geometric source of truth for lines that only
            // reference point numbers, which is how most LandSurv.ai linework is
            // stored. This mirrors the webapp's DXF export: resolve by point
            // number first, then fall back to any cached coordinates.
            var pointIndex = BuildPointIndex(snapshot);

            // Group segments into polylines by polylineId (fallback: per-segment id).
            var groups = new Dictionary<string, List<JObject>>();
            var order = new List<string>();
            foreach (var raw in AllLines(stateData))
            {
                if (raw["hidden"]?.ToObject<bool>() ?? false) continue;

                string layer = raw["layer"]?.ToString();
                if (IsExcludedLineworkLayer(layer)) continue;

                var line = ResolveLineGeometry(raw, pointIndex);
                if (line == null) continue;

                string key = line["polylineId"]?.ToString();
                if (string.IsNullOrEmpty(key))
                {
                    key = line["id"]?.ToString();
                    // A positional counter was used here previously, so adding or
                    // removing one line renumbered every later line and the whole
                    // drawing looked like it had changed. The fallback key is now
                    // derived from the segment itself and is stable across polls.
                    if (string.IsNullOrEmpty(key)) key = StableSegmentKey(line);
                    key = "seg:" + key;
                }

                if (!groups.TryGetValue(key, out var list))
                {
                    list = new List<JObject>();
                    groups[key] = list;
                    order.Add(key);
                }
                list.Add(line);
            }

            foreach (var key in order)
            {
                var record = BuildLineRecord(key, groups[key]);
                if (record != null && record.Vertices.Count >= 2)
                {
                    snapshot.Linework.Add(record);
                }
            }
        }

        /// <summary>Point-number → position lookup for resolving line endpoints.</summary>
        private static Dictionary<string, SyncPointRecord> BuildPointIndex(SyncSnapshot snapshot)
        {
            var index = new Dictionary<string, SyncPointRecord>(StringComparer.OrdinalIgnoreCase);
            foreach (var p in snapshot.Points)
            {
                if (string.IsNullOrWhiteSpace(p.PointNumber)) continue;
                index[p.PointNumber.Trim()] = p;
            }
            return index;
        }

        private static JObject VertexFromPoint(JToken pointNumber, Dictionary<string, SyncPointRecord> index)
        {
            string number = pointNumber?.ToString();
            if (string.IsNullOrWhiteSpace(number)) return null;
            if (!index.TryGetValue(number.Trim(), out var p)) return null;
            return new JObject { ["x"] = p.Easting, ["y"] = p.Northing, ["z"] = p.Elevation };
        }

        /// <summary>
        /// Give a segment concrete endpoints. Lines drawn between survey points
        /// carry only point-number references, and those were previously dropped
        /// outright — which is why linework created in LandSurv.ai never reached
        /// the drawing. Returns null when neither source yields geometry.
        /// </summary>
        private static JObject ResolveLineGeometry(JObject line, Dictionary<string, SyncPointRecord> index)
        {
            var fromPt = VertexFromPoint(line["from"], index) ?? line["fromPt"] as JObject;
            var toPt = VertexFromPoint(line["to"], index) ?? line["toPt"] as JObject;
            if (fromPt == null || toPt == null) return null;

            if (ReferenceEquals(fromPt, line["fromPt"]) && ReferenceEquals(toPt, line["toPt"]))
                return line;

            var resolved = (JObject)line.DeepClone();
            resolved["fromPt"] = fromPt;
            resolved["toPt"] = toPt;
            return resolved;
        }

        /// <summary>
        /// Deterministic identity for a segment with no id: prefer the point
        /// numbers it connects, otherwise its layer and rounded endpoints.
        /// </summary>
        private static string StableSegmentKey(JObject line)
        {
            string layer = (line["layer"]?.ToString() ?? "").Trim().ToUpperInvariant();
            string from = line["from"]?.ToString();
            string to = line["to"]?.ToString();
            if (!string.IsNullOrWhiteSpace(from) && !string.IsNullOrWhiteSpace(to))
                return $"pn:{layer}:{from.Trim()}>{to.Trim()}";

            return $"xy:{layer}:{FormatVertex(line["fromPt"] as JObject)}>{FormatVertex(line["toPt"] as JObject)}";
        }

        private static string FormatVertex(JObject pt)
        {
            if (pt == null) return "-";
            double x = pt["x"]?.ToObject<double>() ?? 0;
            double y = pt["y"]?.ToObject<double>() ?? 0;
            return x.ToString("0.####", CultureInfo.InvariantCulture) + ","
                 + y.ToString("0.####", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Chain segments sharing a polylineId into an ordered vertex list.
        /// Bulge per vertex comes from the segment's curve parameters:
        ///   θ = arcLength / radius  (or 2·asin(chord / 2R) when only chord is known)
        ///   bulge = tan(θ / 4),  sign: left (CCW) = +, right (CW) = −
        /// </summary>
        private static SyncLineRecord BuildLineRecord(string id, List<JObject> segments)
        {
            var record = new SyncLineRecord { Id = id };

            if (segments.Count == 1)
            {
                var seg = segments[0];
                var r = new SyncLineRecord { Id = id };
                r.Layer = seg["layer"]?.ToString();
                AddVertex(r, seg["fromPt"] as JObject, ComputeBulge(seg));
                AddVertex(r, seg["toPt"] as JObject, null);
                record = r;
                return record;
            }

            // Chain by from/to point-number references when available.
            var byFrom = new Dictionary<string, JObject>();
            foreach (var s in segments)
            {
                string from = s["from"]?.ToString();
                if (!string.IsNullOrEmpty(from) && !byFrom.ContainsKey(from)) byFrom[from] = s;
            }

            // Find the head segment (its 'from' is nobody's 'to').
            var tos = new HashSet<string>(segments.Select(s => s["to"]?.ToString()).Where(t => !string.IsNullOrEmpty(t)));
            JObject head = segments.FirstOrDefault(s =>
            {
                string from = s["from"]?.ToString();
                return string.IsNullOrEmpty(from) || !tos.Contains(from);
            }) ?? segments[0];

            record.Layer = head["layer"]?.ToString();

            var ordered = new List<JObject>();
            var visited = new HashSet<JObject>();
            var current = head;
            while (current != null && visited.Add(current))
            {
                ordered.Add(current);
                string to = current["to"]?.ToString();
                JObject next = null;
                if (!string.IsNullOrEmpty(to)) byFrom.TryGetValue(to, out next);
                current = next;
            }
            // Any unvisited segments (broken chains) appended in original order.
            foreach (var s in segments)
            {
                if (!visited.Contains(s)) ordered.Add(s);
            }

            foreach (var seg in ordered)
            {
                AddVertex(record, seg["fromPt"] as JObject, ComputeBulge(seg));
            }
            var lastTo = ordered.LastOrDefault()?["toPt"] as JObject;
            AddVertex(record, lastTo, null);

            // Closed if the chain ends where it starts.
            if (record.Vertices.Count >= 3)
            {
                var first = record.Vertices[0];
                var last = record.Vertices[record.Vertices.Count - 1];
                if (Math.Abs(first.X - last.X) <= SyncEngine.CoordTolerance
                    && Math.Abs(first.Y - last.Y) <= SyncEngine.CoordTolerance)
                {
                    record.Closed = true;
                    record.Vertices.RemoveAt(record.Vertices.Count - 1); // closed polys don't repeat the start vertex
                }
            }

            return record;
        }

        private static void AddVertex(SyncLineRecord record, JObject pt, double? bulge)
        {
            if (pt == null) return;
            record.Vertices.Add(new SyncLineVertex
            {
                X = pt["x"]?.ToObject<double>() ?? 0,
                Y = pt["y"]?.ToObject<double>() ?? 0,
                Bulge = bulge,
            });
        }

        /// <summary>Bulge from LSAI curve params. Positive = CCW (left), negative = CW (right).</summary>
        internal static double? ComputeBulge(JObject seg)
        {
            if (!(seg["isCurve"]?.ToObject<bool>() ?? false)) return null;

            double? radius = seg["curveRadius"]?.ToObject<double?>();
            if (radius == null || radius.Value <= 0) return null;

            double theta; // included angle
            double? arcLength = seg["arcLength"]?.ToObject<double?>();
            double? chord = ParseDoubleLoose(seg["chordDistance"]);

            if (arcLength != null && arcLength.Value > 0)
            {
                theta = arcLength.Value / radius.Value;
            }
            else if (chord != null && chord.Value > 0 && chord.Value <= 2 * radius.Value)
            {
                theta = 2 * Math.Asin(chord.Value / (2 * radius.Value));
            }
            else
            {
                return null;
            }

            double bulge = Math.Tan(theta / 4.0);
            string dir = seg["curveDirection"]?.ToString();
            if (string.Equals(dir, "right", StringComparison.OrdinalIgnoreCase)) bulge = -bulge;
            return bulge;
        }

        private static double? ParseDoubleLoose(JToken token)
        {
            if (token == null) return null;
            if (token.Type == JTokenType.Float || token.Type == JTokenType.Integer) return token.ToObject<double>();
            if (double.TryParse(token.ToString(), System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out double v)) return v;
            return null;
        }

        // ── Layers ───────────────────────────────────────────────────────────

        private static void MapLayers(JObject cadManager, SyncSnapshot snapshot)
        {
            var layers = cadManager?["layers"] as JArray;
            if (layers == null) return;
            foreach (var l in layers.OfType<JObject>())
            {
                string name = l["name"]?.ToString();
                if (string.IsNullOrWhiteSpace(name)) continue;
                snapshot.Layers.Add(new SyncLayerRecord
                {
                    Name = name,
                    Color = l["color"]?.ToString(),
                    LineType = l["lineType"]?.ToString(),
                    LineWeight = l["lineWeight"]?.ToObject<int?>(),
                });
            }
        }

        // ── Annotations ──────────────────────────────────────────────────────

        private static void MapAnnotations(JObject annotations, SyncSnapshot snapshot)
        {
            if (annotations == null) return;

            var streetLabels = annotations["streetLabels"] as JArray;
            if (streetLabels != null)
            {
                foreach (var s in streetLabels.OfType<JObject>())
                {
                    string text = s["text"]?.ToString() ?? "";
                    double x = s["x"]?.ToObject<double>() ?? 0;
                    double y = s["y"]?.ToObject<double>() ?? 0;
                    snapshot.Annotations.Add(new SyncAnnotationRecord
                    {
                        // Deterministic id so CAD↔LSAI round-trips match.
                        Id = $"street:{text.Trim().ToUpperInvariant()}@{Math.Round(x, 1)},{Math.Round(y, 1)}",
                        Kind = "street-label",
                        X = x,
                        Y = y,
                        Angle = s["angle"]?.ToObject<double>() ?? 0,
                        Text = text,
                        Layer = "V-ANNO-STREET",
                    });
                }
            }

            var parcelLabels = annotations["parcelLabels"] as JArray;
            if (parcelLabels != null)
            {
                foreach (var p in parcelLabels.OfType<JObject>())
                {
                    string owner = p["owner"]?.ToString();
                    string parcelId = p["parcelId"]?.ToString();
                    string deedRef = p["deedRef"]?.ToString();
                    string text = "N/F " + (owner ?? "UNKNOWN");
                    if (!string.IsNullOrEmpty(parcelId)) text += $"\nParcel {parcelId}";
                    if (!string.IsNullOrEmpty(deedRef)) text += $"\n{deedRef}";
                    double x = p["x"]?.ToObject<double>() ?? 0;
                    double y = p["y"]?.ToObject<double>() ?? 0;
                    string rawId = p["id"]?.ToString();
                    snapshot.Annotations.Add(new SyncAnnotationRecord
                    {
                        Id = "parcel:" + (!string.IsNullOrEmpty(rawId)
                            ? rawId
                            : $"{Math.Round(x, 1)},{Math.Round(y, 1)}"),
                        Kind = "parcel-label",
                        X = x,
                        Y = y,
                        Angle = p["angle"]?.ToObject<double>() ?? 0,
                        Text = text,
                        Layer = "V-ANNO-PARCEL",
                    });
                }
            }
        }

        // ── Symbols ──────────────────────────────────────────────────────────

        private static void MapSymbols(JArray symbols, SyncSnapshot snapshot)
        {
            if (symbols == null) return;
            foreach (var s in symbols.OfType<JObject>())
            {
                if (s["hidden"]?.ToObject<bool>() ?? false) continue;
                string name = s["name"]?.ToString();
                if (string.IsNullOrWhiteSpace(name)) continue;
                snapshot.Symbols.Add(new SyncBlockRecord
                {
                    Name = name,
                    SvgPath = s["svgPath"]?.ToString(),
                    ViewBox = s["viewBox"]?.ToString(),
                    Scale = s["scale"]?.ToObject<double?>(),
                });
            }
        }
    }
}
