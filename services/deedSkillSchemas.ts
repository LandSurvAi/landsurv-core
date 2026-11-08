// Deed / Boundary Agent CACP skill schemas.
// Imported by AgentRegistry.ts and registered on AgentType.DEED_READER.
// Handlers live in services/deedSkillHandlers.ts and are wired into App.tsx
// via the useDeedSkillHandlers() hook.
//
// Scope: deed documents and their detected descriptions, per-description
// extraction, boundary files and calls, and every alignment operation the
// Boundary panel exposes (associations, best fit, corner pairing, transforms,
// POB, draft-to-linework).

import type { SkillSchema } from './AgentRegistry';

const fileIdField = {
  type: 'string' as const,
  description: 'Boundary file id or name. Omit to use the active boundary file.',
};

const tractIdField = {
  type: 'string' as const,
  description: 'Deed description / tract id, e.g. "Tract 1" or "Main Parcel".',
};

export const DEED_SKILLS: SkillSchema[] = [
  // ── Documents & descriptions ────────────────────────────────────────────
  {
    id: 'deed_get_status',
    name: 'Get Deed Session Status',
    type: 'query',
    description:
      'Returns the complete Boundary Agent state at a glance: loaded deed document, deed metadata, ' +
      'how many descriptions were detected, extracted, pending, or currently being parsed, and the ' +
      'boundary files that exist. Call this first when the user asks "what do you have?" or before ' +
      'choosing a description to parse.',
    inputs: {},
    outputs: {
      loaded: { type: 'boolean', required: true },
      fileName: { type: 'string' },
      metadata: { type: 'object', description: 'owner, grantor, parcelId, book, page.' },
      descriptionCount: { type: 'integer', required: true },
      extractedCount: { type: 'integer', required: true },
      pendingCount: { type: 'integer', required: true },
      computingCount: { type: 'integer', required: true },
      boundaryFileCount: { type: 'integer', required: true },
      activeBoundaryFileId: { type: 'string' },
      summary: { type: 'string', required: true },
    },
  },
  {
    id: 'deed_list_documents',
    name: 'List Available Deeds',
    type: 'query',
    description:
      'Lists the deed documents available in this session with their metadata and how many legal ' +
      'descriptions each contains. Use this whenever the user asks which deeds are loaded, then ' +
      'use deed_list_descriptions to drill into one document.',
    inputs: {},
    outputs: {
      documents: { type: 'array', items: { type: 'object' }, required: true },
      count: { type: 'integer', required: true },
      activeDocument: { type: 'string' },
    },
    examples: [
      'User: "what deeds do you have?" -> deed_list_documents({}).',
    ],
  },
  {
    id: 'deed_get_metadata',
    name: 'Get Deed Metadata',
    type: 'query',
    description:
      'Returns the recorded deed metadata (grantor, grantee/owner, parcel id, book and page) plus ' +
      'the description list for the active deed document.',
    inputs: {},
    outputs: {
      fileName: { type: 'string' },
      owner: { type: 'string' },
      grantor: { type: 'string' },
      parcelId: { type: 'string' },
      book: { type: 'string' },
      page: { type: 'string' },
      descriptions: { type: 'array', items: { type: 'object' } },
    },
  },
  {
    id: 'deed_list_descriptions',
    name: 'List Deed Descriptions',
    type: 'query',
    description:
      'Lists every legal description detected in the loaded deed with its tract id, name, source ' +
      'page, snippet, parser reason, and derived status (pending, computing, ready, drafted). ' +
      'Optionally filter by status. This is the authoritative answer to "what descriptions are in ' +
      'this deed?" and the best way to choose a tract before extraction.',
    inputs: {
      status: {
        type: 'string',
        enum: ['all', 'pending', 'computing', 'ready', 'drafted'],
        description: 'Optional status filter. Default all.',
      },
      includeSnippet: { type: 'boolean', description: 'Include the description preview text. Default true.' },
    },
    outputs: {
      descriptions: { type: 'array', items: { type: 'object' }, required: true },
      totalCount: { type: 'integer', required: true },
      counts: { type: 'object', description: 'pending, computing, ready, drafted.' },
      fileName: { type: 'string' },
    },
    examples: [
      'User: "list the parcel descriptions in this deed" -> deed_list_descriptions({}).',
      'User: "which ones still need extracting?" -> deed_list_descriptions({status:"pending"}).',
    ],
  },
  {
    id: 'deed_get_description',
    name: 'Get Deed Description',
    type: 'query',
    description:
      'Returns one description in full detail: snippet, parser reason, source page, status, the ' +
      'matching boundary file, and its calls when they have already been extracted.',
    inputs: {
      tractId: tractIdField,
      index: { type: 'integer', description: '1-based description index; used when tractId is omitted.' },
    },
    outputs: {
      found: { type: 'boolean', required: true },
      description: { type: 'object' },
      boundaryFile: { type: 'object' },
      calls: { type: 'array', items: { type: 'object' } },
      message: { type: 'string', required: true },
    },
  },
  {
    id: 'deed_open_description',
    name: 'Open Description in Text Editor',
    type: 'action',
    description:
      'Opens the source description text in the editor so the user can read or correct the legal ' +
      'description before re-parsing. Uses the uploaded deed text when available and otherwise the ' +
      'captured description snippet.',
    inputs: { tractId: tractIdField },
    outputs: {
      opened: { type: 'boolean', required: true },
      tractId: { type: 'string' },
      editorFile: { type: 'string' },
    },
  },
  {
    id: 'deed_parse_description',
    name: 'Extract Calls for Description(s)',
    type: 'action',
    description:
      'Runs the heavy deed parse for one or more descriptions, producing bearing & distance calls ' +
      'and boundary files. Use this after the user selects a description or asks to extract its ' +
      'calls. Optionally anchor the traverse at a point of beginning by point number or E/N.',
    inputs: {
      tractIds: { type: 'array', items: { type: 'string' }, description: 'Descriptions to extract.' },
      tractId: tractIdField,
      pointNumber: { type: 'string', description: 'Optional POB point number in the project.' },
      easting: { type: 'number', description: 'Optional POB easting when no point number is used.' },
      northing: { type: 'number', description: 'Optional POB northing when no point number is used.' },
    },
    outputs: {
      accepted: { type: 'boolean', required: true },
      tractIds: { type: 'array', items: { type: 'string' }, required: true },
      message: { type: 'string', required: true },
    },
    examples: [
      'User: "extract the calls for Tract 2" -> deed_parse_description({tractIds:["Tract 2"]}).',
      'User: "start Parcel A at point 100" -> deed_parse_description({tractId:"Parcel A", pointNumber:"100"}).',
    ],
  },
  {
    id: 'deed_parse_all_descriptions',
    name: 'Extract All Descriptions',
    type: 'action',
    description:
      'Runs extraction for every description in the loaded deed at once. Use when the user asks to ' +
      '"extract all", "parse the whole deed", or process every pending description.',
    inputs: {},
    outputs: {
      accepted: { type: 'boolean', required: true },
      tractCount: { type: 'integer', required: true },
      message: { type: 'string', required: true },
    },
  },

  // ── Boundary files & calls ──────────────────────────────────────────────
  {
    id: 'deed_list_boundary_files',
    name: 'List Boundary Files',
    type: 'query',
    description:
      'Lists every parsed boundary file with its name, source description, call count, drawing ' +
      'state, associated point count, and current transform. Use before selecting a file or when ' +
      'the user asks what boundaries have been computed.',
    inputs: {
      includeCalls: { type: 'boolean', description: 'Include each file\'s call rows. Default false.' },
    },
    outputs: {
      files: { type: 'array', items: { type: 'object' }, required: true },
      count: { type: 'integer', required: true },
      activeFileId: { type: 'string' },
    },
  },
  {
    id: 'deed_get_boundary_file',
    name: 'Get Boundary File',
    type: 'query',
    description:
      'Returns one boundary file with its full call list, resolved from/to coordinates, drawing ' +
      'state, and transform. This is the detailed counterpart to deed_list_boundary_files.',
    inputs: { fileId: fileIdField },
    outputs: {
      found: { type: 'boolean', required: true },
      file: { type: 'object' },
      calls: { type: 'array', items: { type: 'object' } },
      callCount: { type: 'integer' },
    },
  },
  {
    id: 'deed_select_boundary_file',
    name: 'Select Boundary File',
    type: 'action',
    description:
      'Makes a boundary file active and optionally opens the bearing & distance editor. Use when ' +
      'the user switches between computed tracts.',
    inputs: {
      fileId: { ...fileIdField, required: true },
      openEditor: { type: 'boolean', description: 'Open the bearing & distance interface. Default true.' },
    },
    outputs: {
      selected: { type: 'boolean', required: true },
      fileId: { type: 'string', required: true },
      fileName: { type: 'string' },
    },
  },
  {
    id: 'deed_list_calls',
    name: 'List Boundary Calls',
    type: 'query',
    description:
      'Lists the bearing & distance calls for a boundary file, including curves, chord data, corner ' +
      'monuments, and the project coordinates of each from/to point when available. Use this to ' +
      'answer questions about courses, distances, or the call table without opening the editor.',
    inputs: { fileId: fileIdField },
    outputs: {
      fileId: { type: 'string', required: true },
      fileName: { type: 'string' },
      calls: { type: 'array', items: { type: 'object' }, required: true },
      count: { type: 'integer', required: true },
    },
  },
  {
    id: 'deed_update_call',
    name: 'Update Boundary Call',
    type: 'action',
    description:
      'Updates one call row (bearing, distance, curve radius/arc length/direction, chord data, or ' +
      'corner monument) and propagates the corrected geometry through the remaining calls.',
    inputs: {
      fileId: fileIdField,
      callId: { type: 'string', required: true, description: 'Call id from deed_list_calls.' },
      bearing: { type: 'string' },
      distance: { type: 'string' },
      chordBearing: { type: 'string' },
      chordDistance: { type: 'number' },
      tangentBearing: { type: 'string' },
      isCurve: { type: 'boolean' },
      curveRadius: { type: 'number' },
      arcLength: { type: 'number' },
      curveDirection: { type: 'string', enum: ['left', 'right'] },
      toDescription: { type: 'string' },
    },
    outputs: {
      updated: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      call: { type: 'object' },
    },
    examples: [
      'User: "change the second call to N 12 34 56 E, 250.00 feet" -> deed_update_call({callId:"call-2", bearing:"N 12 34 56 E", distance:"250.00"}).',
    ],
  },
  {
    id: 'deed_toggle_boundary_visibility',
    name: 'Show / Hide Boundary',
    type: 'action',
    description:
      'Shows or hides a boundary file\'s amber overlay and its associated point visibility. Omit ' +
      'hidden to invert the current state.',
    inputs: {
      fileId: fileIdField,
      hidden: { type: 'boolean', description: 'Target state. Omit to toggle.' },
    },
    outputs: {
      fileId: { type: 'string', required: true },
      hidden: { type: 'boolean', required: true },
    },
  },
  {
    id: 'deed_draw_to_linework',
    name: 'Draft Boundary to Linework',
    type: 'action',
    description:
      'Commits the selected boundary\'s calls to CAD linework and survey points, anchored at its ' +
      'POB or the project centroid. Equivalent to the Draft button in the bearing & distance panel.',
    inputs: {
      fileId: fileIdField,
      silent: { type: 'boolean', description: 'Skip the closure confirmation warning. Default false.' },
    },
    outputs: {
      queued: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      callCount: { type: 'integer' },
      message: { type: 'string', required: true },
    },
  },

  // ── Alignment & transforms ──────────────────────────────────────────────
  {
    id: 'deed_get_alignment',
    name: 'Get Boundary Alignment',
    type: 'query',
    description:
      'Returns a boundary\'s alignment state: associated survey points with coordinates, POB source, ' +
      'translation, rotation, and whether it has been drafted. Use before running best fit or when ' +
      'the user asks how a deed is currently aligned.',
    inputs: { fileId: fileIdField },
    outputs: {
      found: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      fileName: { type: 'string' },
      associatedPointCount: { type: 'integer' },
      associatedPoints: { type: 'array', items: { type: 'object' } },
      translationE: { type: 'number' },
      translationN: { type: 'number' },
      rotationDeg: { type: 'number' },
      pobOverride: { type: 'object' },
      drawn: { type: 'boolean' },
      drawnPointCount: { type: 'integer' },
      drawnLineCount: { type: 'integer' },
      message: { type: 'string', required: true },
    },
  },
  {
    id: 'deed_list_alignment_points',
    name: 'List Alignment Candidate Points',
    type: 'query',
    description:
      'Lists project points that can be associated with a boundary for best-fit alignment, excluding ' +
      'points already drafted by deed traverses. Filter by point list or description substring so the ' +
      'caller can pick the right monument points without dumping the whole project.',
    inputs: {
      fileId: fileIdField,
      listId: { type: 'string', description: 'Optional point-list id or name filter.' },
      byDescription: { type: 'string', description: 'Case-insensitive description substring.' },
      includeDrawn: { type: 'boolean', description: 'Include points already drafted by a boundary. Default false.' },
      limit: { type: 'integer', description: 'Maximum rows (1-1000). Default 100.' },
    },
    outputs: {
      fileId: { type: 'string' },
      points: { type: 'array', items: { type: 'object' }, required: true },
      count: { type: 'integer', required: true },
    },
  },
  {
    id: 'deed_associate_points',
    name: 'Associate Points with Boundary',
    type: 'action',
    description:
      'Associates project points (by point number) with a boundary so they participate in best-fit ' +
      'alignment and follow the boundary\'s visibility. Only existing points are accepted.',
    inputs: {
      fileId: fileIdField,
      pointNumbers: { type: 'array', items: { type: 'string' }, required: true },
    },
    outputs: {
      associated: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      pointNumbers: { type: 'array', items: { type: 'string' } },
      missing: { type: 'array', items: { type: 'string' } },
      associatedPointCount: { type: 'integer' },
    },
  },
  {
    id: 'deed_disassociate_point',
    name: 'Disassociate Point from Boundary',
    type: 'action',
    description: 'Removes one point number from a boundary\'s alignment set without deleting the point.',
    inputs: {
      fileId: fileIdField,
      pointNumber: { type: 'string', required: true },
    },
    outputs: {
      disassociated: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      remainingCount: { type: 'integer' },
    },
  },
  {
    id: 'deed_best_fit',
    name: 'Best-Fit Boundary to Points',
    type: 'action',
    description:
      'Computes the rigid Helmert best fit (translation + rotation, no scale) between the boundary\'s ' +
      'deed vertices and its associated survey points, then applies the resulting transform and ' +
      'redraws if the boundary was already drafted.',
    inputs: { fileId: fileIdField },
    outputs: {
      applied: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      associatedPointCount: { type: 'integer' },
      message: { type: 'string', required: true },
    },
    examples: [
      'User: "best fit this deed to the found corners" -> deed_best_fit({}).',
    ],
  },
  {
    id: 'deed_align_corners',
    name: 'Start Corner-Pairing Alignment',
    type: 'action',
    description:
      'Starts the interactive corner-pairing alignment on the canvas: the user clicks a deed corner ' +
      'then the found point it belongs on, repeating to refine the fit.',
    inputs: { fileId: fileIdField },
    outputs: {
      started: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      message: { type: 'string', required: true },
    },
  },
  {
    id: 'deed_transform_boundary',
    name: 'Translate / Rotate Boundary',
    type: 'action',
    description:
      'Applies an absolute or relative transform to a boundary. Set translationE/N and rotationDeg ' +
      'for absolute values, or translateByE / translateByN / rotateByDeg for deltas. Use reset:true ' +
      'to clear the transform. The amber overlay and any drafted linework move together.',
    inputs: {
      fileId: fileIdField,
      translationE: { type: 'number', description: 'Absolute easting translation.' },
      translationN: { type: 'number', description: 'Absolute northing translation.' },
      rotationDeg: { type: 'number', description: 'Absolute rotation in degrees (positive = counter-clockwise).' },
      translateByE: { type: 'number', description: 'Relative easting delta.' },
      translateByN: { type: 'number', description: 'Relative northing delta.' },
      rotateByDeg: { type: 'number', description: 'Relative rotation delta in degrees.' },
      reset: { type: 'boolean', description: 'Clear translation and rotation before applying any deltas.' },
    },
    outputs: {
      applied: { type: 'boolean', required: true },
      fileId: { type: 'string', required: true },
      translationE: { type: 'number', required: true },
      translationN: { type: 'number', required: true },
      rotationDeg: { type: 'number', required: true },
    },
    examples: [
      'User: "shift the deed 25 feet east" -> deed_transform_boundary({translateByE:25}).',
      'User: "rotate it 3 degrees clockwise" -> deed_transform_boundary({rotateByDeg:-3}).',
    ],
  },
  {
    id: 'deed_set_pob',
    name: 'Set Point of Beginning',
    type: 'action',
    description:
      'Sets the boundary\'s point of beginning by project point number, explicit easting/northing, ' +
      'or clears it so the draw falls back to the centroid of existing points.',
    inputs: {
      fileId: fileIdField,
      pointNumber: { type: 'string', description: 'Existing project point to anchor on.' },
      easting: { type: 'number' },
      northing: { type: 'number' },
      clear: { type: 'boolean', description: 'Clear the POB override.' },
    },
    outputs: {
      applied: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      pointNumber: { type: 'string' },
      pob: { type: 'object' },
      message: { type: 'string', required: true },
    },
  },
  {
    id: 'deed_open_editor',
    name: 'Open Boundary Editor',
    type: 'action',
    description:
      'Opens the bearing & distance editor for a boundary file (or the active one) so the user can ' +
      'inspect or edit the calls.',
    inputs: { fileId: fileIdField },
    outputs: {
      opened: { type: 'boolean', required: true },
      fileId: { type: 'string' },
    },
  },
  {
    id: 'deed_open_alignment_tools',
    name: 'Open Alignment Tools',
    type: 'action',
    description:
      'Opens the alignment dialog for a boundary, exposing best fit, corner pairing, transform, and ' +
      'point association controls.',
    inputs: { fileId: fileIdField },
    outputs: {
      opened: { type: 'boolean', required: true },
      fileId: { type: 'string' },
      docked: { type: 'boolean', required: true },
    },
  },
];
