/**
 * sheetViewProtocol — the typed command contract between Sheet View, A2UI, and
 * CACP peers.
 *
 * The visual Sheet View owns its sheet-set state. Agents never mutate React
 * state directly: they send one of these commands over CACP, the host queues
 * it, and the mounted Sheet View applies it through the same handlers the
 * paper-space UI uses. This keeps the sheet authoritative while giving every
 * sheet tool a stable, schema-described interface.
 */

import type { SkillSchema } from './AgentRegistry';

export type SheetViewTitleblockField =
  | 'projectName'
  | 'sheetNumber'
  | 'drawnBy'
  | 'date'
  | 'notes';

export type SheetViewCommand =
  | { action: 'open' }
  | { action: 'add_plan_viewport'; scaleFt?: number }
  | { action: 'add_profile_viewport'; roadObjectId?: string; profileKind?: 'existing' | 'design' }
  | { action: 'add_cross_section_viewport'; roadObjectId: string; station?: number; scaleFt?: number; verticalExaggeration?: number }
  | {
      action: 'update_viewport';
      viewportId?: string;
      scaleFt?: number;
      rotationDeg?: number;
      showBasemap?: boolean;
      basemapOpacity?: number;
      lockPosition?: boolean;
      lockZoom?: boolean;
    }
  | {
      action: 'update_sheet';
      sheetId?: string;
      landscape?: boolean;
      name?: string;
    }
  | {
      action: 'update_titleblock';
      field: SheetViewTitleblockField;
      value: string;
    }
  | { action: 'add_sheet'; name?: string; sheetNumber?: string }
  | { action: 'select_sheet'; sheetId: string }
  | { action: 'export_pdf'; scope?: 'current' | 'set' };

export interface SheetViewSnapshot {
  open: boolean;
  activeSheetId: string;
  activeSheetName: string;
  projectName: string;
  sheetNumber: string;
  sheetCount: number;
  paperSize: string;
  landscape: boolean;
  viewportCount: number;
  selectedViewportId: string | null;
  selectedScaleFt: number | null;
}

const commandOutputs: Record<string, SkillSchema['outputs']> = {
  accepted: {
    accepted: { type: 'boolean', required: true, description: 'True when the command was queued for the live sheet.' },
    command: { type: 'string', required: true, description: 'The Sheet View command that was queued.' },
  },
};

/**
 * Sheet View skills are owned by the CAD Manager manifest today. They are kept
 * in their own module so the sheet can become a standalone CACP agent later
 * without changing any command IDs or payloads.
 */
