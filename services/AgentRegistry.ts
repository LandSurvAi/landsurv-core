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
import { GEO_AI_SKILLS } from './geoSkillSchemas';
import { CL_SKILLS } from './clSkillSchemas';
import { DEED_SKILLS } from './deedSkillSchemas';
import { ROADING_SKILLS } from './roadingSkillSchemas';
import { ROAD_PAINT_SKILLS } from './roadPaintSkillSchemas';
import { STORMWATER_SKILLS } from './stormwaterSkillSchemas';
import { DIRT_VOLUME_SKILLS } from './dirtVolumeSkillSchemas';
import { CIVIL_DRAFTER_REDLINE_PATCH_SKILL, REDLINE_SKILLS } from './redlineSkillSchemas';
import { SHEET_VIEW_SKILLS } from './sheetViewProtocol';

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
      type: 'action' as const,
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
      type: 'action' as const,
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
      id: 'add_point',
      name: 'Add Point',
      type: 'action' as const,
      description:
        'Authoritative point creation. Accepts a full Google Plus Code, a short local Plus Code when the project has a location/GPS fix, a WGS84 latitude/longitude pair, or project northing/easting. PointAgent assigns the next number when pointNumber is omitted and renumbers duplicates instead of overwriting an existing point.',
      inputs: {
        plusCode:    { type: 'string',  description: 'Google Plus Code, full (87G8Q2PQ+5X) or short (Q2PQ+5X). Short codes resolve against the project location or GPS fix.' },
        latitude:    { type: 'number',  description: 'WGS84 latitude for Plus Code-free input.' },
        longitude:   { type: 'number',  description: 'WGS84 longitude for Plus Code-free input.' },
        northing:    { type: 'number',  description: 'Project northing when the caller already has projected coordinates.' },
        easting:     { type: 'number',  description: 'Project easting when the caller already has projected coordinates.' },
        pointNumber: { type: 'string',  description: 'Optional requested point number; duplicate numbers are renumbered by PointAgent.' },
        elevation:   { type: 'number',  description: 'Optional elevation.' },
        description: { type: 'string',  description: 'Optional point description.' },
      },
      outputs: {
        pointNumber: { type: 'string',  required: true },
        northing:    { type: 'number',  required: true },
        easting:     { type: 'number',  required: true },
        latitude:    { type: 'number',  description: 'Present when the input was WGS84 or a Plus Code.' },
        longitude:   { type: 'number',  description: 'Present when the input was WGS84 or a Plus Code.' },
      },
      examples: [
        'User: "add point at 87G8Q2PQ+5X" → askPeer add_point {plusCode:"87G8Q2PQ+5X"}',
        'User: "add point at Q2PQ+5X" → askPeer add_point {plusCode:"Q2PQ+5X"} (short code resolves from the project/GPS reference)',
        'User: "set a point at 39.9526, -75.1652" → askPeer add_point {latitude:39.9526, longitude:-75.1652}',
        'CACP caller already has project coordinates → askPeer add_point {northing:5000, easting:6000, description:"MON"}',
      ],
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
    ...DEED_SKILLS,
  ],
});

