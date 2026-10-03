using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace LandsurvConnector.Sync
{
    /// <summary>
    /// Wire records for the LandSurv.ai ⇄ Civil 3D sync engine.
    /// JSON property names match services/c3dSyncProtocol.ts EXACTLY — both sides
    /// exchange these records verbatim over the /c3d WebSocket relay.
    /// </summary>
    public class SyncPointRecord
    {
        [JsonProperty("pointNumber")] public string PointNumber { get; set; } = "";
        [JsonProperty("easting")] public double Easting { get; set; }
        [JsonProperty("northing")] public double Northing { get; set; }
        [JsonProperty("elevation")] public double Elevation { get; set; }
        [JsonProperty("description")] public string Description { get; set; } = "";
        [JsonProperty("layer")] public string Layer { get; set; }
    }

    public class SyncLayerRecord
    {
        [JsonProperty("name")] public string Name { get; set; } = "";
        [JsonProperty("color")] public string Color { get; set; }
        [JsonProperty("lineType")] public string LineType { get; set; }
        [JsonProperty("lineWeight")] public int? LineWeight { get; set; }
    }

    public class SyncLineVertex
    {
        [JsonProperty("x")] public double X { get; set; }
        [JsonProperty("y")] public double Y { get; set; }
        /// <summary>Arc bulge at this vertex (tan(included/4)); CCW positive. 0/null = straight.</summary>
        [JsonProperty("bulge")] public double? Bulge { get; set; }
    }

    public class SyncLineRecord
    {
        /// <summary>Stable id. LSAI: SurveyLine polylineId/id. CAD: LANDSURV_LINE_ID XData, else "cad-handle:{handle}".</summary>
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("layer")] public string Layer { get; set; }
        [JsonProperty("closed")] public bool Closed { get; set; }
        [JsonProperty("vertices")] public List<SyncLineVertex> Vertices { get; set; } = new List<SyncLineVertex>();
    }

    public class SyncAnnotationRecord
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("kind")] public string Kind { get; set; } = "note"; // street-label | parcel-label | point-label | note
        [JsonProperty("x")] public double X { get; set; }
        [JsonProperty("y")] public double Y { get; set; }
        [JsonProperty("angle")] public double Angle { get; set; }         // CCW degrees
        [JsonProperty("text")] public string Text { get; set; } = "";
        [JsonProperty("layer")] public string Layer { get; set; }
        [JsonProperty("height")] public double? Height { get; set; }
    }

    public class SyncBlockRecord
    {
        [JsonProperty("name")] public string Name { get; set; } = "";
        [JsonProperty("svgPath")] public string SvgPath { get; set; }      // LSAI side
        [JsonProperty("viewBox")] public string ViewBox { get; set; }
        [JsonProperty("scale")] public double? Scale { get; set; }
        [JsonProperty("referenceCount")] public int? ReferenceCount { get; set; } // CAD side
    }

    /// <summary>One side's full syncable view of the drawing/session.</summary>
    public class SyncSnapshot
    {
        [JsonProperty("points")] public List<SyncPointRecord> Points { get; set; } = new List<SyncPointRecord>();
        [JsonProperty("layers")] public List<SyncLayerRecord> Layers { get; set; } = new List<SyncLayerRecord>();
        [JsonProperty("linework")] public List<SyncLineRecord> Linework { get; set; } = new List<SyncLineRecord>();
        [JsonProperty("annotations")] public List<SyncAnnotationRecord> Annotations { get; set; } = new List<SyncAnnotationRecord>();
        [JsonProperty("symbols")] public List<SyncBlockRecord> Symbols { get; set; } = new List<SyncBlockRecord>();

        /// <summary>UTC timestamp when this snapshot was captured.</summary>
        [JsonProperty("capturedAt")] public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
    }

    // ── Diff model ───────────────────────────────────────────────────────────

    public enum SyncItemState { CadOnly, LsaiOnly, Equal, Changed, Conflict }

    public static class SyncItemStateWire
    {
        public static string ToWire(this SyncItemState s)
        {
            switch (s)
            {
                case SyncItemState.CadOnly: return "cad-only";
                case SyncItemState.LsaiOnly: return "lsai-only";
                case SyncItemState.Equal: return "equal";
                case SyncItemState.Changed: return "changed";
                default: return "conflict";
            }
        }

        public static SyncItemState FromWire(string s)
        {
            switch (s)
            {
                case "cad-only": return SyncItemState.CadOnly;
                case "lsai-only": return SyncItemState.LsaiOnly;
                case "equal": return SyncItemState.Equal;
                case "changed": return SyncItemState.Changed;
                default: return SyncItemState.Conflict;
            }
        }
    }

    public class SyncDiffEntry
    {
        public string Key { get; set; } = "";
        public SyncItemState State { get; set; }
        /// <summary>CAD-side record serialized as JSON (shape depends on category).</summary>
        public string CadJson { get; set; }
        /// <summary>LSAI-side record serialized as JSON.</summary>
        public string LsaiJson { get; set; }
        public List<string> FieldDiffs { get; set; } = new List<string>();
        /// <summary>
        /// For State==Changed with a baseline: which side moved away from the
        /// baseline ("cad" or "lsai"). Null when ambiguous (no baseline) or N/A.
        /// Lets live-sync pick a safe update direction without prompting.
        /// </summary>
        public string ChangedSide { get; set; }
        /// <summary>
        /// True when this key existed in the last-synced baseline. Distinguishes a
        /// genuine one-sided ADD (not in baseline) from a one-sided DELETE (was in
        /// baseline, now removed from one side) so live-sync propagates deletions
        /// instead of re-creating them.
        /// </summary>
        public bool WasInBaseline { get; set; }
    }

    public class CategoryDiffResult
    {
        public string Category { get; set; } = "";
        public List<SyncDiffEntry> Entries { get; set; } = new List<SyncDiffEntry>();
        public Dictionary<SyncItemState, int> Counts { get; set; } = new Dictionary<SyncItemState, int>();
    }

    // ── Apply plan model (arrives from the webapp Sync Center as JSON) ─────────

    public class SyncPlanEntry
    {
        [JsonProperty("key")] public string Key { get; set; } = "";
        /// <summary>create-cad | create-lsai | update-cad | update-lsai | delete-cad | delete-lsai | skip</summary>
        [JsonProperty("action")] public string Action { get; set; } = "skip";
        [JsonProperty("explicit")] public bool Explicit { get; set; }
    }

    public class CategoryPlan
    {
        [JsonProperty("category")] public string Category { get; set; } = "";
        [JsonProperty("direction")] public string Direction { get; set; } = "merge";
        [JsonProperty("entries")] public List<SyncPlanEntry> Entries { get; set; } = new List<SyncPlanEntry>();
    }

    public class SyncApplyPlan
    {
        [JsonProperty("planId")] public string PlanId { get; set; } = "";
        [JsonProperty("categories")] public List<CategoryPlan> Categories { get; set; } = new List<CategoryPlan>();
    }

    /// <summary>Progress reported during a sync apply run (shared by applier + wizard).</summary>
    public class SyncProgressInfo
    {
        [JsonProperty("phase")] public string Phase { get; set; } = "";
        [JsonProperty("current")] public int Current { get; set; }
        [JsonProperty("total")] public int Total { get; set; }
        [JsonProperty("message")] public string Message { get; set; } = "";
    }

    /// <summary>Per-item result reported back after an apply run.</summary>
    public class SyncItemResult
    {
        [JsonProperty("key")] public string Key { get; set; } = "";
        [JsonProperty("action")] public string Action { get; set; } = "";
        [JsonProperty("status")] public string Status { get; set; } = "";  // ok | failed | skipped
        [JsonProperty("error")] public string Error { get; set; }
    }

    /// <summary>
    /// A deliberate-deletion record ("tombstone"). Once an item is deleted on one
    /// side, its tombstone travels as explicit intent so the other side applies the
    /// delete instead of re-asserting a stale copy — this is what stops a deletion
    /// from being "pushed back" (backfed) by state-based reconciliation.
    /// </summary>
    public class SyncTombstone
    {
        [JsonProperty("category")] public string Category { get; set; } = "";
        [JsonProperty("key")] public string Key { get; set; } = "";
        /// <summary>Which side originated the delete: "cad" or "lsai".</summary>
        [JsonProperty("origin")] public string Origin { get; set; } = "";
        [JsonProperty("deletedAt")] public string DeletedAt { get; set; } = "";
    }

    /// <summary>Persisted per-drawing journal of delete intents (tombstones).</summary>
    public class SyncJournal
    {
        [JsonProperty("tombstones")] public List<SyncTombstone> Tombstones { get; set; } = new List<SyncTombstone>();
    }

    /// <summary>A single intent op broadcast over the wire with a live apply.</summary>
    public class SyncIntentOp
    {
        [JsonProperty("op")] public string Op { get; set; } = "";        // delete | create | update
        [JsonProperty("category")] public string Category { get; set; } = "";
        [JsonProperty("key")] public string Key { get; set; } = "";
        [JsonProperty("origin")] public string Origin { get; set; } = ""; // cad | lsai
    }
}