export const SHEET_VIEW_SKILLS: SkillSchema[] = [
  {
    id: 'sheet_view_get_state',
    name: 'Get Sheet View State',
    type: 'query',
    description:
      'Returns the current paper-space sheet: active sheet, paper size, orientation, viewport count, selected viewport, and scale. Returns open:false when Sheet View is not mounted.',
    inputs: {},
    outputs: {
      open: { type: 'boolean', required: true },
      activeSheetId: { type: 'string' },
      activeSheetName: { type: 'string' },
      projectName: { type: 'string' },
      sheetNumber: { type: 'string' },
      sheetCount: { type: 'integer' },
      paperSize: { type: 'string' },
      landscape: { type: 'boolean' },
      viewportCount: { type: 'integer' },
      selectedViewportId: { type: 'string' },
      selectedScaleFt: { type: 'number' },
    },
    examples: [
      'Civil Drafter asks where the current plan viewport is before placing a detail.',
      'A peer agent checks whether the active sheet is landscape before adding a profile viewport.',
    ],
  },
  {
    id: 'sheet_view_open',
    name: 'Open Sheet View',
    type: 'action',
    description: 'Opens the live paper-space Sheet View in the workspace. The sheet remains the source of truth.',
    inputs: {},
    outputs: commandOutputs.accepted,
    examples: ['User: "open the plot sheet" -> sheet_view_open'],
  },
  {
    id: 'sheet_view_add_plan_viewport',
    name: 'Add Plan Viewport',
    type: 'action',
    description:
      'Adds a plan viewport to the active sheet and selects it. Optionally sets the drawing scale in feet per inch.',
    inputs: {
      scaleFt: { type: 'number', description: 'Drawing scale in feet per inch (for example 50 for 1"=50\').' },
    },
    outputs: commandOutputs.accepted,
    examples: ['Add a 1"=50\' plan viewport to the active sheet.'],
  },
  {
    id: 'sheet_view_add_profile_viewport',
    name: 'Add Profile Viewport',
    type: 'action',
    description:
      'Adds a profile viewport. Omit roadObjectId to use the loaded Profile Agent data; supply it to project a linked RoadObject existing/design profile.',
    inputs: {
      roadObjectId: { type: 'string', description: 'Optional linked RoadObject id.' },
      profileKind: { type: 'string', enum: ['existing', 'design'], default: 'existing' },
    },
    outputs: commandOutputs.accepted,
    examples: ['Place the current profile below the plan viewport.'],
  },
  {
    id: 'sheet_view_add_cross_section_viewport',
    name: 'Add Cross Section Viewport',
    type: 'action',
    description:
      'Adds a station cross-section viewport for a linked RoadObject. Station defaults to the first section.',
    inputs: {
      roadObjectId: { type: 'string', required: true },
      station: { type: 'number', description: 'Absolute station; omitted uses the first section.' },
      scaleFt: { type: 'number', description: 'Horizontal scale in feet per inch.' },
      verticalExaggeration: { type: 'number', default: 2 },
    },
    outputs: commandOutputs.accepted,
    examples: ['Place the 2+50 cross section below the plan viewport.'],
  },
  {
    id: 'sheet_view_update_viewport',
    name: 'Update Viewport',
    type: 'action',
    description:
      'Updates a viewport on the active sheet. Omit viewportId to target the selected viewport. Supports scale, rotation, basemap visibility/opacity, and position/zoom locks.',
    inputs: {
      viewportId: { type: 'string', description: 'Viewport id; defaults to the selected viewport.' },
      scaleFt: { type: 'number', description: 'Plan scale in feet per inch.' },
      rotationDeg: { type: 'integer', description: 'Viewport rotation in degrees.' },
      showBasemap: { type: 'boolean' },
      basemapOpacity: { type: 'number', description: '0.1 to 1.0.' },
      lockPosition: { type: 'boolean' },
      lockZoom: { type: 'boolean' },
    },
    outputs: commandOutputs.accepted,
    examples: ['Set the selected viewport to 1"=30\' and rotate it 90 degrees.'],
  },
  {
    id: 'sheet_view_update_sheet',
    name: 'Update Active Sheet',
    type: 'action',
    description:
      'Changes the active sheet paper size, orientation, or tab name. Paper sizes use the sheet preset ids (for example arch-d, arch-c, ansi-d).',
    inputs: {
      sheetId: { type: 'string', description: 'Sheet preset id from the paper-size picker.' },
      landscape: { type: 'boolean' },
      name: { type: 'string', description: 'Sheet tab name.' },
    },
    outputs: commandOutputs.accepted,
    examples: ['Switch the active sheet to ARCH D landscape and rename it to C-101.'],
  },
  {
    id: 'sheet_view_update_titleblock',
    name: 'Update Titleblock Field',
    type: 'action',
    description:
      'Writes one titleblock field on the active sheet (project name, sheet number, drawn by, date, or notes).',
    inputs: {
      field: {
        type: 'string',
        required: true,
        enum: ['projectName', 'sheetNumber', 'drawnBy', 'date', 'notes'],
      },
      value: { type: 'string', required: true },
    },
    outputs: commandOutputs.accepted,
    examples: ['Set the sheet number to C-301.'],
  },
  {
    id: 'sheet_view_add_sheet',
    name: 'Add Sheet',
    type: 'action',
    description:
      'Adds a new sheet to the current set, copies project-level titleblock fields, and makes it active.',
    inputs: {
      name: { type: 'string', description: 'Optional tab name.' },
      sheetNumber: { type: 'string', description: 'Optional sheet number such as C-002.' },
    },
    outputs: commandOutputs.accepted,
    examples: ['Add a new C-002 sheet for the erosion-control details.'],
  },
  {
    id: 'sheet_view_select_sheet',
    name: 'Select Sheet',
    type: 'action',
    description: 'Makes an existing sheet active by id.',
    inputs: {
      sheetId: { type: 'string', required: true },
    },
    outputs: commandOutputs.accepted,
  },
  {
    id: 'sheet_view_export_pdf',
    name: 'Export Sheet PDF',
    type: 'action',
    description: 'Exports the active sheet or the full sheet set as a PDF.',
    inputs: {
      scope: {
        type: 'string',
        enum: ['current', 'set'],
        default: 'current',
      },
    },
    outputs: commandOutputs.accepted,
    examples: ['Plot the active sheet to PDF.'],
  },
];