agentRegistry.register({
  agent: AgentType.CIVIL_DRAFTER,
  displayName: 'Civil Drafter',
  cacpEnabled: true,
  version: '1.1.0',
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
    ...GEO_AI_SKILLS,
    ...ROAD_PAINT_SKILLS,
    CIVIL_DRAFTER_REDLINE_PATCH_SKILL,
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
  version: '1.1.0',
  skills: [
    {
      id: 'place_station_offset_point',
      name: 'Place Station/Offset Point',
      type: 'action' as const,
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
        associationId: { type: 'string', description: 'Parametric link that follows the baseline when it is edited.' },
      },
    },
    {
      id: 'generate_stationed_points',
      name: 'Generate Stationed Points',
      type: 'action' as const,
      description: 'Generates points along a centerline at a regular interval. Each point gets a fresh PN from POINT_EDITOR; station is recorded in description only.',
      inputs: {
        startStation: { type: 'string',  required: true },
        endStation:   { type: 'string',  required: true },
        interval:     { type: 'number',  required: true },
        offset:       { type: 'number',  default: 0 },
        description:  { type: 'string' },
      },
      outputs: {
        points: { type: 'array', items: { type: 'object' }, required: true },
        associationIds: { type: 'array', items: { type: 'string' }, description: 'Parametric link for each generated point.' },
      },
    },
    ...CL_SKILLS,
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
  version: '1.2.0',
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
      type: 'action' as const,
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
    {
      id: 'gps_get_stakeout_guidance',
      name: 'Get Stakeout Guidance',
      description:
        'Computes live bearing, distance, delta northing/easting, and cut/fill from the rover fix to a stakeout target. Uses the active target when pointNumber is omitted.',
      inputs: {
        pointNumber: { type: 'string', description: 'Optional target point number; defaults to the active stakeout target.' },
      },
      outputs: {
        hasFix:           { type: 'boolean', required: true },
        targetPointNumber:{ type: 'string', required: true },
        description:      { type: 'string' },
        bearingDeg:       { type: 'number' },
        distanceFt:       { type: 'number' },
        deltaNorthFt:     { type: 'number' },
        deltaEastFt:      { type: 'number' },
        cutFillFt:        { type: 'number' },
        epsg:             { type: 'integer' },
      },
    },
    {
      id: 'gps_collect_point',
      name: 'Collect GPS Point',
      type: 'action' as const,
      description:
        'Stores a new point at the rover\'s current fix in the project working point list. Omit pointNumber to have the Point Editor issue the next number. Fails when there is no fix, no projection, or the point number already exists.',
      inputs: {
        pointNumber: { type: 'string', description: 'Optional point number. Defaults to the next available number.' },
        description: { type: 'string', description: 'Optional point description. Default "GPS".' },
      },
      outputs: {
        stored:      { type: 'boolean', required: true },
        pointNumber: { type: 'string', required: true },
        northing:    { type: 'number' },
        easting:     { type: 'number' },
        elevation:   { type: 'number' },
        message:     { type: 'string', required: true },
      },
    },
    {
      id: 'gps_open_rover',
      name: 'Open GPS Rover',
      type: 'action' as const,
      description:
        'Opens (and docks) the single GPS Rover dialog on the canvas, optionally focused on stakeout, collect, or benchmark. Project location now belongs to the LSAI Agent (lsvz_project_locations / lsvz_open_project_locations).',
      inputs: {
        mode: { type: 'string', enum: ['stakeout', 'collect', 'benchmark'], description: 'Panel focus. Default stakeout.' },
        dock: { type: 'boolean', description: 'Dock into the agent tool shelf. Default true.' },
      },
      outputs: {
        opened: { type: 'boolean', required: true },
        mode:   { type: 'string', required: true },
        docked: { type: 'boolean', required: true },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.LSVZ_AGENT,
  displayName: 'LSAI Agent',
  cacpEnabled: true,
  version: '1.5.0',
  skills: [
    {
      id: 'lsvz_dispatch',
      name: 'Dispatch to Specialist',
      description:
        'Routes a high-level user intent to the right specialist agent.',
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
      id: 'lsvz_delegate_agent',
      name: 'Delegate to Specialist Agent',
      description:
        'Hands off a domain-specific or multimodal request (e.g. Civil Drafter Surveyors Eye linework, Boundary Agent deed parsing, Zoning ordinance web research) to the owning specialist agent while keeping results unified in the command bar.',
      inputs: {
        targetAgent: { type: 'string', required: true, description: 'Target AgentType (e.g. CIVIL_DRAFTER, DEED_READER, ZONING_AGENT, CIVIL_PLAN_EXPERT).' },
        query:       { type: 'string', required: true, description: 'The prompt or instruction to send to the specialist agent.' },
        reason:      { type: 'string', description: 'Short explanation of why this specialist agent is handling the request.' },
      },
      outputs: {
        delegated:   { type: 'boolean', required: true },
        targetAgent: { type: 'string', required: true },
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
      type: 'action' as const,
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
    {
      id: 'lsvz_project_locations',
      name: 'List Project Locations',
      description:
        'The shared answer to "where is this project?". Splits the loaded survey points into spatially distinct clusters and returns each cluster with its state, county, municipality, WGS84 centre/bbox, extents, area, point counts, and confidence. Results are cached and published to the Project Knowledge Base under project.location.*. No network access is required after the first lookup.',
      inputs: {
        refresh: { type: 'boolean', description: 'Re-run the jurisdiction lookup instead of using cached results.' },
      },
      outputs: {
        clusters: {
          type: 'array',
          items: { type: 'object' },
          required: true,
          description: 'One entry per cluster: index, pointCount, label, jurisdiction {state,county,place,label,source}, centerLatitude/Longitude, bboxWgs84, width, height, areaAcres, confidence.',
        },
        clusterCount:  { type: 'integer', required: true },
        totalPoints:   { type: 'integer', required: true },
        epsg:          { type: 'integer' },
        linkageDistance: { type: 'number', description: 'Point gap (project units) used to separate clusters.' },
        summary:       { type: 'string', required: true },
        warnings:      { type: 'array', items: { type: 'string' } },
      },
      examples: [
        'Boundary Agent needs the county before choosing a tax-parcel fabric → lsvz_project_locations.',
        'User: "where is this project?" → each point cluster answered with state, county, and municipality.',
        'User uploaded two disconnected point sets → two clusters are returned separately.',
      ],
    },
    {
      id: 'lsvz_locate_project',
      name: 'Locate a Project Cluster',
      description:
        'Returns the jurisdiction for one project cluster (or the cluster containing a given point / nearest a coordinate). Use this when another agent needs a single definitive "what state/county/municipality is this in?" answer.',
      inputs: {
        clusterIndex: { type: 'integer', description: '1-based cluster index from lsvz_project_locations.' },
        pointNumber:  { type: 'string', description: 'Optional project point number; its cluster is located.' },
        latitude:     { type: 'number', description: 'Optional WGS84 latitude; the nearest cluster is located.' },
        longitude:    { type: 'number', description: 'Optional WGS84 longitude; the nearest cluster is located.' },
        refresh:      { type: 'boolean' },
      },
      outputs: {
        found:        { type: 'boolean', required: true },
        clusterIndex: { type: 'integer' },
        state:        { type: 'string' },
        county:       { type: 'string' },
        municipality: { type: 'string' },
        label:        { type: 'string' },
        source:       { type: 'string', description: 'census-geocoder | nominatim | projection | unavailable.' },
        centerLatitude:  { type: 'number' },
        centerLongitude: { type: 'number' },
        bboxWgs84:    { type: 'array', items: { type: 'number' } },
        message:      { type: 'string', required: true },
      },
    },
    {
      id: 'lsvz_fetch_cluster_data',
      name: 'Fetch County / Flood / Soils for a Cluster or Inclusion Area',
      type: 'action' as const,
      description:
        'Fetches public GIS data and renders it on the canvas: county tax-parcel linework (auto-picks the county fabric from the resolved jurisdiction, then statewide, then a nearby ArcGIS layer), FEMA NFHL flood zones, or USDA SSURGO soils. Query one project cluster by default, or set aoi:"inclusion" to use the drawn inclusion boundary as the extent.',
      inputs: {
        layer:        { type: 'string', enum: ['parcels', 'flood', 'soils'], required: true },
        clusterIndex: { type: 'integer', description: '1-based cluster index; defaults to the only cluster.' },
        aoi:          { type: 'string', enum: ['cluster', 'inclusion'], description: 'Query area. inclusion uses the active/drawn inclusion polygon instead of a cluster footprint.' },
        refresh:      { type: 'boolean', description: 'Re-resolve the jurisdiction before fetching.' },
      },
      outputs: {
        fetched:      { type: 'boolean', required: true },
        layer:        { type: 'string', required: true },
        clusterIndex: { type: 'integer' },
        aoi:          { type: 'string' },
        jurisdiction: { type: 'string' },
        featureCount: { type: 'integer' },
        message:      { type: 'string', required: true },
      },
      examples: [
        'User uploaded points and asked for "county GIS tax lines" → lsvz_fetch_cluster_data({layer:"parcels"}).',
        'User asked for flood lines on the second site → lsvz_fetch_cluster_data({layer:"flood", clusterIndex:2}).',
        'User asked for soils over the inclusion area → lsvz_fetch_cluster_data({layer:"soils", aoi:"inclusion"}).',
      ],
    },
    {
      id: 'lsvz_get_projection',
      name: 'Get Project Projection',
      type: 'query' as const,
      description:
        'Returns the active project CRS plus the State Plane zone recommended by the georeferenced point clusters. Use before GIS reprojection or when a user asks what projection the project should use.',
      inputs: {
        refresh: { type: 'boolean', description: 'Re-resolve cluster jurisdiction before recommending.' },
      },
      outputs: {
        currentEpsg:      { type: 'integer' },
        currentState:     { type: 'string' },
        currentZoneName:  { type: 'string' },
        recommendedEpsg:  { type: 'integer' },
        recommendedState: { type: 'string' },
        recommendedZoneName: { type: 'string' },
        clusterIndex:     { type: 'integer' },
        latitude:         { type: 'number' },
        longitude:        { type: 'number' },
        source:           { type: 'string' },
        jurisdiction:     { type: 'string' },
        message:          { type: 'string', required: true },
      },
      examples: [
        'User asks "what projection should I use?" → lsvz_get_projection({}).',
        'A GIS agent needs the current CRS → lsvz_get_projection({}).',
      ],
    },
    {
      id: 'lsvz_set_projection',
      name: 'Set Project Projection',
      type: 'action' as const,
      description:
        'Sets the project CRS. Pass epsg for an explicit State Plane or worldwide EPSG code, use useGps to derive it from the device fix, or omit both to apply the projection recommended by the point clusters. Use dryRun to preview without changing the project.',
      inputs: {
        epsg:   { type: 'integer', description: 'State Plane or worldwide EPSG code. Omit to use the point-cluster recommendation.' },
        useGps: { type: 'boolean', description: 'Derive the CRS from the device GPS fix instead of the point clusters.' },
        dryRun: { type: 'boolean', description: 'Preview the resolved projection without applying it.' },
      },
      outputs: {
        applied:      { type: 'boolean', required: true },
        epsg:         { type: 'integer' },
        previousEpsg: { type: 'integer' },
        state:        { type: 'string' },
        zoneName:     { type: 'string' },
        message:      { type: 'string', required: true },
      },
      examples: [
        'User: "set my projection from the point cluster" → lsvz_set_projection({}).',
        'User: "use Ohio South" → lsvz_set_projection({epsg:27043}).',
        'User: "set the projection from my GPS location" → lsvz_set_projection({useGps:true}).',
      ],
    },
    {
      id: 'lsvz_open_projection',
      name: 'Open Projection Controls',
      type: 'action' as const,
      description:
        'Opens the A2UI Settings → Coordinate System surface, optionally applying the point-cluster recommendation first. This is the same projection control surface the user sees in chat and the tool shelf.',
      inputs: {
        applyRecommended: { type: 'boolean', description: 'Apply the point-cluster recommendation before opening.' },
        dock:            { type: 'boolean', description: 'Dock into the agent tool shelf. Default true.' },
      },
      outputs: {
        opened:       { type: 'boolean', required: true },
        docked:       { type: 'boolean', required: true },
        appliedEpsg:  { type: 'integer' },
        currentEpsg:  { type: 'integer' },
      },
      examples: [
        'User: "open projection settings" → lsvz_open_projection({}).',
      ],
    },
    {
      id: 'lsvz_open_project_locations',
      name: 'Open Project Location Panel',
      type: 'action' as const,
      description:
        'Opens the LSAI Project Location tool shelf panel, showing every point cluster with its state, county, municipality, footprint, and one-click county tax line / flood / soils actions.',
      inputs: {
        clusterIndex: { type: 'integer', description: 'Optional cluster to bring into focus.' },
        dock:         { type: 'boolean', description: 'Dock into the agent tool shelf. Default true.' },
      },
      outputs: {
        opened:       { type: 'boolean', required: true },
        clusterCount: { type: 'integer', required: true },
        docked:       { type: 'boolean', required: true },
      },
    },
    {
      id: 'open_spreadsheet',
      name: 'Open A2UI Spreadsheet',
      type: 'action' as const,
      description:
        'Opens the shared lightweight A2UI spreadsheet with agent-supplied columns and rows. Use it for point lists, comparison tables, cut sheets, and any tabular answer instead of dumping rows into chat text.',
      inputs: {
        title:       { type: 'string', description: 'Spreadsheet title shown in the A2UI header.' },
        description: { type: 'string', description: 'Optional subtitle or data provenance.' },
        fileName:    { type: 'string', description: 'CSV download filename.' },
        columns: {
          type: 'array',
          required: true,
          description:
            'Column keys (strings) or objects: {key, label, width?, align?: "left"|"center"|"right"}.',
        },
        rows: {
          type: 'array',
          description:
            'Row objects keyed by column key, or arrays in column order. Missing cells render blank.',
        },
        editable: { type: 'boolean', description: 'Allow local cell edits and row add/delete. Default true.' },
        pageSize: { type: 'integer', description: 'Rows per page (10-1000). Default 100.' },
      },
      outputs: {
        opened:      { type: 'boolean', required: true },
        rowCount:    { type: 'integer', required: true },
        columnCount: { type: 'integer', required: true },
      },
      examples: [
        'Point Editor lists points → open_spreadsheet({title:"Project Points", columns:["Point #","Northing","Easting"], rows:[...]})',
        'Soils Agent compares map units → open_spreadsheet({columns:[{key:"symbol",label:"Map unit"},{key:"acres",label:"Acres",align:"right"}], rows:[...]})',
      ],
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
      type: 'action' as const,
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
    ...SHEET_VIEW_SKILLS,
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
      type: 'action' as const,
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
      type: 'action' as const,
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
      id: 'cad_set_layer_properties',
      name: 'Set Layer Properties',
      type: 'action' as const,
      description:
        "Updates a layer's color and/or linetype in the loaded CAD standard, creating the layer " +
        'definition when it does not exist yet. Optionally makes that layer the active manual drawing layer. ' +
        'Color accepts an AutoCAD color name ("red", "cyan") or a #RRGGBB hex value; lineType accepts an ' +
        'AutoCAD linetype name ("CONTINUOUS", "DASHED", "HIDDEN", …). Use this for direct layer commands from ' +
        'chat, the Voice Agent, or any peer that needs to restyle an existing layer.',
      inputs: {
        layer: {
          type: 'string',
          required: true,
          description: 'Layer name to update (e.g. "L-ROAD-CNTR").',
        },
        color: {
          type: 'string',
          description: 'New layer color: color name ("red") or #RRGGBB hex.',
        },
        lineType: {
          type: 'string',
          description: 'New layer linetype name (e.g. "DASHED", "HIDDEN").',
        },
        makeActive: {
          type: 'boolean',
          default: false,
          description: 'When true, also make this the active manual drawing layer.',
        },
      },
      outputs: {
        layer: { type: 'string', required: true, description: 'Canonical layer name that was updated.' },
        color: { type: 'string', description: 'Applied #RRGGBB color, or null when unchanged.' },
        lineType: { type: 'string', description: 'Applied linetype, or null when unchanged.' },
        active: { type: 'boolean', description: 'True when the layer was made active.' },
      },
      examples: [
        'Chat command: “set layer L-ROAD-CNTR to red dashed” → cad_set_layer_properties({ layer:"L-ROAD-CNTR", color:"red", lineType:"DASHED" }).',
        'Voice Agent: cad_set_layer_properties({ layer:"L-BUILDING", color:"cyan", makeActive:true }).',
      ],
    },
    {
      id: 'cad_ensure_default_layers',
      name: 'Ensure Default Boundary Layers',
      type: 'action' as const,
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
    {
      id: 'cad_resolve_hatch',
      name: 'Resolve Hatch Pattern for Code, Feature, or Flood Zone',
      description:
        'Resolves the best DWG/DXF-compatible HatchDefinition (.PAT pattern), recommended CAD layer, ' +
        'scale, and angle for any field code, material/feature description (e.g., "BLDG", "concrete", ' +
        '"asphalt", "wetland", "riprap"), or FEMA flood zone ("AE", "V", "FLOODWAY").',
      inputs: {
        query: {
          type: 'string',
          required: true,
          description: 'Code, feature type, material keyword, pattern name, or FEMA flood zone.',
        },
      },
      outputs: {
        patternName:      { type: 'string', required: true, description: 'Resolved .PAT identifier (e.g. "ANSI31", "AR-CONC", "FEMA-AE").' },
        description:      { type: 'string', required: true },
        category:         { type: 'string', required: true },
        recommendedLayer: { type: 'string', required: true },
        recommendedScale: { type: 'number', required: true },
        recommendedAngle: { type: 'number', required: true },
        source:           { type: 'string', required: true },
        confidence:       { type: 'number', required: true },
      },
      examples: [
        'Civil Drafter resolves hatch for "CONC" → patternName="AR-CONC", recommendedLayer="V-SITE-PAVE".',
        'Flood Agent resolves hatch for "Zone AE" → patternName="FEMA-AE", recommendedLayer="V-FEMA-HTCH".',
      ],
    },
    {
      id: 'cad_list_hatches',
      name: 'List Available Hatch Patterns & Active Canvas Hatches',
      description:
        'Returns all available built-in (ACAD/ISO, survey, environmental, FEMA) and custom (.PAT) hatch ' +
        'patterns in the loaded standard, along with all active CanvasHatch regions placed on the drawing canvas.',
      inputs: {
        category: {
          type: 'string',
          enum: ['all', 'standard', 'environmental', 'fema', 'custom'],
          default: 'all',
          description: 'Optional category filter.',
        },
      },
      outputs: {
        patterns:      { type: 'array', items: { type: 'object' }, required: true },
        canvasHatches: { type: 'array', items: { type: 'object' }, required: true },
        contextTable:  { type: 'string', required: true },
      },
    },
    {
      id: 'cad_author_hatch_pattern',
      name: 'Author or Update Custom Hatch Pattern (.PAT)',
      type: 'action' as const,
      description:
        'Creates or updates a custom DXF/AutoCAD .PAT HatchDefinition in the loaded CAD standard (persisted in .lsvz), ' +
        'and optionally binds it as the default hatchPattern on a master CodeDefinition.',
      inputs: {
        name:        { type: 'string', required: true, description: 'Unique ASCII pattern identifier (e.g. "CUST_PAVER").' },
        description: { type: 'string', description: 'Human-readable description.' },
        lines:       { type: 'array', items: { type: 'object' }, description: 'Array of { angle, originX, originY, deltaX, deltaY, dashes? } PAT line families.' },
        assignToCode:{ type: 'string', description: 'Optional master code (e.g. "BLDG", "CONC") to assign this hatch pattern to.' },
      },
      outputs: {
        patternName: { type: 'string', required: true },
        assignedCode:{ type: 'string' },
        totalCustom: { type: 'integer', required: true },
      },
    },
    {
      id: 'cad_apply_hatch',
      name: 'Apply Hatch Fill to Canvas Region or Entities',
      type: 'action' as const,
      description:
        'Creates a first-class CanvasHatch entity on the 2D drawing canvas. Can target: ' +
        '(1) an interior point { easting, northing } via the planar loop + island tracer, ' +
        '(2) specific closed line/polyline IDs (`lineIds`), ' +
        '(3) a `boundaryFileId` parcel, ' +
        '(4) all closed loops on a given CAD `targetLayer`, or ' +
        '(5) explicit polygon `vertices`.',
      inputs: {
        patternName:    { type: 'string', description: 'Hatch pattern name (e.g. "ANSI31", "AR-CONC", "SOLID") or feature keyword to auto-resolve.' },
        seedPoint:      { type: 'object', description: 'Interior world point { easting, northing } for Click-in-Area planar boundary + island tracing.' },
        lineIds:        { type: 'array', items: { type: 'string' }, description: 'IDs of closed polylines, circles, or chained SurveyLines to hatch.' },
        boundaryFileId: { type: 'string', description: 'ID of a BoundaryFile parcel to hatch.' },
        targetLayer:    { type: 'string', description: 'Hatch all closed loops found on this CAD layer.' },
        vertices:       { type: 'array', items: { type: 'object' }, description: 'Explicit closed polygon vertices [{ x, y } or { easting, northing }].' },
        scale:          { type: 'number', default: 1, description: 'Pattern scale multiplier.' },
        angleDeg:       { type: 'number', default: 0, description: 'Pattern rotation angle in degrees.' },
        opacity:        { type: 'number', default: 0.45, description: 'Fill opacity (0.05–1.0).' },
        color:          { type: 'string', description: 'Optional CSS hex color override.' },
        layer:          { type: 'string', description: 'Destination CAD layer for the hatch entity.' },
      },
      outputs: {
        hatchId:     { type: 'string', required: true },
        patternName: { type: 'string', required: true },
        layer:       { type: 'string', required: true },
        areaSqFt:    { type: 'number', required: true },
        holeCount:   { type: 'integer', required: true },
      },
    },
    {
      id: 'cad_modify_hatch',
      name: 'Modify or Delete Canvas Hatch Entity',
      type: 'action' as const,
      description:
        'Updates patternName, scale, angleDeg, color, opacity, layer, visibility, or deletes one or all CanvasHatch entities.',
      inputs: {
        hatchId:     { type: 'string', description: 'Target CanvasHatch id (or "all" / "last").' },
        action:      { type: 'string', enum: ['update', 'delete', 'clear-all'], default: 'update' },
        patternName: { type: 'string' },
        scale:       { type: 'number' },
        angleDeg:    { type: 'number' },
        opacity:     { type: 'number' },
        color:       { type: 'string' },
        layer:       { type: 'string' },
        hidden:      { type: 'boolean' },
      },
      outputs: {
        modifiedCount: { type: 'integer', required: true },
      },
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
  version: '1.0.0',
  skills: [
    {
      id: 'generate_contours',
      name: 'Generate Survey Point Contours',
      type: 'action' as const,
      description:
        'Prepares a survey-point contour job, stages the requested settings, and opens the Contour Generation controls for review. It does not draw automatically; the user presses Generate Contours after reviewing.',
      inputs: {
        contourInterval: { type: 'number', description: 'Vertical interval between minor contour lines (default uses current contourSettings).' },
        majorInterval:   { type: 'number', description: 'Vertical interval for major/index contours.' },
        smoothing:       { type: 'integer', description: 'Optional smoothing level from 0-4.' },
        showLabels:      { type: 'boolean', description: 'Whether major contours should receive labels.' },
        labelDensity:    { type: 'number', description: 'Optional label density multiplier.' },
        pointFilterDescription: { type: 'string', description: 'Optional description substring used to select survey points.' },
        excludeInvertPoints: { type: 'boolean', description: 'Drop INV/SAN.INV/STORM INV shots before triangulation. Defaults to true.' },
        excludeFfePoints: { type: 'boolean', description: 'Drop FFE/finished-floor shots before triangulation. Defaults to true.' },
        excludeStructureShots: { type: 'boolean', description: 'Drop rim, MH, CB and top-of-structure shots before triangulation. Defaults to true.' },
        inclusionMode: {
          type: 'string',
          enum: ['inside', 'outside'],
          description: 'Generate contours inside or outside the active inclusion boundary. Defaults to inside.',
        },
      },
      outputs: {
        staged:       { type: 'boolean' },
        generationId: { type: 'string' },
        pathCount:    { type: 'integer' },
        lineCount:    { type: 'integer' },
      },
      examples: [
        'Generate 1ft contours with 5ft index contours from current survey points',
        'Review contour settings before generating',
      ],
    },
    {
      id: 'generate_loaded_tin_contours',
      name: 'Generate Loaded TIN Contours',
      type: 'action' as const,
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
        staged: { type: 'boolean', description: 'True when settings were staged for review instead of generating.' },
        count: { type: 'integer', description: 'Number of contour path segments generated.' },
        sourceTinId: { type: 'string', description: 'TIN surface id used for the generation.' },
      },
      examples: [
        'Generate 1ft contours from the loaded .tin surface with 5ft major contours',
        'Create 2-foot index contours from tin-import-123 with labels turned off',
      ],
    },
    {
      id: 'create_tin_from_contours',
      name: 'Create TIN from Contours',
      type: 'action' as const,
      description:
        'Builds a TIN surface from the contour vertices of a contour generation and saves it to the session and File Manager. ' +
        'Use this when the user asks to create, build, or save a surface from existing contours.',
      inputs: {
        generationId: {
          type: 'string',
          description: 'Optional contour generation id. Defaults to the most recent generation.',
        },
        name: { type: 'string', description: 'Optional surface name.' },
      },
      outputs: {
        tinId: { type: 'string', required: true, description: 'Created TIN surface id.' },
        name: { type: 'string', required: true },
        vertexCount: { type: 'integer', required: true },
        triangleCount: { type: 'integer', required: true },
        fileName: { type: 'string', description: 'Native .tin file saved to File Manager.' },
      },
      examples: [
        'Create a TIN from the latest contours',
        'Build and save a surface from contour generation gen-123',
      ],
    },
    {
      id: 'import_tin_surface',
      name: 'Import TIN Surface',
      type: 'action' as const,
      description:
        'Imports a .tin, .xml, or .landxml surface payload into the session. The caller supplies the file content and name; ' +
        'the host parses it, registers the surface, and saves the source file to File Manager.',
      inputs: {
        content: { type: 'string', required: true, description: 'Raw file content (text LandXML/.tin) or base64 in fileData.' },
        name: { type: 'string', required: true, description: 'File name including extension (.tin/.xml/.landxml).' },
        fileData: { type: 'string', description: 'Optional base64 bytes for binary Carlson .tin files.' },
      },
      outputs: {
        tinId: { type: 'string', required: true },
        name: { type: 'string', required: true },
        vertexCount: { type: 'integer', required: true },
        triangleCount: { type: 'integer', required: true },
      },
      examples: ['Import this LandXML surface into the project'],
    },
    {
      id: 'export_tin_surface',
      name: 'Export TIN Surface',
      type: 'action' as const,
      description:
        'Exports a loaded TIN surface as LandXML or native .tin. The file is saved to File Manager and a browser download is triggered.',
      inputs: {
        sourceTinId: { type: 'string', description: 'Optional TIN surface id. Defaults to the most recent loaded surface.' },
        format: {
          type: 'string',
          enum: ['landxml', 'native'],
          default: 'landxml',
          description: 'landxml (.xml) or native text (.tin).',
        },
      },
      outputs: {
        fileName: { type: 'string', required: true },
        format: { type: 'string', required: true },
        vertexCount: { type: 'integer', required: true },
        triangleCount: { type: 'integer', required: true },
      },
      examples: ['Export the loaded TIN as LandXML', 'Save the surface as a .tin file'],
    },
    {
      id: 'set_tin_surface_display',
      name: 'Draw TIN Surface',
      type: 'action' as const,
      description:
        'Draws or hides a loaded TIN surface on the canvas and chooses wireframe or shaded display. ' +
        'Use this for "draw the surface", "draw the mesh", "show the TIN shaded", "wireframe the surface", or "hide the surface".',
      inputs: {
        sourceTinId: {
          type: 'string',
          description: 'Optional loaded TIN surface id. Defaults to the most recent surface.',
        },
        displayMode: {
          type: 'string',
          enum: ['wireframe', 'shaded', 'hidden'],
          default: 'shaded',
          description: 'wireframe = triangle edges, shaded = elevation fill, hidden = remove from canvas.',
        },
        zoomTo: {
          type: 'boolean',
          description: 'When true, switch to the canvas and zoom to the surface. Defaults to true.',
        },
      },
      outputs: {
        tinId: { type: 'string', required: true },
        displayMode: { type: 'string', required: true },
        drawn: { type: 'boolean', required: true },
      },
      examples: ['Draw the surface shaded', 'Show the TIN as a wireframe', 'Hide the Survey Points TIN'],
    },
    {
      id: 'open_tin_surfaces',
      name: 'Open TIN Surfaces Surface',
      type: 'action' as const,
      description:
        'Opens the A2UI TIN Surfaces workspace surface so the user can import, create, and export surfaces from any agent chat.',
      inputs: {},
      outputs: { opened: { type: 'boolean', required: true } },
      examples: ['Open TIN surfaces', 'Show the surface manager'],
    },
    {
      id: 'fetch_esri_rest_contours',
      name: 'Fetch ESRI REST Contours',
      type: 'action' as const,
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
            'Base URL of the ESRI REST Feature Service or Map Service layer chosen by the user ' +
            '(e.g. https://services.pasda.psu.edu/arcgis/rest/services/PAMAP_Contour_Mosaic_South/MapServer/0). ' +
            'Never omit it or pick a provider on the user\'s behalf. Ask which source they want first.',
        },
        mode: {
          type: 'string',
          enum: ['project', 'inclusion', 'description'],
          description:
            'Area of interest. "project" uses the loaded survey points, ' +
            '"inclusion" uses the active inclusion boundary, and "description" geocodes descriptionText.',
        },
        inclusionScope: {
          type: 'string',
          enum: ['inside', 'outside'],
          description:
            'Required when mode="inclusion": keep only contour geometry inside or outside the ' +
            'inclusion boundary. Ask the user which they want; never assume.',
        },
        descriptionText: {
          type: 'string',
          description: 'Required when mode="description". Free-text place name or address.',
        },
        bbox: {
          type: 'object',
          description:
            'Optional bounding box { xmin, ymin, xmax, ymax } in the service spatial reference. ' +
            'When omitted the agent uses the mode-selected project extent or inclusion boundary.',
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
        featureCount: {
          type: 'integer',
          description: 'Number of contour features returned by the service.',
        },
        count: {
          type: 'integer',
          description: 'Number of contour segments added to the drawing.',
        },
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
  version: '1.0.0',
  skills: [
    {
      id: 'run_steep_slope_analysis',
      name: 'Run Steep Slope Analysis',
      type: 'action' as const,
      description:
        'Analyzes a TIN surface by slope-percent bands, groups connected steep triangles, and filters out ' +
        'components whose elevation span is below a minimum threshold.',
      inputs: {
        tinId: {
          type: 'string',
          description: 'Session TIN surface id to analyze. Defaults to the active survey points TIN when omitted.',
        },
        minComponentVerticalSpan: {
          type: 'number',
          description: 'Minimum vertical span (project units) for a connected steep component to be kept (default 6).',
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
      type: 'action' as const,
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
      name: 'Fetch FEMA NFHL Flood Map',
      type: 'action' as const,
      description:
        'Fetches the complete FEMA National Flood Hazard Layer (NFHL) map for a project area, not ' +
        'just flood-zone rings: flood-hazard polygons and floodway (FEMA-FLOOD-<ZONE>), Base Flood ' +
        'Elevation lines (FEMA-BFE), cross-sections, FIRM panels, political jurisdictions, LOMRs, ' +
        'LOMAs, water lines/areas, levees, structures, dunes, LiMWA, profile baselines, flood ' +
        'boundaries and the remaining NFHL map layers. Every layer lands on its own ' +
        'FEMA-NFHL-* CAD layer with labels where FEMA publishes a name/number. includeAllLayers ' +
        'defaults to true; includeBfe defaults to true. The result also returns the FIRM panel ' +
        'numbers/effective dates, community CIDs, cross-section WSELs, LOMR/LOMA cases and a ' +
        'per-layer feature inventory for reports. The area is specified by drawn inclusion ' +
        'polygon (mode=\'inclusion\') or free-text description geocoded via Nominatim ' +
        '(mode=\'description\'). Reprojects WGS84 → project EPSG client-side.',
      inputs: {
        includeBfe: {
          type: 'boolean',
          description:
            'Also fetch FEMA Base Flood Elevation lines (NFHL layer 16) onto layer ' +
            'FEMA-BFE. Default true. Set false when the user only wants zone rings ' +
            'or the BFE service is unavailable.',
        },
        includeAllLayers: {
          type: 'boolean',
          description:
            'Fetch the complete NFHL map stack (FIRM panels, cross-sections, political ' +
            'jurisdictions, LOMRs/LOMAs, water, levees, structures and all remaining ' +
            'map layers). Default true. Set false for a fast zone/BFE-only fetch.',
        },
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
        bfeCount:      { type: 'integer', description: 'Number of FEMA Base Flood Elevation line features added.' },
        bfeDatum:      { type: 'string', description: 'Vertical datum reported by FEMA for the BFE lines (e.g. NAVD88), when available.' },
        layers:        { type: 'array', items: { type: 'string' }, description: 'CAD layer names created (FEMA-FLOOD-AE, FEMA-FLOOD-X, FEMA-BFE, FEMA-NFHL-*).' },
        nfhlLayerCount: { type: 'integer', description: 'Number of NFHL layers queried/returned in the full map stack.' },
        firmPanels:    { type: 'array', items: { type: 'object' }, description: 'FIRM panel numbers with effective dates and scales.' },
        jurisdictions: { type: 'array', items: { type: 'object' }, description: 'Political jurisdictions with community numbers and CIDs.' },
        crossSections: { type: 'integer', description: 'Number of FEMA cross-sections returned.' },
        lomrs:         { type: 'integer', description: 'Number of LOMR case polygons returned.' },
        lomas:         { type: 'integer', description: 'Number of LOMA determinations returned.' },
        truncated:     { type: 'boolean', description: 'True if FEMA NFHL hit the transfer limit and only a partial set came back.' },
      },
      examples: [
        'Civil Drafter is laying out a site plan and needs the AE / X floodplain rings — calls fetch_flood_zones with mode=\'inclusion\' to use the project boundary already on the canvas.',
        'Boundary Agent is drafting a metes-and-bounds and the legal references "FEMA Zone AE per FIRM panel" — calls fetch_flood_zones with mode=\'description\' for the parcel address to pull the actual regulatory rings.',
        'Civil Plan Expert needs flood-hazard overlay for a stormwater report — calls fetch_flood_zones to render the floodway and 100-year polygons as their own visibility-controllable CAD layers.',
        'User asks for a flood exhibit — the Flood Agent asks whether to include BFE lines and zone callouts, then offers to write a flood-zone report or add the notes block to the paperspace plan sheet.',
      ],
    },
    {
      id: 'clear_flood_zones',
      name: 'Clear FEMA Flood Linework',
      type: 'action' as const,
      description:
        'Removes every SurveyLine whose layer starts with "FEMA-FLOOD-" or "FEMA-BFE" from ' +
        'the canvas, plus the associated flood hatches and zone callouts. Use before ' +
        're-fetching a different area, or to hide the flood overlay without touching ' +
        'layer visibility.',
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
      type: 'action' as const,
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
          description: 'Array of SSURGO MUKEY strings to retrieve tabular data for. Omit to query all currently loaded soil map units.',
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
      id: 'build_soil_limitations_report',
      name: 'Compile State E&S Soil Limitations Report',
      type: 'action' as const,
      description:
        'Compiles a state E&S-manual soil-limitations report for the loaded SSURGO map units. ' +
        'For Pennsylvania, the Scout obtains and caches Appendix E, Table E.1 (limitations of ' +
        'Pennsylvania soils pertaining to earthmoving projects), matches each soil series to the ' +
        'chart, selects the appropriate resolutions from the E&S limitations/resolutions list, ' +
        'and reports the area of every soil map unit within the active inclusion boundary. ' +
        'Without a boundary it reports areas across the project AOI and includes a boundary advisory.',
      inputs: {
        forceRefresh: {
          type: 'boolean',
          description: 'Re-download and re-parse the state E&S manual instead of using the cached chart.',
        },
      },
      outputs: {
        report: {
          type: 'object',
          description:
            'Compiled report: boundaryPresent, areaLabel, boundaryAcres, soilAcres, units ' +
            '(symbol, name, acres, percent, limitations, resolutions) and unmatched map units.',
        },
        message: { type: 'string', description: 'Human-readable summary of the compiled report.' },
      },
      examples: [
        'Civil Plan Expert is assembling an NPDES E&S plan and calls build_soil_limitations_report to add the Appendix E soil limitations and resolutions narrative with the acreage of each soil within the project boundary.',
        'A reviewer asks whether any project soils are corrosive to concrete or prone to sinkholes. The Soils Agent compiles the PA Table E.1 report and answers from the matched series.',
        'Civil Drafter calls build_soil_limitations_report before sizing infiltration BMPs so slow-percolation and seasonal-high-water-table resolutions are carried into the plan notes.',
      ],
    },
    {
      id: 'clear_soils',
      name: 'Clear Soil Linework',
      type: 'action' as const,
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
// ---------------------------------------------------------------------------
// Stormwater Agent — preliminary runoff (Rational Method) and time of concentration
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.STORMWATER_AGENT,
  displayName: 'Stormwater Agent',
  cacpEnabled: true,
  version: '0.1.0',
  skills: [...STORMWATER_SKILLS],
});

// ---------------------------------------------------------------------------
// Dirt Volume Agent — earthwork quantities, scenario comparison, and reports
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.DIRT_VOLUME_AGENT,
  displayName: 'Dirt Volume Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [...DIRT_VOLUME_SKILLS],
});

// ---------------------------------------------------------------------------
// Redline Agent — annotated PDF intake, worklist, and Civil Drafter coordination
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.REDLINE_AGENT,
  displayName: 'Redline Agent',
  cacpEnabled: true,
  version: '0.1.0',
  skills: [...REDLINE_SKILLS],
});

// ---------------------------------------------------------------------------
// Profile & Cross Section Agent — elevation profiles / cross sections
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.PROFILE_AGENT,
  displayName: 'Profile & Cross Section',
  cacpEnabled: true,
  version: '1.1.0',
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
    {
      id: 'road_object_extract',
      name: 'Extract Road Object Profiles & Sections',
      type: 'action' as const,
      description:
        'Computes the existing-ground profile along the true alignment path, the grade-derived design profile, and one cross-section set at interval + critical stations for a linked RoadObject.',
      inputs: {
        roadObjectId: { type: 'string', required: true },
        reason: { type: 'string', description: 'Why extraction was requested (corridor-design, live-input-change, manual-refresh).' },
      },
      outputs: {
        status: { type: 'string', required: true },
        existingProfileId: { type: 'string' },
        designProfileId: { type: 'string' },
        sectionSetId: { type: 'string' },
        existingSampleCount: { type: 'integer' },
        sectionStationCount: { type: 'integer' },
        missing: { type: 'array', items: { type: 'object' } },
      },
      examples: ['Roading asks Profile to extract road object roadobj-cl-1 after a corridor design or baseline edit.'],
    },
    {
      id: 'road_object_resolve_missing_data',
      name: 'Resolve Road Object Missing Data',
      type: 'action' as const,
      description:
        'Commits a missing-elevation decision for a RoadObject: keep gaps, extrapolate nearest, or cancel.',
      inputs: {
        roadObjectId: { type: 'string', required: true },
        previewId: { type: 'string' },
        decision: { type: 'string', required: true, enum: ['gaps', 'extrapolate', 'cancel'] },
      },
      outputs: {
        status: { type: 'string', required: true },
        roadObjectId: { type: 'string', required: true },
        decision: { type: 'string' },
      },
    },
    {
      id: 'road_profile_show',
      name: 'Show Road Profile',
      type: 'action' as const,
      description:
        'Projects a linked RoadObject existing or design profile into the classic Profile view for inspection.',
      inputs: {
        roadObjectId: { type: 'string', required: true },
        profileKind: { type: 'string', enum: ['existing', 'design'], default: 'existing' },
      },
      outputs: {
        roadObjectId: { type: 'string', required: true },
        profileKind: { type: 'string', required: true },
        sampleCount: { type: 'integer', required: true },
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
      type: 'action' as const,
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
      type: 'action' as const,
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
      type: 'action' as const,
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
      type: 'action' as const,
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
      type: 'action' as const,
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

// ---------------------------------------------------------------------------
// Additional Survey & Geospatial Agents — CACP-enabled for peer delegation
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.RAW_CRAWLER,
  displayName: 'RAW Crawler',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'raw_get_summary',
      name: 'Get RAW File Summary',
      description: 'Returns metadata and summary statistics for the currently loaded surveyor .raw observation file.',
      inputs: {},
      outputs: {
        loaded:     { type: 'boolean', required: true },
        fileName:   { type: 'string' },
        lineCount:  { type: 'integer' },
        pointCount: { type: 'integer' },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.GIS_AGENT,
  displayName: 'GIS Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'resolve_gis_service',
      name: 'Resolve Live GIS Service',
      type: 'action' as const,
      description:
        'Finds and verifies live public ArcGIS REST layers for the project footprint when the ' +
        'registered/primary source returns no geometry. Automatically uses PASDA in Pennsylvania, ' +
        'then ArcGIS Online, state GIS hubs, county portals, and the LandSurv Scout browser. ' +
        'Returns only endpoints that answer a feature-count query for the AOI (or clearly marks ' +
        'unverified candidates), so an agent can retry the fetch instead of telling the user no data exists.',
      inputs: {
        kind: {
          type: 'string',
          enum: ['contours', 'parcels', 'flood', 'soils', 'custom'],
          required: true,
          description: 'Layer type to resolve.',
        },
        mode: {
          type: 'string',
          enum: ['project', 'inclusion', 'description'],
          description: 'Area of interest. Defaults to the project extent.',
        },
        descriptionText: {
          type: 'string',
          description: 'Place name or address when mode="description".',
        },
        query: {
          type: 'string',
          description: 'Free-form topic for kind="custom" (county lines, school districts, streams, water bodies, etc.).',
        },
        bbox: {
          type: 'object',
          description: 'Optional explicit WGS84 bbox { xmin, ymin, xmax, ymax } (or [w,s,e,n]).',
        },
      },
      outputs: {
        services: {
          type: 'array',
          items: { type: 'object' },
          required: true,
          description: 'Ranked { name, url, provider, geometryType, featureCount, verified, notes } entries.',
        },
        count: { type: 'integer', required: true },
        verifiedCount: { type: 'integer', required: true },
        pasdaAvailable: { type: 'boolean' },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      examples: [
        'No contours came back for my Wayne County project — find a live source',
        'Resolve the county tax-parcel REST endpoint for this footprint',
        'Show county lines for this footprint',
        'Find school district or voting district layers near the site',
        'Find verified streams and water-body layers',
        'Show the watershed or drainage basin for this footprint',
      ],
    },
    {
      id: 'gis_show_live_layer',
      name: 'Show Live GIS Layer',
      type: 'action' as const,
      description:
        'Resolves and draws ANY public GIS topic on the project canvas — not a fixed menu. ' +
        'Use it for county lines, State Plane / SPC zones, school districts, voting precincts, ' +
        'streams, water bodies, municipal boundaries, tax districts, or any other live layer. ' +
        'The host resolves the AOI, searches PASDA/ArcGIS Online and LandSurv Scout, queries the ' +
        'best verified layer for the project footprint, projects it into the project CRS, and ' +
        'adds the linework to its own CAD layer.',
      inputs: {
        topic: {
          type: 'string',
          required: true,
          description: 'The user\'s GIS topic in their own words, e.g. "school district lines" or "streams and water bodies".',
        },
        serviceUrl: {
          type: 'string',
          description: 'Optional known ArcGIS layer URL. Omit to discover it automatically.',
        },
        label: { type: 'string', description: 'Optional display label / CAD layer topic.' },
        mode: {
          type: 'string',
          enum: ['project', 'inclusion', 'description'],
          description: 'Area of interest. Defaults to the project extent.',
        },
        descriptionText: {
          type: 'string',
          description: 'Place name or address when mode="description".',
        },
        bbox: {
          type: 'object',
          description: 'Optional explicit WGS84 bbox { xmin, ymin, xmax, ymax } (or [w,s,e,n]).',
        },
        maxFeatures: {
          type: 'integer',
          description: 'Maximum features to query for the AOI (default 4000).',
        },
      },
      outputs: {
        ok:           { type: 'boolean', required: true },
        topic:        { type: 'string', required: true },
        label:        { type: 'string', required: true },
        layerName:    { type: 'string', required: true },
        featureCount: { type: 'integer', required: true },
        segmentCount: { type: 'integer', required: true },
        sourceUrl:    { type: 'string' },
        provider:     { type: 'string' },
        names:        { type: 'array', items: { type: 'string' } },
        message:      { type: 'string', required: true },
      },
      examples: [
        'User: "Show me county lines" → gis_show_live_layer({topic:"county lines"}).',
        'User: "Draw the State Plane zones" → gis_show_live_layer({topic:"State Plane / SPC zones"}).',
        'User: "Show school district lines" → gis_show_live_layer({topic:"school district lines"}).',
        'User: "Show voting districts" → gis_show_live_layer({topic:"voting districts"}).',
        'User: "Draw streams and water bodies" → gis_show_live_layer({topic:"streams and water bodies"}).',
      ],
    },
    {
      id: 'gis_get_features_summary',
      name: 'Get Loaded GIS Features Summary',
      description: 'Returns a summary of loaded GeoJSON / shapefile GIS features and active WMS layers in the current session.',
      inputs: {},
      outputs: {
        featureCount:   { type: 'integer', required: true },
        activeWmsCount: { type: 'integer', required: true },
        summary:        { type: 'string',  required: true },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.IMAGE_ANALYZER,
  displayName: 'Image Analyzer',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'image_list_session_photos',
      name: 'List Session Site Photos',
      description: 'Returns the list of site photos uploaded to the session along with their tags and metadata.',
      inputs: {},
      outputs: {
        photos: { type: 'array', items: { type: 'object' }, required: true },
        count:  { type: 'integer', required: true },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.GNSS_AGENT,
  displayName: 'RINEX / GNSS Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'gnss_get_status',
      name: 'Get GNSS / RINEX Session Status',
      description: 'Returns the current RINEX / GNSS post-processing status and active projection EPSG.',
      inputs: {},
      outputs: {
        ready: { type: 'boolean', required: true },
        epsg:  { type: 'integer' },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.DRONE_AGENT,
  displayName: 'Drone Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'drone_get_status',
      name: 'Get Drone Photogrammetry Status',
      description: 'Returns the status of the Drone / UAS photogrammetry and point-cloud workspace.',
      inputs: {},
      outputs: {
        ready: { type: 'boolean', required: true },
      },
    },
  ],
});

agentRegistry.register({
  agent: AgentType.TITLE_SEARCH,
  displayName: 'Title Search Agent',
  cacpEnabled: true,
  version: '1.0.0',
  skills: [
    {
      id: 'title_get_deed_chain',
      name: 'Get Title / Deed Chain Facts',
      description: 'Returns recorded deed metadata and chain-of-title facts from the loaded deed and Project Knowledge Base.',
      inputs: {},
      outputs: {
        deedLoaded: { type: 'boolean', required: true },
        deedName:   { type: 'string' },
        facts:      { type: 'array', items: { type: 'object' }, required: true },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Roading Agent — Road synthesis (Points + Imagery + OSM) & Corridor Design
// Coordinates with CENTERLINE_STATIONING, PROFILE_AGENT, POINT_EDITOR, CAD_MANAGER
// ---------------------------------------------------------------------------
agentRegistry.register({
  agent: AgentType.ROADING_AGENT,
  displayName: 'Roading Agent',
  cacpEnabled: true,
  version: '1.1.0',
  skills: [
    ...ROADING_SKILLS,
  ],
});


