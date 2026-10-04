// CACP — Cross Agent Communications Protocol
// Agent Registry: declarative manifests for agents that participate in CACP.
//
// A manifest declares:
//   - which AgentType this agent represents
//   - whether CACP is enabled (used for UI badges and LSVZ orchestration)
//   - the catalogue of skills the agent exposes over interAgentComm
//
// Skills are addressed by `command` over interAgentComm.sendMessage / .request.
// Phase 1: registry + manifests only — no behavior change.

import { AgentType } from '../types';
import { HISTORY_SKILLS } from './historySkillSchemas';
import { COGO_EXTENDED_SKILLS } from './cogoSkillSchemas';

/** A loose JSON-Schema-ish descriptor. Kept narrow on purpose. */
export interface SkillFieldSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  items?: SkillFieldSchema;            // for arrays
  properties?: Record<string, SkillFieldSchema>; // for objects
  enum?: Array<string | number>;
  default?: unknown;
}

export interface SkillSchema {
  /** The interAgentComm `command` string this skill responds to. */
  id: string;
  /** Short human label. */
  name: string;
  /** What it does, in one or two sentences. */
  description: string;
  /**
   * 'action' — skill mutates state (delete, insert, update). After the peer
   *   responds, the calling agent should only CONFIRM the outcome to the user
   *   and must NOT call askPeer again.
   * 'query'  — skill reads/returns data (default). After the peer responds,
   *   the calling agent uses the returned data to complete the original task.
   */
  type?: 'action' | 'query';
  /** Shape of `data` payload sent in the request. */
  inputs: Record<string, SkillFieldSchema>;
  /** Shape of `data` returned in the AgentResponse. */
  outputs: Record<string, SkillFieldSchema>;
  /** Optional usage hints for LSVZ planner / docs. */
  examples?: string[];
}

export interface AgentManifest {
  agent: AgentType;
  /** Display name for UI badges and orchestration logs. */
  displayName: string;
  /** When true, LSVZ may orchestrate this agent and UI shows the CACP badge. */
  cacpEnabled: boolean;
  /** Manifest schema version — bump when shape changes. */
  version: string;
  /** Skills this agent exposes. */
  skills: SkillSchema[];
}

class AgentRegistryService {
  private manifests = new Map<AgentType, AgentManifest>();

  register(manifest: AgentManifest): void {
    this.manifests.set(manifest.agent, manifest);
  }

  get(agent: AgentType): AgentManifest | undefined {
    return this.manifests.get(agent);
  }

  /** All registered manifests. */
  list(): AgentManifest[] {
    return Array.from(this.manifests.values());
  }

  /** Manifests with cacpEnabled=true. */
  listCacpEnabled(): AgentManifest[] {
    return this.list().filter(m => m.cacpEnabled);
  }

  isCacpEnabled(agent: AgentType): boolean {
    return !!this.manifests.get(agent)?.cacpEnabled;
  }

  /** Find which agent owns a given skill command. */
  findOwnerOfSkill(commandId: string): AgentManifest | undefined {
    return this.list().find(m => m.skills.some(s => s.id === commandId));
  }

  /** Find the SkillSchema for a given command id, regardless of which agent owns it. */
  findSkill(commandId: string): SkillSchema | undefined {
    for (const manifest of this.manifests.values()) {
      const skill = manifest.skills.find(s => s.id === commandId);
      if (skill) return skill;
    }
    return undefined;
  }
}

export const agentRegistry = new AgentRegistryService();

// ---------------------------------------------------------------------------
// Phase 1 manifests — initial CACP rollout
// ---------------------------------------------------------------------------

agentRegistry.register({
  agent: AgentType.VOICE_AGENT,
  displayName: 'Voice Agent',
  cacpEnabled: true,
  version: '0.1.0',
  skills: [
    {
      id: 'voice_observe_workflow',
      name: 'Observe Live Workflow',
      description:
        'Consumes live UI context (tool mode, drawing state, active layer, and recent activity) and decides whether to ask a concise clarifying question.',
      inputs: {
        context: { type: 'object', required: true, description: 'Live context snapshot from the active app session.' },
      },
      outputs: {
        shouldAsk: { type: 'boolean', required: true },
        question: { type: 'string', description: 'Question to ask if shouldAsk is true.' },
      },
      examples: [
        'User starts drawing with no active layer -> shouldAsk:true, question:"What are you drawing?"',
      ],
    },
    {
      id: 'voice_propose_layer',
      name: 'Propose Layer Assignment',
      description:
        'Maps a spoken intent (e.g. "drawing buildings") to a candidate CAD layer and emits a confirmation-first proposal rather than mutating state directly.',
      inputs: {
        utterance: { type: 'string', required: true, description: 'User speech transcript or typed fallback.' },
        availableLayers: { type: 'array', items: { type: 'string' }, description: 'Candidate CAD layers available in the session.' },
      },
      outputs: {
        proposedLayer: { type: 'string' },
        confidence: { type: 'number' },
        reason: { type: 'string' },
        requiresConfirmation: { type: 'boolean', required: true },
      },
      examples: [
        'Utterance:"I am drawing buildings" -> proposedLayer:"L-BUILDING", requiresConfirmation:true',
      ],
    },
    {
      id: 'voice_suggest_next_tasks',
      name: 'Suggest Next Tasks',
      description:
        'Suggests high-value follow-up tasks based on current workflow context and active drawing intent.',
      inputs: {
        context: { type: 'object', required: true },
      },
      outputs: {
        suggestions: { type: 'array', items: { type: 'string' }, required: true },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.POINT_EDITOR,
  displayName: 'Point Editor',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'request_next_point_number',
      name: 'Request Next Point Number',
      description:
        'Returns the next available point number(s) honoring the user point labeling settings (style/prefix/nextNumber). Caller should NOT increment locally.',
      inputs: {
        count:    { type: 'integer', description: 'How many sequential numbers to return.', default: 1 },
        hint:     { type: 'string',  description: 'Optional caller-provided seed/prefix override.' },
      },
      outputs: {
        numbers: { type: 'array', items: { type: 'string' }, description: 'Newly issued point numbers in order.', required: true },
      },
      examples: [
        'Boundary Agent requests 6 numbers for boundary corners',
        'GPS Stakeout asks for the next single PN',
      ],
    },
    {
      id: 'reserve_point_numbers',
      name: 'Reserve Point Numbers',
      description:
        'Atomically reserves a block of N point numbers so subsequent callers skip past them. Used when an agent will write the points later.',
      inputs: {
        count:  { type: 'integer', required: true },
        owner:  { type: 'string',  description: 'AgentType of reserver, for tracking.' },
      },
      outputs: {
        reservationId: { type: 'string', required: true },
        numbers:       { type: 'array', items: { type: 'string' }, required: true },
      },
    },
    {
      id: 'release_reservation',
      name: 'Release Reservation',
      description: 'Frees a previously reserved block (e.g. user cancelled).',
      inputs:  { reservationId: { type: 'string', required: true } },
      outputs: { released: { type: 'boolean', required: true } },
    },
    {
      id: 'query_points',
      name: 'Query Points',
      description: 'Find points by number list, description substring, elevation range, or spatial extent.',
      inputs: {
        pointNumbers:     { type: 'array', items: { type: 'string' } },
        byDescription:    { type: 'string' },
        byElevationRange: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' } } },
      },
      outputs: { points: { type: 'array', items: { type: 'object' }, required: true } },
    },
    {
      id: 'remove_points',
      name: 'Remove Points',
      type: 'action' as const,
      description:
        'Authoritative point deletion. Any agent that the user asks to "remove", "delete", or "get rid of" point(s) MUST delegate to this skill instead of dropping points from its own state. Supports single point or batch removal. The canvas zooms to the target points and highlights them with pulsing red rings, then asks the user to confirm before anything is deleted — pass `confirm: true` only when the deletion is already known to be intended (e.g. scripted cleanup).',
      inputs: {
        pointNumbers: { type: 'array', items: { type: 'string' }, required: true, description: 'One or more point numbers to remove.' },
        reason:       { type: 'string', description: 'Optional user-facing reason recorded in the fieldbook.' },
        confirm:      { type: 'boolean', description: 'When true, skip the highlight-and-confirm dialog and delete immediately. Reserved for programmatic callers that already hold user intent.' },
      },
      outputs: {
        removed:        { type: 'array', items: { type: 'string' }, required: true, description: 'Point numbers that were actually removed.' },
        notFound:       { type: 'array', items: { type: 'string' }, description: 'Point numbers that did not exist.' },
        removedCount:   { type: 'integer', required: true },
      },
      examples: [
        'User: "delete point 5" → askPeer remove_points {pointNumbers:["5"]}',
        'User: "get rid of points 12, 13, 14" → askPeer remove_points {pointNumbers:["12","13","14"]}',
        'User: "remove all the survey corners" → first query_points byDescription:"corner", then remove_points with the returned PNs.',
      ],
    },
    {
      id: 'update_point_list',
      name: 'Update Point List',
      type: 'action' as const,
      description:
        'Authoritative point-list grouping. Creates or updates a named point list, optionally replacing its contents and removing prior PNs from any other list. Used by the Boundary Agent so each drafted tract lands in its own list (id `boundary-<fileId>`) instead of a shared "Working Points" bucket.',
      inputs: {
        listId:         { type: 'string',  description: 'Stable list id. Derived from listName if omitted.' },
        listName:       { type: 'string',  required: true, description: 'Display name shown in the Point Lists panel.' },
        points:         { type: 'array',   items: { type: 'object' }, required: true, description: 'SurveyPoints to add or replace on the list.' },
        removePointIds: { type: 'array',   items: { type: 'string' }, description: 'Point numbers to remove from any existing list before merge (cleanup of prior draft).' },
        replacePoints:  { type: 'boolean', description: 'When true, list contents are replaced with `points` instead of merged.' },
        isVisible:      { type: 'boolean', description: 'Initial visibility for newly-created lists. Default true.' },
      },
      outputs: {
        listId:     { type: 'string',  required: true },
        pointCount: { type: 'integer', required: true },
      },
      examples: [
        'Boundary Agent re-drafts TRACT 2 → update_point_list {listId:"boundary-bf123", listName:"TRACT No. 2", points:[…], removePointIds:[old…], replacePoints:true}',
      ],
    },
    // Edit-history skills — let any agent service natural-language undo requests.
    ...HISTORY_SKILLS,
  ],
});

agentRegistry.register({
  agent: AgentType.DEED_READER,
  displayName: 'Boundary Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'deed_loaded',
      name: 'Deed Loaded (broadcast)',
      description: 'Announces that a deed has been parsed and points/vertices are available.',
      inputs: {
        parcelId:             { type: 'string',  required: true },
        controlPointNumbers:  { type: 'array', items: { type: 'string' } },
        vertices:             { type: 'array', items: { type: 'object' } },
      },
      outputs: {},
    },
    {
      id: 'get_deed_points',
      name: 'Get Deed Points',
      description: 'Returns the points associated with a deed parcel.',
      inputs:  { parcelId: { type: 'string', required: true } },
      outputs: { points: { type: 'array', items: { type: 'object' } }, pointCount: { type: 'integer' } },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.CIVIL_DRAFTER,
  displayName: 'Civil Drafter',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'civil_drafter_extract_points',
      name: 'Extract Points from Civil Plan',
      description: 'Parses an uploaded civil plan PDF and emits structured points + linework.',
      inputs: {
        sessionFileIds: { type: 'array', items: { type: 'string' }, required: true },
        selectedPages:  { type: 'array', items: { type: 'integer' } },
      },
      outputs: {
        points:   { type: 'array', items: { type: 'object' } },
        linework: { type: 'array', items: { type: 'object' } },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.AR_AGENT,
  displayName: 'AR Field Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'capture_and_send_intent',
      name: 'Capture and Send AR Intent',
      description: 'Captures the current glass keyframe and audio intent, then emits a validated CACP Event Notification for downstream processing.',
      type: 'action',
      inputs: {
        raw_text: { type: 'string', required: true, description: 'User utterance or field note captured by the Glass device.' },
        feature_type: { type: 'string', description: 'Optional feature classification such as tree, monument, utility, structure.' },
        coordinates: { type: 'array', items: { type: 'number' }, description: 'Optional [X,Y] or [X,Y,Z] coordinate payload when available.' },
      },
      outputs: {
        event_id: { type: 'string', required: true },
        accepted: { type: 'boolean', required: true },
        command_category: { type: 'string', required: true },
      },
      examples: [
        'User says: "Draw the oak tree over there" -> capture_and_send_intent {raw_text:"...", feature_type:"tree"}',
      ],
    },
    {
      id: 'receive_drawing_action',
      name: 'Receive Drawing Action',
      description: 'Listens for a cloud-issued CACP Action Notification and exposes AR feedback status back to the field operator.',
      type: 'query',
      inputs: {
        action_id: { type: 'string', required: true },
        event_id: { type: 'string', required: true },
      },
      outputs: {
        status: { type: 'string', required: true },
        summary: { type: 'string' },
        audio_confirmation: { type: 'string' },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.CENTERLINE_STATIONING,
  displayName: 'Stationing & Centerline',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'place_station_offset_point',
      name: 'Place Station/Offset Point',
      description:
        'Places a single point at a station/offset on the active centerline. Point number is requested from POINT_EDITOR — station goes in the description, NOT in the point number.',
      inputs: {
        station:      { type: 'string',  required: true, description: 'e.g. "10+50.25"' },
        offset:       { type: 'number',  required: true, description: 'Signed offset; positive = right.' },
        description:  { type: 'string' },
      },
      outputs: {
        pointNumber: { type: 'string', required: true },
        northing:    { type: 'number', required: true },
        easting:     { type: 'number', required: true },
      },
    },
    {
      id: 'generate_stationed_points',
      name: 'Generate Stationed Points',
      description: 'Generates points along a centerline at a regular interval. Each point gets a fresh PN from POINT_EDITOR; station is recorded in description only.',
      inputs: {
        startStation: { type: 'string',  required: true },
        endStation:   { type: 'string',  required: true },
        interval:     { type: 'number',  required: true },
        offset:       { type: 'number',  default: 0 },
        description:  { type: 'string' },
      },
      outputs: { points: { type: 'array', items: { type: 'object' }, required: true } },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.DXF_ANALYZER,
  displayName: 'DXF Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'dxf_extract_entities',
      name: 'Extract DXF Entities',
      description: 'Parses an uploaded DXF and returns layers, blocks, lines, polylines and points.',
      inputs:  { sessionFileId: { type: 'string', required: true } },
      outputs: {
        layers:     { type: 'array', items: { type: 'string' } },
        entities:   { type: 'array', items: { type: 'object' } },
        pointCount: { type: 'integer' },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.GPS_STAKEOUT,
  displayName: 'GPS Rover',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'gps_get_current_position',
      name: 'Get Current GPS Position',
      description:
        'Returns the rover\'s live WGS84 position plus the project-projected northing/easting (when a projection is configured). Caller should not assume cached values \u2014 always re-call for the latest fix.',
      inputs: {},
      outputs: {
        hasFix:     { type: 'boolean', required: true, description: 'True when a current GPS fix is available.' },
        latitude:   { type: 'number',  description: 'WGS84 latitude in decimal degrees.' },
        longitude:  { type: 'number',  description: 'WGS84 longitude in decimal degrees.' },
        accuracy:   { type: 'number',  description: 'Reported accuracy in metres.' },
        altitude:   { type: 'number',  description: 'WGS84 altitude in metres (may be null).' },
        northing:   { type: 'number',  description: 'Projected northing in project units.' },
        easting:    { type: 'number',  description: 'Projected easting in project units.' },
        epsg:       { type: 'integer', description: 'EPSG code of the active project projection.' },
        timestamp:  { type: 'integer', description: 'Epoch milliseconds when the fix was captured.' },
      },
      examples: [
        'Point Editor asks GPS Rover for the operator\u2019s current XY before placing a new point.',
        'Boundary Agent compares the rover position to a closing corner.',
      ],
    },
    {
      id: 'gps_set_target_point',
      name: 'Set Stakeout Target',
      description:
        'Sets the GPS Rover\'s active stakeout target by point number. The point must exist in the current project point set or the call fails.',
      inputs: {
        pointNumber: { type: 'string', required: true, description: 'Project point number to navigate to.' },
      },
      outputs: {
        accepted:    { type: 'boolean', required: true },
        pointNumber: { type: 'string' },
        description: { type: 'string' },
      },
    },
    {
      id: 'gps_get_target_point',
      name: 'Get Current Stakeout Target',
      description: 'Returns the point number currently loaded as the stakeout target (empty string when none).',
      inputs: {},
      outputs: {
        pointNumber: { type: 'string', required: true },
        description: { type: 'string' },
        northing:    { type: 'number' },
        easting:     { type: 'number' },
        elevation:   { type: 'number' },
      },
    },
    {
      id: 'gps_list_stakeout_points',
      name: 'List Stakeout-Eligible Points',
      description:
        'Returns the project points the rover can stake. Optionally filter by point-list id or by description substring.',
      inputs: {
        listId:        { type: 'string', description: 'Optional point-list id; omit or "all" for the full project set.' },
        byDescription: { type: 'string', description: 'Optional case-insensitive substring filter on description.' },
      },
      outputs: {
        points:     { type: 'array', items: { type: 'object' }, required: true },
        totalCount: { type: 'integer', required: true },
      },
    },
    {
      id: 'gps_request_collect_point_number',
      name: 'Request Next Collect Point Number',
      description:
        'Convenience pass-through: GPS Rover asks the Point Editor for the next available point number (so collected GPS shots stay in-sequence with manually entered points).',
      inputs: {
        count: { type: 'integer', default: 1, description: 'How many sequential numbers to reserve.' },
      },
      outputs: {
        numbers: { type: 'array', items: { type: 'string' }, required: true },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.LSVZ_AGENT,
  displayName: 'LSVZ Orchestrator',
  cacpEnabled: true,
  version: '1.1.0',
  skills: [
    {
      id: 'lsvz_dispatch',
      name: 'Dispatch to CACP Agent',
      description:
        'Routes a high-level user intent to the appropriate CACP-enabled agent by looking up the skill in the registry.',
      inputs: {
        skillId: { type: 'string', required: true },
        payload: { type: 'object' },
      },
      outputs: {
        ok:     { type: 'boolean', required: true },
        result: { type: 'object' },
      },
    },
    {
      id: 'kb_query',
      name: 'Query Project Knowledge Base',
      description:
        'Look up structured facts any agent has learned this session — deed metadata, ROW widths, zoning setbacks, parcel ids, monuments, etc. Use this BEFORE fetching or asking a peer — the answer may already be in the KB.',
      inputs: {
        category:      { type: 'string', description: 'e.g. deed.row, zoning.requirements, parcel.gis, deed.metadata' },
        subject:       { type: 'string', description: 'Substring match on the subject (road name, district, parcel id)' },
        predicate:     { type: 'string', description: 'Substring match on the attribute (width, setbackFront, owner)' },
        query:         { type: 'string', description: 'Free-text search across subject/predicate/value' },
        source:        { type: 'string', description: 'Restrict to facts written by a specific AgentType' },
        minConfidence: { type: 'number', description: 'Minimum confidence 0..1' },
        limit:         { type: 'integer', default: 20 },
      },
      outputs: {
        facts: { type: 'array', items: { type: 'object' }, required: true },
        count: { type: 'integer', required: true },
      },
      examples: [
        'kb_query({category:"deed.row", subject:"Main Street"}) → width=33 ft',
        'kb_query({category:"zoning.requirements", predicate:"setback"}) → front/side/rear setbacks',
        'kb_query({query:"hydrant"}) → free-text search',
      ],
    },
    {
      id: 'kb_record',
      name: 'Record Knowledge Base Fact',
      description:
        'Write one fact (or a list of facts) to the Project Knowledge Base so other agents can reuse it. Most agents do NOT need to call this directly — auto-extractors handle the common cases.',
      inputs: {
        category:  { type: 'string' },
        subject:   { type: 'string' },
        predicate: { type: 'string' },
        value:     { type: 'string' },
        units:     { type: 'string' },
        facts:     { type: 'array', items: { type: 'object' }, description: 'Optional batch — overrides single-fact fields when present.' },
      },
      outputs: {
        recorded: { type: 'integer' },
        fact:     { type: 'object' },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.CIVIL_PLAN_EXPERT,
  displayName: 'Civil Plan Expert',
  cacpEnabled: true,
  version: '1.1.0',
  skills: [
    {
      id: 'civil_plan_expert_extract',
      name: 'Extract Points & Lines from Civil Plan',
      description:
        'Reads a civil plan PDF (text + raster) and emits structured boundary points plus suggested linework. Designed for the human-drafter logic introduced in v26.05.12.03.',
      inputs: {
        sessionFileIds: { type: 'array', items: { type: 'string' }, required: true, description: 'IDs of plan PDFs in the current session.' },
        selectedPages:  { type: 'array', items: { type: 'integer' }, description: 'Page numbers to process. Omit for all pages.' },
        drawMode:       { type: 'string', enum: ['points_lines', 'points_only', 'lines_only'], default: 'points_lines', description: 'Honors the drawing-toolbar agent draw mode toggle.' },
      },
      outputs: {
        points:   { type: 'array', items: { type: 'object' }, required: true, description: 'Points with sequential CACP numbers (assigned via POINT_EDITOR).' },
        lines:    { type: 'array', items: { type: 'object' }, description: 'Lines whose from/to references resolve to CACP point numbers.' },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      examples: [
        'Process pages 2–4 of an uploaded subdivision plan and import boundary corners',
        'Run in points_only mode to capture controls without auto-connecting linework',
      ],
    },
    {
      id: 'civil_plan_expert_status',
      name: 'Civil Plan Expert Status',
      description: 'Returns whether a plan is loaded and how many points/lines are currently staged.',
      inputs: {},
      outputs: {
        planLoaded:  { type: 'boolean', required: true },
        pointCount:  { type: 'integer' },
        lineCount:   { type: 'integer' },
        modelInUse:  { type: 'string', description: 'e.g. gemini-3.7-flash or claude-sonnet-5' },
      },
    },
    {
      id: 'civil_plan_expert_set_draw_mode',
      name: 'Set Draw Mode',
      description: 'Switches the agent draw mode used for the next extraction (Points + Lines / Points only / Lines only).',
      inputs: {
        mode: { type: 'string', enum: ['points_lines', 'points_only', 'lines_only'], required: true },
      },
      outputs: {
        mode: { type: 'string', required: true },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// CAD Manager — Single Source of Truth for layers, codes, and linetypes
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.CAD_MANAGER,
  displayName: 'CAD Manager',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'cad_get_layer_for_code',
      name: 'Get Layer for Code',
      description:
        'Returns the recommended pointLayer, lineLayer, and lineType for a given field code or description. ' +
        'Any agent that generates points or lines SHOULD call this before assigning a layer so the output ' +
        'conforms to the loaded CAD standard. Falls back to sensible survey defaults when no standard is loaded.',
      inputs: {
        code: {
          type: 'string',
          required: true,
          description: 'Raw or master code / description (e.g. "EP", "FENCE", "MON").',
        },
        agentHint: {
          type: 'string',
          description: 'Optional: the requesting agent type (e.g. "DEED_READER") to assist default selection.',
        },
      },
      outputs: {
        pointLayer: { type: 'string', description: 'Layer for point insertion.' },
        lineLayer:  { type: 'string', description: 'Layer for associated linework.' },
        lineType:   { type: 'string', description: 'Linetype name (e.g. "CONTINUOUS", "DASHED").' },
        source:     { type: 'string', description: '"alias" | "standard" | "default" | "unknown".' },
        confidence: { type: 'number', description: '0–1 confidence in the resolution.' },
      },
      examples: [
        'Boundary Agent asks for layer for "MON" → returns pointLayer="L-SURV-MONUMENT", lineLayer="L-DEED-BOUNDARY"',
        'Civil Drafter asks for layer for "EP" → returns pointLayer="V-TOPO-STRM", lineLayer="V-TOPO-STRM"',
      ],
    },
    {
      id: 'cad_get_layers_context',
      name: 'Get Layers Context String',
      description:
        'Returns a formatted summary of all layers defined in the currently-loaded CAD standard, ' +
        'suitable for injection into AI agent prompts. When called before starting a chat session, ' +
        'this ensures agents use correct layer names from the project standard.',
      inputs: {
        format: {
          type: 'string',
          enum: ['condensed', 'full'],
          default: 'condensed',
          description: '"condensed" for a compact table, "full" for all fields.',
        },
      },
      outputs: {
        contextString: {
          type: 'string',
          required: true,
          description: 'Pre-formatted text block listing code → pointLayer / lineLayer / lineType mappings.',
        },
        codeCount:  { type: 'integer' },
        layerCount: { type: 'integer', description: 'Unique layer names in the standard.' },
      },
      examples: [
        'Called once at session load to build the layer preamble injected into all agent system instructions.',
      ],
    },
    {
      id: 'cad_list_all_layers',
      name: 'List All Layers',
      description:
        'Returns every unique layer name (both point and line layers) defined across all codes in the ' +
        'loaded standard. Useful for building the Data Visibility toggle panel.',
      inputs: {},
      outputs: {
        layers: {
          type: 'array',
          items: { type: 'object' },
          required: true,
          description: 'Array of { name, description, isPointLayer, isLineLayer } objects.',
        },
        standardName: { type: 'string', description: 'Name of the currently-loaded standard, if any.' },
      },
      examples: [
        'Data Visibility panel queries this to build the dynamic layer toggle list.',
      ],
    },
    {
      id: 'cad_resolve_batch',
      name: 'Resolve Batch of Codes',
      description:
        'Resolves layers for an array of codes in a single call. More efficient than calling ' +
        'cad_get_layer_for_code in a loop when processing many points or lines at once.',
      inputs: {
        codes: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: 'Array of raw or master codes to resolve.',
        },
      },
      outputs: {
        resolutions: {
          type: 'array',
          items: { type: 'object' },
          required: true,
          description: 'Array of { code, pointLayer, lineLayer, lineType, source, confidence } objects in input order.',
        },
      },
    },
    {
      id: 'cad_resolve_symbol_for_code',
      name: 'Resolve Symbol for Code',
      description:
        'Looks up the CustomSymbol that should be auto-applied to a point with the given code/description. ' +
        'Resolution order: (1) exact match between code.symbol field in the loaded standard and a CustomSymbol.name, ' +
        '(2) case-insensitive substring match between the description and any CustomSymbol.name, ' +
        '(3) AI generation if requested. Returns null when nothing matches and generation was not requested. ' +
        'The Symbols view and the CAD Standards view share the same CustomSymbol library, so any symbol ' +
        'uploaded or generated in either view becomes immediately available to this skill.',
      inputs: {
        code: {
          type: 'string',
          required: true,
          description: 'Field code or full point description (e.g. "MAG", "IPF #5 REBAR", "EP").',
        },
        autoGenerate: {
          type: 'boolean',
          default: false,
          description: 'When true and no library match is found, generate a new SVG via Gemini and add it to the library.',
        },
      },
      outputs: {
        symbolId:   { type: 'string', description: 'CustomSymbol.id when resolved; null when no match.' },
        symbolName: { type: 'string', description: 'Human-readable symbol name.' },
        source:     { type: 'string', description: '"standard-exact" | "library-fuzzy" | "ai-generated" | "none".' },
        confidence: { type: 'number', description: '0-1 confidence in the resolution.' },
      },
      examples: [
        'Point Editor adds a new point with description "IPF #5 REBAR" → calls this skill → gets the iron-pin-found symbol.',
        'Civil Plan Expert imports a batch of MH points → resolves "MH" → gets the manhole symbol library entry.',
      ],
    },
    {
      id: 'cad_auto_apply_symbols',
      name: 'Auto-Apply Symbols to Points',
      description:
        'Batch operation: for each provided point, resolves the matching CustomSymbol (via the same logic as ' +
        'cad_resolve_symbol_for_code) and emits the symbol assignments the caller should apply. Does NOT mutate ' +
        'state directly — the caller (typically App.tsx point reducer) is responsible for committing the assignments.',
      inputs: {
        pointIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of point ids to scope the run. Omit to run on all points missing a symbol.',
        },
        autoGenerate: { type: 'boolean', default: false, description: 'Whether to AI-generate symbols for unresolved codes.' },
      },
      outputs: {
        assignments: {
          type: 'array',
          items: { type: 'object' },
          required: true,
          description: 'Array of { pointId, symbolId, symbolName, source, confidence }.',
        },
        unresolved: {
          type: 'array',
          items: { type: 'string' },
          description: 'Descriptions/codes that produced no match.',
        },
      },
      examples: [
        'User clicks "Auto-Apply Symbols" in the CAD Standards view → CAD Manager runs this skill across all points → user reviews & accepts.',
      ],
    },
    {
      id: 'cad_create_layer',
      name: 'Create / Author CAD Layer',
      description:
        'Author a new code + layer triple (code, pointLayer, lineLayer, lineType) into the loaded CAD ' +
        'standard. If no standard is loaded, a minimal one is seeded automatically. Existing codes are ' +
        'updated in place (case-insensitive on `code`). Use this when an agent encounters a feature that ' +
        "has no layer assignment yet — e.g. Deed Reader meeting an unusual call type, Boundary Agent " +
        'needing a per-deed layer, Civil Drafter inventing a new linework class. v26.05.17.41.',
      inputs: {
        code:        { type: 'string', required: true, description: 'Short master code (e.g. "DEED2", "WET-OUTL").' },
        description: { type: 'string', description: 'Human-readable description. Defaults to `code`.' },
        pointLayer:  { type: 'string', description: 'Layer for point insertion. Defaults to "V-NODE".' },
        lineLayer:   { type: 'string', description: 'Layer for associated linework. Omit for points-only codes.' },
        lineType:    { type: 'string', default: 'CONTINUOUS', description: 'AutoCAD linetype name.' },
        category:    { type: 'string', description: 'Optional grouping (e.g. "Boundary", "Topography").' },
      },
      outputs: {
        added:     { type: 'boolean', required: true, description: 'True when a new code was inserted, false when an existing code was updated.' },
        code:      { type: 'string',  required: true },
        pointLayer:{ type: 'string',  required: true },
        lineLayer: { type: 'string' },
        lineType:  { type: 'string',  required: true },
      },
      examples: [
        'Deed Reader meets a "RIPARIAN RESERVE" boundary call → cad_create_layer({code:"RIP-RES", description:"Riparian Reserve", pointLayer:"V-NODE", lineLayer:"L-RIPARIAN", lineType:"DASHED"}).',
      ],
    },
    {
      id: 'cad_set_active_drawing_layer',
      name: 'Set Active Drawing Layer',
      type: 'action' as const,
      description:
        'Sets the app\'s current manual drawing layer (the layer used by interactive line drawing tools). ' +
        'Voice Agent and peer agents must use this skill for layer changes so the action is visible in CACP logs and follows confirmation-first orchestration.',
      inputs: {
        layer: { type: 'string', required: true, description: 'Target CAD layer name to make active for manual drawing.' },
        reason: { type: 'string', description: 'Optional short reason for fieldbook/CACP audit log.' },
      },
      outputs: {
        appliedLayer: { type: 'string', required: true },
        changed: { type: 'boolean', required: true },
      },
      examples: [
        'Voice Agent confirmation: cad_set_active_drawing_layer({ layer:"L-BUILDING", reason:"User confirmed building drafting intent." }).',
      ],
    },
    {
      id: 'cad_ensure_default_layers',
      name: 'Ensure Default Boundary Layers',
      description:
        'Idempotently seed the four boundary-special codes (DEED → L-DEED-BOUNDARY, INCL → L-INCLUSION, ' +
        'EXCL → L-EXCLUSION, BRKL → L-BREAKLINE) into the loaded standard if missing. Used internally by ' +
        'Draw Boundary so it always has a layer to resolve to. v26.05.17.41.',
      inputs: {},
      outputs: {
        addedCodes: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: 'Codes that were newly inserted (empty when everything was already present).',
        },
      },
      examples: [
        'Boundary Agent press "Draw Boundary" → cad_ensure_default_layers() → DEED + INCL + EXCL + BRKL inserted on first run.',
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Standards Compliance Agent — PDF standards and completeness auditing
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.STANDARDS_COMPLIANCE,
  displayName: 'Standards Compliance Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'standards_run_compliance_audit',
      name: 'Run Standards Compliance Audit',
      description:
        'Runs a completeness and standards audit against the currently loaded subject document and optional reference/control standard documents. ' +
        'Supports CAD Manager, control PDF, or combined standards sources.',
      inputs: {
        sourceMode: {
          type: 'string',
          enum: ['ask-each-run', 'cad-manager', 'control-pdf', 'combined'],
          default: 'ask-each-run',
          description: 'Standards source mode for this run.',
        },
        query: {
          type: 'string',
          description: 'Optional user query or run note to include in the audit context.',
        },
      },
      outputs: {
        passed: { type: 'boolean', required: true },
        summary: { type: 'string', required: true },
        issueCount: { type: 'integer', required: true },
        reportId: { type: 'string', required: true },
      },
      examples: [
        'Run an audit in combined mode using CAD Manager and control PDF context.',
      ],
    },
    {
      id: 'standards_get_last_report',
      name: 'Get Last Compliance Report',
      description:
        'Returns the latest standards compliance report generated in this session, including findings and metadata.',
      inputs: {},
      outputs: {
        hasReport: { type: 'boolean', required: true },
        report: { type: 'object', description: 'Structured StandardsComplianceReport payload.' },
      },
      examples: [
        'Boundary Agent asks for latest compliance findings before export.',
      ],
    },
    {
      id: 'standards_get_checklist',
      name: 'Get Active Compliance Checklist',
      description:
        'Returns the currently active user-defined standards checklist and active source mode defaults.',
      inputs: {},
      outputs: {
        sourceMode: { type: 'string', required: true },
        checks: { type: 'object', required: true },
        hasControlFile: { type: 'boolean', required: true },
        hasSubjectFile: { type: 'boolean', required: true },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Contouring Agent — ESRI REST contour fetching and public service discovery
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.CONTOURING_AGENT,
  displayName: 'Contouring Agent',
  cacpEnabled: true,
  version: '0.1.0',
  skills: [
    {
      id: 'generate_loaded_tin_contours',
      name: 'Generate Loaded TIN Contours',
      description:
        'Extracts contour polylines directly from a loaded TIN surface already in the session. ' +
        'Use this when the user wants contours from an imported .tin or LandXML surface rather than from survey points.',
      inputs: {
        contourInterval: {
          type: 'number',
          required: true,
          description: 'Vertical interval between contour lines in project units.',
        },
        majorInterval: {
          type: 'number',
          required: true,
          description: 'Vertical interval for major/index contours.',
        },
        sourceTinId: {
          type: 'string',
          description: 'Optional loaded TIN surface id. When omitted, the host uses the active or first loaded TIN.',
        },
        smoothing: {
          type: 'integer',
          description: 'Optional smoothing level from 0-4.',
        },
        showLabels: {
          type: 'boolean',
          description: 'Whether major contours should receive labels.',
        },
        labelDensity: {
          type: 'number',
          description: 'Optional label density multiplier.',
        },
      },
      outputs: {
        count: { type: 'integer', description: 'Number of contour path segments generated.' },
        sourceTinId: { type: 'string', description: 'TIN surface id used for the generation.' },
      },
      examples: [
        'Generate 1ft contours from the loaded .tin surface with 5ft major contours',
        'Create 2-foot index contours from tin-import-123 with labels turned off',
      ],
    },
    {
      id: 'fetch_esri_rest_contours',
      name: 'Fetch ESRI REST Contours',
      description:
        'Fetches georeferenced contour polyline or elevation data from a provided ESRI REST Feature ' +
        'Service or Map Service URL (e.g. PASDA, county GIS portals, state DEP services). ' +
        'The agent queries the service for contour features within an optional bounding box and ' +
        'converts the results into project-space survey lines.',
      inputs: {
        serviceUrl: {
          type: 'string',
          required: true,
          description:
            'Base URL of the ESRI REST Feature Service or Map Service layer ' +
            '(e.g. https://www.pasda.psu.edu/arcgis/rest/services/pasda/Contours2ft/MapServer/0).',
        },
        bbox: {
          type: 'object',
          description:
            'Optional bounding box { xmin, ymin, xmax, ymax } in the service spatial reference. ' +
            'When omitted the agent uses the current project extent.',
        },
        sr: {
          type: 'integer',
          description: 'Output WKID spatial reference for the returned geometry (defaults to project EPSG).',
        },
        maxFeatures: {
          type: 'integer',
          description: 'Maximum number of contour features to retrieve (default 2000).',
        },
      },
      outputs: {
        features: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of contour polyline features with elevation attributes.',
        },
        count: { type: 'integer', description: 'Number of features returned.' },
        sr: { type: 'object', description: 'Spatial reference of returned geometry.' },
        layerName: { type: 'string', description: 'Name of the service layer fetched.' },
      },
      examples: [
        'Fetch 2ft contours from PASDA Pennsylvania service within current map extent',
        'Pull elevation contours from a county GIS REST endpoint for a specific township boundary',
        'Load LIDAR-derived 1ft contours from a state DEP Map Service',
      ],
    },
    {
      id: 'discover_public_contour_services',
      name: 'Discover Public Contour Services',
      description:
        'Acts as a "claw" to search for publicly available ESRI REST contour and elevation services ' +
        'for a given state, county, or country. Queries known GIS data portals (PASDA, state GIS hubs, ' +
        'ArcGIS Online, county open-data portals) to compile a list of accessible REST service endpoints. ' +
        'Results include service URL, metadata, and coverage region so the user can select and load them.',
      inputs: {
        searchArea: {
          type: 'string',
          required: true,
          description:
            'Human-readable search area, e.g. "Pennsylvania", "Lancaster County PA", "Ontario Canada", ' +
            '"New York State".',
        },
        dataType: {
          type: 'string',
          enum: ['contours', 'elevation', 'dem', 'lidar', 'all'],
          default: 'contours',
          description: 'Type of elevation data to search for.',
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of service results to return (default 20).',
        },
      },
      outputs: {
        services: {
          type: 'array',
          items: { type: 'object' },
          description:
            'Array of { name, url, region, description, dataType, resolution } objects, ' +
            'each representing a publicly accessible REST service.',
        },
        count: { type: 'integer', description: 'Number of services found.' },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Portals queried during the search.',
        },
      },
      examples: [
        'Find all public ESRI contour services for Pennsylvania (PASDA, DCNR, county GIS)',
        'Search for 1ft LIDAR-derived elevation services in Lancaster County PA',
        'Discover open topographic REST services for Ontario, Canada via ArcGIS Online',
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Steep Slope Agent — TIN slope-band analysis and CAD layer publishing
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.STEEP_SLOPE_AGENT,
  displayName: 'Steep Slope Agent',
  cacpEnabled: true,
  version: '0.1.0',
  skills: [
    {
      id: 'run_steep_slope_analysis',
      name: 'Run Steep Slope Analysis',
      description:
        'Analyzes a TIN surface by slope-percent bands, groups connected steep triangles, and filters out ' +
        'components whose elevation span is below a minimum threshold.',
      inputs: {
        tinId: {
          type: 'string',
          required: true,
          description: 'Session TIN surface id to analyze.',
        },
        minComponentVerticalSpan: {
          type: 'number',
          required: true,
          description: 'Minimum vertical span (project units) for a connected steep component to be kept.',
        },
        bands: {
          type: 'array',
          items: { type: 'object' },
          description: 'Slope bands with min/max percent and CAD layer/color mapping.',
        },
        inclusionBoundaryId: {
          type: 'string',
          description: 'Optional inclusion boundary id to clip analysis extent.',
        },
      },
      outputs: {
        runId: {
          type: 'string',
          required: true,
          description: 'Generated steep-slope analysis run id.',
        },
        keptTriangleCount: { type: 'integer' },
        removedTriangleCount: { type: 'integer' },
        componentCount: { type: 'integer' },
      },
      examples: [
        'Run steep-slope analysis for TIN tin-abc123 with bands 0-15, 15-30, and 30+ percent using a 6-ft minimum span',
      ],
    },
    {
      id: 'publish_steep_slope_layers',
      name: 'Publish Steep Slope Layers',
      description:
        'Creates or updates CAD layers for each configured slope band so the analysis output maps to CAD standards.',
      inputs: {
        runId: {
          type: 'string',
          required: true,
          description: 'Steep-slope run id to publish.',
        },
        createMissingLayers: {
          type: 'boolean',
          default: true,
          description: 'When true, missing layers are auto-created through CAD Manager integration.',
        },
      },
      outputs: {
        createdLayers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Layer names created during publish.',
        },
        resolvedLayers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Final layer names mapped to each slope band.',
        },
      },
      examples: [
        'Publish run steep-slope-abc123 to CAD layers SS_0_15, SS_15_30, SS_30_PLUS',
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Zoning Agent — Google Search-grounded zoning research (CACP-enabled)
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.ZONING_AGENT,
  displayName: 'Zoning Agent',
  cacpEnabled: true,
  version: '2.0.0',
  skills: [
    {
      id: 'get_zoning_requirements',
      name: 'Get Zoning Requirements',
      description:
        'Returns setbacks, dimensional standards, and key zoning requirements for a given ' +
        'municipality and district, sourced via live Google Search grounding. ' +
        'Other agents (e.g. the Boundary Agent) should call this to obtain setback data for drawing.',
      inputs: {
        state:        { type: 'string', required: true,  description: 'US state name or abbreviation.' },
        county:       { type: 'string', required: true,  description: 'County name.' },
        municipality: { type: 'string', required: true,  description: 'Municipality or township name.' },
        district:     { type: 'string', description: 'Zoning district code (e.g. R-1, C-2, A-P).' },
        fields:       {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific fields to return. Omit for all. Options: setbacks, height, lotArea, coverage, parking, uses.',
        },
      },
      outputs: {
        district:    { type: 'string', description: 'District code confirmed or identified.' },
        setbacks:    { type: 'object', description: 'front/side/rear setback distances in feet.' },
        maxHeight:   { type: 'number', description: 'Maximum building height in feet.' },
        minLotArea:  { type: 'string', description: 'Minimum lot area with units.' },
        lotCoverage: { type: 'string', description: 'Maximum lot coverage percentage.' },
        permittedUses: { type: 'array', items: { type: 'string' } },
        sources:     { type: 'array', items: { type: 'string' }, description: 'URLs of ordinance/municipal sources.' },
        confidence:  { type: 'number', description: '0-1 confidence based on source quality.' },
        disclaimer:  { type: 'string', description: 'Always-present advisory to verify with official sources.' },
      },
      examples: [
        'Boundary Agent requests front/side/rear setbacks for R-1 in Upper Gwynedd Township, Montgomery County PA to draw setback lines on the canvas',
        'Civil Plan Expert asks for maximum building height in C-2 zone for a commercial site plan',
        'User asks whether a warehouse is permitted in an I-1 zone in Chester County PA',
      ],
    },
    {
      id: 'query_zoning',
      name: 'Query Zoning (Freeform)',
      description:
        'Answers a freeform zoning question for the currently loaded jurisdiction using live Google Search. ' +
        'Use this for questions that do not fit the structured get_zoning_requirements schema.',
      inputs: {
        question:     { type: 'string', required: true, description: 'The zoning question to answer.' },
        state:        { type: 'string', description: 'State — override the currently loaded one if needed.' },
        county:       { type: 'string', description: 'County — override.' },
        municipality: { type: 'string', description: 'Municipality — override.' },
        district:     { type: 'string', description: 'Zoning district — override.' },
      },
      outputs: {
        answer:   { type: 'string', required: true, description: 'Plain-language answer grounded in search results.' },
        sources:  { type: 'array', items: { type: 'string' }, description: 'URLs cited.' },
      },
      examples: [
        'Does Upper Gwynedd Township require a conditional use for a veterinary clinic in C-1?',
        'What is the impervious surface limit for the Sanatoga Creek riparian buffer overlay?',
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Flood Agent — FEMA NFHL flood-hazard linework (CACP-enabled)
// Peer drawing agents (Boundary, Civil Drafter, Civil Plan Expert) can call
// `fetch_flood_zones` to pull regulatory floodplain rings onto the canvas
// without bouncing the user out to the Flood Agent UI.
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.FLOOD_AGENT,
  displayName: 'Flood Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'fetch_flood_zones',
      name: 'Fetch FEMA Flood Zones',
      description:
        'Fetches FEMA National Flood Hazard Layer (NFHL, MapServer/28 — S_FLD_HAZ_AR) ' +
        'polygons for a project area and drops them onto the canvas as SurveyLines ' +
        'tagged type=\'flood\' and layer=\'FEMA-FLOOD-<ZONE>\' (one CAD layer per FEMA zone code: ' +
        'AE, AH, AO, VE, X, X-Shaded, etc.). The area is specified either by drawn ' +
        'inclusion polygon (mode=\'inclusion\') OR by free-text description that gets ' +
        'geocoded via Nominatim (mode=\'description\'). Reprojects WGS84 → project EPSG ' +
        'client-side so the linework lands on the correct State Plane / UTM coordinates.',
      inputs: {
        mode: {
          type: 'string',
          required: true,
          enum: ['inclusion', 'description'],
          description:
            'inclusion = use the bbox of any SurveyLines currently tagged type=\'inclusion\' ' +
            'on the canvas; description = geocode `descriptionText` via Nominatim.',
        },
        descriptionText: {
          type: 'string',
          description:
            'Required when mode=\'description\'. Free-text location, e.g. ' +
            '"Lower Merion Township, PA" or "123 Main St, Norristown, PA".',
        },
      },
      outputs: {
        addedLines:    { type: 'integer', description: 'Number of polygon segments added to the canvas.' },
        featureCount:  { type: 'integer', description: 'Number of FEMA flood polygons returned.' },
        zoneCounts:    { type: 'object', description: 'Map of FEMA zone code → polygon count, e.g. {"AE": 14, "X": 7}.' },
        layers:        { type: 'array', items: { type: 'string' }, description: 'CAD layer names created (FEMA-FLOOD-AE, FEMA-FLOOD-X, ...).' },
        truncated:     { type: 'boolean', description: 'True if FEMA NFHL hit the transfer limit and only a partial set came back.' },
      },
      examples: [
        'Civil Drafter is laying out a site plan and needs the AE / X floodplain rings — calls fetch_flood_zones with mode=\'inclusion\' to use the project boundary already on the canvas.',
        'Boundary Agent is drafting a metes-and-bounds and the legal references "FEMA Zone AE per FIRM panel" — calls fetch_flood_zones with mode=\'description\' for the parcel address to pull the actual regulatory rings.',
        'Civil Plan Expert needs flood-hazard overlay for a stormwater report — calls fetch_flood_zones to render the floodway and 100-year polygons as their own visibility-controllable CAD layers.',
      ],
    },
    {
      id: 'clear_flood_zones',
      name: 'Clear FEMA Flood Linework',
      description:
        'Removes every SurveyLine whose layer starts with "FEMA-FLOOD-" from the canvas. ' +
        'Use before re-fetching a different area, or to hide flood overlay without ' +
        'touching layer visibility.',
      inputs: {},
      outputs: {
        removedLines: { type: 'integer', description: 'Number of FEMA flood SurveyLines removed.' },
      },
      examples: [
        'Boundary Agent finishes drafting the metes-and-bounds and clears the reference floodplain rings before exporting.',
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Soils Agent — USDA NRCS SSURGO soil survey polygon overlay + tabular reports
// Peer agents (Boundary, Civil Drafter, Civil Plan Expert) can call
// `fetch_soils` to pull SSURGO map-unit rings onto the canvas without
// bouncing the user out to the Soils Agent UI.
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.SOILS_AGENT,
  displayName: 'Soils Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'fetch_soils',
      name: 'Fetch USDA NRCS SSURGO Soil Map Units',
      description:
        'Fetches USDA NRCS SSURGO soil map-unit polygons (USA Soils Map Units 2 hosted feature service) ' +
        'for a project area and drops them onto the canvas as SurveyLines ' +
        'tagged type=\'soil\' and layer=\'SOILS-<MUSYM>\' (one CAD layer per soil symbol, ' +
        'e.g. SOILS-HgB, SOILS-MnB2, SOILS-Wn). The area is specified either by drawn ' +
        'inclusion polygon (mode=\'inclusion\') OR by free-text description that gets ' +
        'geocoded via Nominatim (mode=\'description\'). Reprojects WGS84 → project EPSG ' +
        'client-side so the linework lands on the correct State Plane / UTM coordinates.',
      inputs: {
        mode: {
          type: 'string',
          required: true,
          enum: ['inclusion', 'description'],
          description:
            'inclusion = use the bbox of any SurveyLines currently tagged type=\'inclusion\' ' +
            'on the canvas; description = geocode `descriptionText` via Nominatim.',
        },
        descriptionText: {
          type: 'string',
          description:
            'Required when mode=\'description\'. Free-text location, e.g. ' +
            '"Lower Merion Township, PA" or "123 Main St, Norristown, PA".',
        },
      },
      outputs: {
        addedLines:    { type: 'integer', description: 'Number of polygon segments added to the canvas.' },
        featureCount:  { type: 'integer', description: 'Number of SSURGO soil map-unit polygons returned.' },
        zoneCounts:    { type: 'object', description: 'Map of soil symbol → polygon count, e.g. {"HgB": 3, "MnB2": 1}.' },
        layers:        { type: 'array', items: { type: 'string' }, description: 'CAD layer names created (SOILS-HgB, SOILS-MnB2, ...).' },
        truncated:     { type: 'boolean', description: 'True if SSURGO service hit transfer limit and only a partial set came back.' },
      },
      examples: [
        'Civil Drafter is laying out a stormwater design and needs to know the hydrologic soil groups — calls fetch_soils with mode=\'inclusion\' to pull SSURGO rings for the project boundary.',
        'Boundary Agent is drafting a subdivision plat that references soil types for lot grading — calls fetch_soils with mode=\'description\' for the parcel address.',
        'Civil Plan Expert needs a soils overlay for a site grading plan or NPDES permit exhibit — calls fetch_soils to render each map-unit as its own visibility-controllable CAD layer.',
      ],
    },
    {
      id: 'fetch_soil_report',
      name: 'Fetch Soil Tabular Report',
      description:
        'Queries the USDA Soil Data Access (SDA) tabular API for detailed attributes — ' +
        'hydrologic group, drainage class, taxonomy class, farmland classification — ' +
        'for one or more soil map units identified by MUKEY. Call after fetch_soils to ' +
        'enrich the overlay with engineering-relevant soil properties.',
      inputs: {
        mukeys: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: 'Array of SSURGO MUKEY strings to retrieve tabular data for.',
        },
      },
      outputs: {
        reportData: {
          type: 'object',
          description: 'Keyed by MUKEY. Each entry: { hydgrpdcd, drclassdcd, taxclname, farmlndcl }.',
        },
      },
      examples: [
        'After fetching SSURGO polygons, Civil Plan Expert calls fetch_soil_report for all returned MUKEYs to build a soils legend table for the plan sheet.',
        'Boundary Agent references HydGroup A vs. C distinction for stormwater calculations — calls fetch_soil_report to get hydgrpdcd for each map unit.',
      ],
    },
    {
      id: 'clear_soils',
      name: 'Clear Soil Linework',
      description:
        'Removes every SurveyLine whose layer starts with "SOILS-" from the canvas. ' +
        'Use before re-fetching a different area, or to hide soil overlay without ' +
        'touching layer visibility.',
      inputs: {},
      outputs: {
        removedLines: { type: 'integer', description: 'Number of SSURGO soil SurveyLines removed.' },
      },
      examples: [
        'Boundary Agent finishes referencing soil types and clears the SSURGO rings before exporting the final plat.',
      ],
    },
    {
      id: 'get_soils_context',
      name: 'Get Soils Context Summary',
      description:
        'Returns a Markdown table summarising all SSURGO soil map units currently loaded on the canvas ' +
        '(symbol, name, hydro group, drainage class, farmland classification). ' +
        'Useful for agents that need soil context to populate plan notes or permit forms.',
      inputs: {},
      outputs: {
        contextMarkdown: { type: 'string', description: 'Markdown table of current soil map units and their attributes.' },
      },
      examples: [
        'Civil Plan Expert calls get_soils_context to populate the soils legend text block on a grading plan.',
        'Boundary Agent calls get_soils_context to include soil references in the survey description.',
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Profile & Cross Section Agent — elevation profiles / cross sections
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.PROFILE_AGENT,
  displayName: 'Profile & Cross Section',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'generate_profile',
      name: 'Generate Elevation Profile',
      description:
        'Computes an elevation profile along a referenced line/centerline using the active surface or point cloud. ' +
        'Caller provides either a SurveyLine id or two endpoint point numbers.',
      inputs: {
        lineId:          { type: 'string',  description: 'SurveyLine id to profile along.' },
        fromPointNumber: { type: 'string',  description: 'Start point (when lineId not given).' },
        toPointNumber:   { type: 'string',  description: 'End point (when lineId not given).' },
        sampleInterval:  { type: 'number',  description: 'Station interval in project units.', default: 10 },
      },
      outputs: {
        stations:    { type: 'array', items: { type: 'number' }, required: true },
        elevations:  { type: 'array', items: { type: 'number' }, required: true },
        length:      { type: 'number', description: 'Total path length.' },
      },
      examples: [
        'Centerline agent requests a profile along the active CL at 25-ft stations.',
        'Boundary agent asks for a profile across a parcel to show topography on the plot.',
      ],
    },
    {
      id: 'generate_cross_section',
      name: 'Generate Cross Section',
      description:
        'Builds a cross section perpendicular to a centerline at a given station, sampling left/right offsets.',
      inputs: {
        centerlineId: { type: 'string',  required: true },
        station:      { type: 'string',  required: true, description: 'e.g. "10+50"' },
        leftOffset:   { type: 'number',  default: 25 },
        rightOffset:  { type: 'number',  default: 25 },
        interval:     { type: 'number',  default: 2 },
      },
      outputs: {
        offsets:    { type: 'array', items: { type: 'number' }, required: true },
        elevations: { type: 'array', items: { type: 'number' }, required: true },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Structures Agent — FEMA NSI building centroids, footprint synthesis, autodraw
//
// THIS AGENT is the SOLE owner of all building/structure drawing tasks.
// Any agent that hears "draw the buildings", "draw structures", "autodraw",
// "plot building footprints", or "fetch structures" MUST delegate here via
// CACP { "askPeer": { "skillId": "structures_draw_footprints", ... } }
// rather than attempting to emit building linework itself.
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.STRUCTURES_AGENT,
  displayName: 'Structures Agent',
  cacpEnabled: true,
  version: '2.0.0',
  skills: [
    {
      id: 'structures_fetch_nsi',
      name: 'Fetch Structures (FEMA NSI + OSM)',
      description:
        'Fetches FEMA National Structure Inventory (NSI) building centroids AND OpenStreetMap ' +
        '`building=*` polygons for the current project extent or a supplied bounding box. ' +
        'NSI provides attributes (occupancy, sqft_ft, num_story, year built, first-floor elev., ' +
        'census flood-loss stats). OSM provides real building geometry. Attributes are joined ' +
        'onto polygons via point-in-polygon. Results: NSI centroids land on layer "FEMA-NSI"; ' +
        'OSM polygons are cached in memory until structures_rectify_footprints emits them as ' +
        'closed STRUCTURES-layer linework. Call this BEFORE structures_rectify_footprints.',
      inputs: {
        bbox: {
          type: 'object',
          description: 'Optional {minLon, minLat, maxLon, maxLat} WGS84 bounding box. Omit to use project extent.',
          properties: {
            minLon: { type: 'number' }, minLat: { type: 'number' },
            maxLon: { type: 'number' }, maxLat: { type: 'number' },
          },
        },
        layer: {
          type: 'string',
          default: 'FEMA-NSI',
          description: 'CAD layer for the returned NSI centroids.',
        },
      },
      outputs: {
        structureCount: { type: 'integer', required: true, description: 'NSI centroids loaded.' },
        osmPolygonCount: { type: 'integer', description: 'OSM building polygons fetched and cached.' },
        layer:          { type: 'string',  required: true },
        bbox:           { type: 'object',  description: 'Actual bounding box fetched.' },
      },
      examples: [
        'User: "fetch the buildings" → structures_fetch_nsi({}) loads NSI centroids + OSM polygons.',
        'Civil Plan Expert needs building data for a flood/site exhibit.',
      ],
    },
    {
      id: 'structures_rectify_footprints',
      name: 'Rectify Building Footprints',
      description:
        'THIS IS THE CANONICAL HANDLER for any user request to draw, rectify, or finalize building ' +
        'footprints. Trigger phrases include: "draw the buildings", "draw structures", "plot ' +
        'building footprints", "rectify the buildings", "autodraw the buildings", "close out the ' +
        'buildings", "complete the building outlines", "show building outlines". ' +
        'Runs a deterministic 4-pass rectifier on whatever data is loaded — NO Gemini round-trip:\n' +
        '  PASS 1 (HIGH confidence): For each OSM polygon overlapping a survey BLDG cluster, ' +
        'pair each BLDG point to its nearest OSM vertex and apply a 2D Helmert (rotation + ' +
        'translation, no scale) to snap the real building geometry onto the survey corners.\n' +
        '  PASS 2 (MEDIUM): Emit unmatched OSM polygons as-is.\n' +
        '  PASS 3 (HIGH/MED/LOW): For BLDG clusters with no OSM match, COGO-complete the rectangle ' +
        '— 1 corner → square centered on the point; 2 corners → perpendicular extrusion (uses NSI ' +
        'sqft if available); 3 corners → 90°-snapped parallelogram completion; ≥4 corners → ' +
        'minimum-area enclosing rectangle (rotating calipers).\n' +
        '  PASS 4 (LOW): For NSI centroids with sqft_ft but no OSM/BLDG match, emit a synthetic ' +
        'square sized to √sqft, oriented to the street grid (or N if unknown).\n' +
        'Output is closed polylines (shared polylineId per building) on layer STRUCTURES. ' +
        'Reruns are idempotent — the prior STRUCTURES layer is cleared and replaced. ' +
        'Any agent that hears "draw buildings" MUST delegate here.',
      inputs: {
        layer: {
          type: 'string',
          default: 'STRUCTURES',
          description: 'Output layer for footprint polylines.',
        },
        unitsPerFoot: {
          type: 'number',
          description: 'Project units per foot (1 for ft-based EPSG, 0.3048 for meters). Auto-detected when omitted.',
        },
        streetBearingDeg: {
          type: 'number',
          description: 'Optional dominant street bearing in degrees (0 = east). Used to orient NSI-only synthetic squares.',
        },
        clusterToleranceFeet: {
          type: 'number',
          default: 75,
          description: 'Maximum distance between two BLDG points to group into one building cluster.',
        },
      },
      outputs: {
        footprintsDrawn: { type: 'integer', required: true, description: 'Total closed polygons emitted.' },
        stats: {
          type: 'object',
          description: 'Per-pass counts: osmSnapped, osmAsIs, cogoMer, cogo3, cogo2, cogo1, nsiOnly.',
        },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      examples: [
        'User: "draw the buildings" → structures_rectify_footprints({}) — ALL agents must delegate here.',
        'User: "square that building, it only has 3 corners" → structures_rectify_footprints({}).',
        'User: "close out the buildings on the site" → structures_rectify_footprints({}).',
        'Civil Plan Expert finalizing a site plan calls structures_rectify_footprints after fetch.',
      ],
    },
    {
      id: 'structures_draw_footprints',
      name: 'Draw Building Footprints (alias → rectify)',
      description:
        'BACKWARD-COMPAT ALIAS. Delegates to structures_rectify_footprints. Kept so that older ' +
        'CACP plans and Gemini prompts referencing the old skill id still route to the new ' +
        'deterministic rectifier.',
      inputs: {
        layer: { type: 'string', default: 'STRUCTURES' },
      },
      outputs: {
        footprintsDrawn: { type: 'integer', required: true },
      },
      examples: [
        'Legacy callers: structures_draw_footprints({}) ≡ structures_rectify_footprints({}).',
      ],
    },
    {
      id: 'structures_synthesize_single',
      name: 'Synthesize Single Building Footprint',
      description:
        'Generates a single rectangular building footprint for one NSI centroid, optionally anchored ' +
        'to a set of survey BLDG corner shots. Useful when the user points to a specific building. ' +
        'Returns the 4 corner points and 4 edge lines.',
      inputs: {
        nsiId: {
          type: 'string',
          description: 'NSI structure id (from FEMA-NSI layer attributes). Required unless bldgPointNumbers given.',
        },
        bldgPointNumbers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Survey BLDG point numbers to anchor/correct the footprint position.',
        },
        layer: { type: 'string', default: 'STRUCTURES' },
      },
      outputs: {
        points: { type: 'array', items: { type: 'object' }, required: true, description: 'Four corner point definitions.' },
        lines:  { type: 'array', items: { type: 'object' }, required: true, description: 'Four edge line definitions.' },
        sqft:   { type: 'number', description: 'Estimated square footage used for sizing.' },
      },
      examples: [
        'User selects one NSI centroid and asks "draw this building" → structures_synthesize_single({nsiId:"..."})',
      ],
    },
    {
      id: 'structures_clear',
      name: 'Clear Building Footprints',
      description: 'Removes all SurveyLine entries on layer "STRUCTURES" plus cached OSM footprints, and optionally the FEMA-NSI centroids.',
      inputs: {
        clearNsi: { type: 'boolean', default: false, description: 'Also remove FEMA-NSI centroid points.' },
      },
      outputs: {
        removedLines:  { type: 'integer', required: true },
        removedPoints: { type: 'integer' },
      },
      examples: [
        'User: "clear the building footprints" → structures_clear({})',
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// COGO Agent — coordinate geometry calculations + shrinkwrap (boundary hull)
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.COGO_AGENT,
  displayName: 'COGO',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'cogo_inverse',
      name: 'Inverse Calculation',
      description:
        'Compute bearing and distance between two project points. Returns distance in project units and a formatted quadrant bearing.',
      inputs: {
        fromPointNumber: { type: 'string', required: true, description: 'Origin point number.' },
        toPointNumber:   { type: 'string', required: true, description: 'Destination point number.' },
      },
      outputs: {
        distance: { type: 'number', required: true, description: 'Distance in project units.' },
        bearing:  { type: 'string', required: true, description: 'Quadrant bearing string, e.g. "N 45°12\'30" E".' },
      },
      examples: [
        'cogo_inverse({fromPointNumber:"101", toPointNumber:"205"})',
      ],
    },
    {
      id: 'cogo_shrinkwrap',
      name: 'Shrinkwrap (Boundary Hull)',
      // Draws a boundary polyline and opens the Shrinkwrap panel — a state
      // mutation, not a read. Tagging it 'action' keeps askPeer from ever
      // serving a cached response (which would skip the draw entirely) and
      // applies the CACP loop-prevention follow-up after it succeeds.
      type: 'action' as const,
      description:
        'Compute a 2D convex hull around the supplied (or all visible) project points and draw it as a closed boundary polyline on layer "L-SURV-SHRINKWRAP". Use this when the user asks to "shrinkwrap the site", "wrap the points", or "outline the project". The result is a closed polyline whose vertices are existing point numbers — no new points are created.',
      inputs: {
        pointNumbers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional subset of point numbers to wrap. When omitted, all visible project points are used.',
        },
        layer: {
          type: 'string',
          description: 'Optional layer for the output polyline. Defaults to "L-SURV-SHRINKWRAP".',
          default: 'L-SURV-SHRINKWRAP',
        },
        replace: {
          type: 'boolean',
          description: 'When true, removes any existing shrinkwrap polyline on the target layer before drawing the new one.',
          default: true,
        },
      },
      outputs: {
        hullPointNumbers: { type: 'array', items: { type: 'string' }, required: true, description: 'Ordered hull vertices, first point repeated at end to close the loop.' },
        addedLines:       { type: 'integer', required: true, description: 'Number of SurveyLine segments added.' },
        layer:            { type: 'string', required: true },
        skippedCount:     { type: 'integer', description: 'Points skipped because of missing coordinates.' },
      },
      examples: [
        'User: "Shrinkwrap the site" → cogo_shrinkwrap({}) wraps everything visible.',
        'User: "Wrap points 101..150" → cogo_shrinkwrap({pointNumbers:["101",…,"150"]})',
      ],
    },
    // Extended COGO toolkit — see services/cogoSkillSchemas.ts.
    ...COGO_EXTENDED_SKILLS,
  ],
});
