/**
 * Parsing, alias expansion, and execution registry for 2D CAD canvas command line.
 * Deterministic (non-AI). Can be extended later with AI/JEV hooks.
 */

export interface ParsedCommand {
  raw: string;
  verb: string;
  args: string[];
  coordinate?: { easting: number; northing: number };
  numeric?: number;
}

export interface CommandContext {
  onAddPoint?: () => void;
  onStartLine?: () => void;
  onStartCircle?: () => void;
  onStartInclusion?: () => void;
  onToggleOrtho?: () => void;
  /** Open the selection Properties dialog. */
  onOpenProperties?: () => void;
  onToggleSelection?: () => void;
  onToggleBoxSelect?: () => void;
  onStartTrim?: () => void;
  onStartExtend?: () => void;
  onStartCopy?: () => void;
  /** Start interactive ROTATE: pick a base point, then click a point or type the angle. */
  onStartRotate?: () => void;
  /** Start interactive SCALE: pick a reference point, then click a point or type a factor. */
  onStartScale?: () => void;
  /** Start interactive MOVE: pick a base point, then click the destination. */
  onStartMove?: () => void;
  /** Start interactive MIRROR: pick the two axis points on canvas. */
  onStartMirror?: () => void;
  onStartOffset?: (distance?: number) => void;
  /** Whether any canvas entity is currently selected (used by selection commands). */
  hasSelection?: boolean;
  /** Number of currently selected entities, when available. */
  selectionCount?: number;
  /**
   * Invoked when a command needs canvas entities but nothing is selected yet.
   * The canvas arms pick mode and re-runs `raw` when the user confirms (Enter).
   * When absent, selection-dependent commands report a hard error.
   */
  onAwaitSelection?: (raw: string, label: string) => void;
  /** Enter on an empty command line: confirm the command that is waiting on canvas picks. */
  onApplyPendingSelection?: () => void;
  /** Notified for every submitted command so transient canvas command state can reset. */
  onCommandSubmitted?: (verb: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomExtents?: () => void;
  onOpenSettings?: () => void;
  onOpenKeyModal?: () => void;
  onClear?: () => void;
  onCancel?: () => void;
  onNumericInput?: (value: number) => void;
  onCoordinateInput?: (point: { easting: number; northing: number }) => void;
  onSelectAll?: () => number;
  onDeselectAll?: () => void;
  onEraseSelection?: () => number;
  onMoveSelection?: (dx: number, dy: number) => number;
  onRotateSelection?: (angleDegrees: number, pivot?: { easting: number; northing: number }) => number;
  onScaleSelection?: (factor: number, pivot?: { easting: number; northing: number }) => number;
  onMirrorSelection?: (
    p1: { easting: number; northing: number },
    p2: { easting: number; northing: number },
  ) => number;
  onJoinSelection?: () => number;
  onExplodeSelection?: () => number;
  onArraySelection?: (rows: number, columns: number, rowSpacing: number, columnSpacing: number, angleDegrees?: number) => number;
  onPolarArraySelection?: (
    count: number,
    fillAngleDegrees: number,
    center?: { easting: number; northing: number },
  ) => number;
  /** Start the interactive polygon tool: snapped center, live radius, adjustable sides. */
  onStartPolygon?: (sides?: number, center?: { easting: number; northing: number }) => void;
  /** Open the floating, operation-anchored prompt for a multi-input command. */
  onPrompt?: (prompt: CommandPromptSpec) => void;
  /** Linear unit abbreviation shown by prompt fields, e.g. "ft". */
  linearUnitLabel?: string;
  onCreateRectangle?: (
    p1: { easting: number; northing: number },
    p2: { easting: number; northing: number },
  ) => number;
  onCreatePolygon?: (
    sides: number,
    center: { easting: number; northing: number },
    radius: number,
  ) => number;
  keyInfo?: {
    label: string;
    detail: string;
    tone?: string;
  };
}

export type CommandLinkAction = 'open-text-editor' | 'open-properties' | 'help' | 'select-all';

/** An inline action the command line renders after a result. */
export interface CommandLink {
  label?: string;
  action: CommandLinkAction;
  /** Text handed to the text editor; defaults to the result message. */
  payload?: string;
}

export type HelpAccent = 'cyan' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose';

export interface HelpEntry {
  /** Command or gesture, e.g. “L / PLINE” or “Shift”. */
  command: string;
  description: string;
  /** Short qualifier rendered in italics (e.g. “bare M = picks”). */
  note?: string;
}

export interface HelpGroup {
  title: string;
  accent: HelpAccent;
  entries: HelpEntry[];
}

export interface CommandResult {
  status: 'ok' | 'info' | 'error';
  message: string;
  links?: CommandLink[];
  /** Structured help rendered as formatted groups in the command readout. */
  helpGroups?: HelpGroup[];
  /** Italic footnotes shown under the help groups. */
  helpNotes?: string[];
}

/** One value box in a multi-input command prompt. */
export interface CommandPromptField {
  key: string;
  label: string;
  /** Compact label for the arrow pad, e.g. "COL SP". */
  shortLabel?: string;
  kind: 'number' | 'point';
  /** Short unit/format hint rendered inside the box, e.g. "ft", "°", "E,N". */
  unit?: string;
  placeholder?: string;
  integer?: boolean;
  min?: number;
  max?: number;
}

/**
 * An operation-anchored prompt for a command that needs several inputs. The canvas
 * owns the field state; `submit` validates the collected values and runs the
 * command, so the same prompt can be completed in the boxes or on the command
 * line.
 */
export interface CommandPromptSpec {
  id: string;
  title: string;
  hint?: string;
  fields: CommandPromptField[];
  initialValues?: Record<string, string>;
  submit: (values: Record<string, string>) => CommandResult;
}

const COMMAND_ALIASES: Record<string, string> = {
  l: 'line',
  line: 'line',
  pl: 'line',
  pline: 'line',
  polyline: 'line',
  c: 'circle',
  circle: 'circle',
  cir: 'circle',
  s: 'select',
  sel: 'select',
  select: 'select',
  b: 'box',
  box: 'box',
  boxselect: 'box',
  t: 'trim',
  tr: 'trim',
  trim: 'trim',
  cp: 'copy',
  copy: 'copy',
  os: 'offset',
  offset: 'offset',
  o: 'ortho',
  ortho: 'ortho',
  prop: 'properties',
  properties: 'properties',
  f8: 'ortho',
  i: 'inclusion',
  inc: 'inclusion',
  inclusion: 'inclusion',
  u: 'undo',
  undo: 'undo',
  redo: 'redo',
  ze: 'zoom_extents',
  zoom: 'zoom_extents',
  extents: 'zoom_extents',
  'zoom extents': 'zoom_extents',
  key: 'key_info',
  'key info': 'key_info',
  keys: 'key_info',
  apikey: 'key_info',
  api: 'key_info',
  help: 'help',
  '?': 'help',
  esc: 'cancel',
  cancel: 'cancel',
  clear: 'clear',
  cls: 'clear',
  // Manual drafting commands (typed only).
  rec: 'rectangle',
  rect: 'rectangle',
  rectang: 'rectangle',
  rectangle: 'rectangle',
  pol: 'polygon',
  polygon: 'polygon',
  ar: 'array',
  array: 'array',
  pa: 'polar_array',
  parray: 'polar_array',
  polar: 'polar_array',
  polararray: 'polar_array',
  m: 'move',
  move: 'move',
  r: 'rotate',
  ro: 'rotate',
  rotate: 'rotate',
  sc: 'scale',
  scale: 'scale',
  mi: 'mirror',
  mirror: 'mirror',
  j: 'join',
  join: 'join',
  x: 'explode',
  explode: 'explode',
  e: 'erase',
  er: 'erase',
  erase: 'erase',
  delete: 'erase',
  del: 'erase',
  ex: 'extend',
  extend: 'extend',
  all: 'select_all',
  selectall: 'select_all',
  sa: 'select_all',
  ds: 'deselect',
  deselect: 'deselect',
  di: 'distance',
  dist: 'distance',
  distance: 'distance',
};

/** Short human descriptions used by the command line's live hint chip. */
export const COMMAND_DESCRIPTIONS: Record<string, string> = {
  line: 'Draw chained line/arc segments',
  circle: 'Draw a circle by center and radius',
  rectangle: 'Rectangle from two corners',
  polygon: 'Regular polygon from a snapped center and drag radius',
  array: 'Rectangular array',
  polar_array: 'Polar array about a center',
  move: 'Move the selection',
  rotate: 'Rotate the selection',
  scale: 'Scale the selection',
  mirror: 'Mirror the selection',
  join: 'Join segments into one polyline',
  explode: 'Explode polylines into segments',
  erase: 'Delete selected entities',
  copy: 'Copy the selection',
  offset: 'Offset a line, polyline, arc or circle',
  trim: 'Trim to a cutting edge',
  extend: 'Extend to a boundary',
  select: 'Pick entities',
  box: 'Window / box selection',
  select_all: 'Select every visible entity',
  deselect: 'Clear the selection',
  distance: 'Measure between two points',
  ortho: 'Toggle orthogonal drawing',
  inclusion: 'Draw an inclusion boundary',
  undo: 'Undo the last change',
  redo: 'Redo the last change',
  zoom_extents: 'Fit the drawing in view',
  key_info: 'Show access key status',
  properties: 'Open the selection properties panel',
  help: 'Show this command reference',
  cancel: 'Cancel the current command',
  clear: 'Clear the command history',
  coordinate: 'Use an E,N coordinate',
  numeric: 'Enter a distance / radius',
};

/** Resolve a parsed verb to its one-line description, if it is a real command. */
export function describeCommand(verb: string): string | undefined {
  return COMMAND_DESCRIPTIONS[verb];
}

/** Grouped command reference used by the formatted HELP readout. */
export const HELP_GROUPS: HelpGroup[] = [
  {
    title: 'Draw',
    accent: 'cyan',
    entries: [
      { command: 'L / PLINE', description: 'Chained line and tangent-arc segments', note: 'A arc · L line' },
      { command: 'C / CIRCLE', description: 'Center + radius, or two tangents (TTR)', note: 'T toggles TTR' },
      { command: 'REC / RECTANGLE', description: 'Rectangle from two opposite corners', note: 'arrow pad' },
      { command: 'POL / POLYGON', description: 'Regular polygon from a snapped center and drag radius', note: 'scroll / [ ] sides' },
      { command: 'P', description: 'Place a survey point' },
      { command: 'I / INCLUSION', description: 'Draw an inclusion boundary' },
    ],
  },
  {
    title: 'Modify',
    accent: 'emerald',
    entries: [
      { command: 'S / SELECT', description: 'Pick entities on the canvas' },
      { command: 'B / BOX', description: 'Window or crossing box selection' },
      { command: 'T / TRIM', description: 'Trim to a cutting edge' },
      { command: 'EX / EXTEND', description: 'Extend to a boundary' },
      { command: 'CP / COPY', description: 'Copy with a snapped base point' },
      { command: 'OS / OFFSET', description: 'Offset a line, arc, circle or polyline', note: 'distance' },
      { command: 'M / MOVE', description: 'Move with a live ghost preview', note: 'bare M = picks' },
      { command: 'RO / R', description: 'Rotate with snaps and ghost preview', note: 'Shift = 15°' },
      { command: 'SC / SCALE', description: 'Scale with snaps and a live ghost preview', note: 'click or type factor' },
      { command: 'MI / MIRROR', description: 'Mirror across two snapped points' },
      { command: 'J / JOIN', description: 'Join segments into one polyline' },
      { command: 'X / EXPLODE', description: 'Explode polylines into segments' },
      { command: 'E / ERASE', description: 'Delete the selection' },
    ],
  },
  {
    title: 'Arrays',
    accent: 'violet',
    entries: [
      { command: 'AR', description: 'Rectangular array', note: 'rows cols spacing [angle]' },
      { command: 'PA', description: 'Polar array about a center', note: 'bare PA = ring widget · PICK center on canvas' },
    ],
  },
  {
    title: 'Selection flow',
    accent: 'sky',
    entries: [
      { command: 'Left click', description: 'Pick the entity under the cursor' },
      { command: 'Drag', description: 'Box select while a command is armed' },
      { command: 'MMB drag', description: 'Pan without leaving the command' },
      { command: 'Enter', description: 'Apply the armed command' },
      { command: 'Esc', description: 'Cancel the command and clear picks' },
    ],
  },
  {
    title: 'Utility',
    accent: 'amber',
    entries: [
      { command: 'ZE', description: 'Zoom extents' },
      { command: 'U / REDO', description: 'Undo and redo the last change' },
      { command: 'ALL / DS', description: 'Select all / deselect' },
      { command: 'DI', description: 'Distance and azimuth between two points', note: 'arrow pad' },
      { command: 'PROP', description: 'Open the selection properties panel' },
      { command: 'KEY', description: 'Access key status' },
      { command: 'CLEAR', description: 'Clear this history' },
    ],
  },
  {
    title: 'Input',
    accent: 'rose',
    entries: [
      { command: 'E,N', description: 'Absolute coordinate', note: 'feet' },
      { command: 'number', description: 'Distance, radius or spacing', note: 'current unit' },
      { command: 'Shift', description: 'Snap the rotation angle to 15°' },
    ],
  },
];

export const HELP_NOTES: string[] = [
  'Coordinates are E,N in feet. Typed distances, radii and spacings use the current linear unit.',
  'Angles are degrees, counter-clockwise positive. Hold Shift to snap to 15° increments.',
  'Use the buttons after a result to open it in the Text Editor, open Properties, or copy it.',
  'AR shows a UCS-style X/Y manipulator: drag a handle for spacing, Shift-drag for quantity, Alt-drag for total span, or type any value. Drag the direction ring or type the angle. Other multi-input commands use the compact field editor.',
  'POL is interactive: click a snapped center, then drag, click, or type the diameter. Scroll the mouse wheel or press [ / ] to change the side count; the anchored SIDES / DIA strip edits both live. POL 8 starts with eight sides.',
];

const COORDINATE_TOKEN = /^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/;

/** Parse an "E,N" / "X,Y" command argument into a coordinate pair. */
export function parseCoordinateToken(token: string): { easting: number; northing: number } | null {
  const match = token.match(COORDINATE_TOKEN);
  if (!match) return null;
  const easting = parseFloat(match[1]);
  const northing = parseFloat(match[2]);
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  return { easting, northing };
}

const numberFrom = (token?: string): number | null => {
  if (token === undefined || token.trim() === '') return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
};

const selectionRequired = (cmd: ParsedCommand, ctx: CommandContext, command: string): CommandResult | null => {
  if (ctx.hasSelection !== false) return null;
  if (ctx.onAwaitSelection) {
    ctx.onAwaitSelection(cmd.raw, command);
    return {
      status: 'ok',
      message: `${command}: Select entities — left-click to pick, drag a window to box select, MMB to pan. Press Enter to apply, Esc to cancel.`,
    };
  }
  return {
    status: 'error',
    message: `${command}: Nothing selected. Use S, B, or ALL to select entities first.`,
  };
};

/**
 * Attempts to parse raw user text into verb, arguments, coordinates (E,N or X,Y), or numeric value.
 */
export function parseCanvasCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return { raw: '', verb: '', args: [] };
  }

  // Check for coordinate pair: "5000, 1000" or "5000.5,1000.25" or "5000 1000"
  const commaCoordMatch = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
  if (commaCoordMatch) {
    const e = parseFloat(commaCoordMatch[1]);
    const n = parseFloat(commaCoordMatch[2]);
    if (!Number.isNaN(e) && !Number.isNaN(n)) {
      return {
        raw: trimmed,
        verb: 'coordinate',
        args: [commaCoordMatch[1], commaCoordMatch[2]],
        coordinate: { easting: e, northing: n },
      };
    }
  }

  // Check for single pure numeric value (length/radius)
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed);
    if (!Number.isNaN(num)) {
      return {
        raw: trimmed,
        verb: 'numeric',
        args: [trimmed],
        numeric: num,
      };
    }
  }

  const tokens = trimmed.split(/\s+/);
  const rawVerb = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  // Check two-word alias like "key info" or "zoom extents"
  const twoWord = tokens.length >= 2 ? `${tokens[0]} ${tokens[1]}`.toLowerCase() : '';
  if (twoWord && COMMAND_ALIASES[twoWord]) {
    return {
      raw: trimmed,
      verb: COMMAND_ALIASES[twoWord],
      args: tokens.slice(2),
    };
  }

  const normalizedVerb = COMMAND_ALIASES[rawVerb] || rawVerb;
  return {
    raw: trimmed,
    verb: normalizedVerb,
    args,
  };
}

/** Validate and draw a rectangle from raw corner values. */
const applyRectangle = (args: string[], ctx: CommandContext): CommandResult => {
  const p1 = parseCoordinateToken(args[0]);
  const p2 = parseCoordinateToken(args[1]);
  if (!p1 || !p2) {
    return { status: 'error', message: 'RECTANG: Corners must be coordinate pairs (e.g. REC 0,0 100,60).' };
  }
  if (Math.abs(p2.easting - p1.easting) < 1e-9 || Math.abs(p2.northing - p1.northing) < 1e-9) {
    return { status: 'error', message: 'RECTANG: Corners must not share an X or Y coordinate.' };
  }
  const segments = ctx.onCreateRectangle?.(p1, p2) ?? 0;
  return {
    status: 'ok',
    message: `RECTANG: Created ${segments} segments (${args[0]} → ${args[1]}).`,
  };
};

/** Validate and draw a regular polygon from raw sides/center/radius values. */
const applyPolygon = (args: string[], ctx: CommandContext): CommandResult => {
  const sides = numberFrom(args[0]);
  const center = parseCoordinateToken(args[1]);
  const radius = numberFrom(args[2]);
  if (sides === null || !Number.isInteger(sides) || sides < 3 || sides > 256) {
    return { status: 'error', message: 'POLYGON: Sides must be a whole number from 3 to 256.' };
  }
  if (!center) {
    return { status: 'error', message: 'POLYGON: Center must be a coordinate pair (e.g. 0,0).' };
  }
  if (radius === null || radius <= 0) {
    return { status: 'error', message: 'POLYGON: Radius must be a positive number.' };
  }
  const segments = ctx.onCreatePolygon?.(sides, center, radius) ?? 0;
  return {
    status: 'ok',
    message: `POLYGON: Created a ${sides}-sided polygon (${segments} segments) about ${args[1]}.`,
  };
};

/** Validate and measure between two coordinate pairs. */
const applyDistance = (args: string[]): CommandResult => {
  const p1 = parseCoordinateToken(args[0]);
  const p2 = parseCoordinateToken(args[1]);
  if (!p1 || !p2) {
    return { status: 'error', message: 'DIST: Both points must be coordinate pairs (e.g. 0,0 and 100,50).' };
  }
  const dE = p2.easting - p1.easting;
  const dN = p2.northing - p1.northing;
  const distance = Math.hypot(dE, dN);
  const azimuth = ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360;
  return {
    status: 'info',
    message: `DIST: ΔE ${dE.toFixed(3)}, ΔN ${dN.toFixed(3)}, distance ${distance.toFixed(3)}, azimuth ${azimuth.toFixed(4)}°.`,
    links: [{ action: 'open-text-editor', label: 'Open in Text Editor' }],
  };
};

/** Hard ceiling shared by rectangular-array validation and its live preview. */
export const MAX_RECTANGULAR_ARRAY_ITEMS = 20_000;

/** Validate and run a rectangular array from raw field values. */
const applyRectangularArray = (args: string[], ctx: CommandContext): CommandResult => {
  const rows = args[0]?.trim() ? numberFrom(args[0]) : 1;
  const columns = args[1]?.trim() ? numberFrom(args[1]) : 1;
  const rowSpacing = args[2]?.trim() ? numberFrom(args[2]) : 0;
  const columnSpacing = args[3]?.trim() ? numberFrom(args[3]) : 0;
  const angleValue = args[4] !== undefined && args[4].trim() !== '' ? numberFrom(args[4]) : 0;
  if (angleValue === null) {
    return { status: 'error', message: 'ARRAY: Direction must be numeric degrees.' };
  }
  const angleDegrees = ((angleValue % 360) + 360) % 360;
  if (rows === null || columns === null || !Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1) {
    return { status: 'error', message: 'ARRAY: Rows and columns must be positive whole numbers.' };
  }
  if (rows * columns < 2) {
    return { status: 'error', message: 'ARRAY: A 1 × 1 array creates nothing. Use at least two rows or columns.' };
  }
  if (rows * columns > MAX_RECTANGULAR_ARRAY_ITEMS) {
    return { status: 'error', message: `ARRAY: Maximum ${MAX_RECTANGULAR_ARRAY_ITEMS.toLocaleString('en-US')} array items per command.` };
  }
  if (rowSpacing === null || columnSpacing === null) {
    return { status: 'error', message: 'ARRAY: Row and column spacing must be numeric.' };
  }
  if (Math.abs(rowSpacing) < 1e-12 && Math.abs(columnSpacing) < 1e-12) {
    return { status: 'error', message: 'ARRAY: At least one spacing must be non-zero.' };
  }
  const copies = ctx.onArraySelection?.(rows, columns, rowSpacing, columnSpacing, angleDegrees) ?? 0;
  return {
    status: 'ok',
    message: `ARRAY: ${rows} × ${columns} array at ${angleDegrees}° created ${copies} copies.`,
  };
};

/** Validate and run a polar array from raw field values. */
const applyPolarArray = (args: string[], ctx: CommandContext): CommandResult => {
  const count = args[0]?.trim() ? numberFrom(args[0]) : 6;
  const fillAngle = args[1]?.trim() ? numberFrom(args[1]) : 360;
  const center = args[2] ? parseCoordinateToken(args[2]) : undefined;
  if (count === null || !Number.isInteger(count) || count < 2 || count > 1000) {
    return { status: 'error', message: 'POLARARRAY: Count must be a whole number of 2 or more.' };
  }
  if (fillAngle === null || fillAngle <= 0 || fillAngle > 360) {
    return { status: 'error', message: 'POLARARRAY: Fill angle must be greater than 0 and at most 360 degrees.' };
  }
  if (args[2] && !center) {
    return { status: 'error', message: 'POLARARRAY: Center must be a coordinate pair (e.g. 0,0).' };
  }
  const copies = ctx.onPolarArraySelection?.(count, fillAngle, center) ?? 0;
  return {
    status: 'ok',
    message: center
      ? `POLARARRAY: ${count} items over ${fillAngle}° about ${args[2]} — created ${copies} copies.`
      : `POLARARRAY: ${count} items over ${fillAngle}° about the selection center — created ${copies} copies.`,
  };
};

export function executeCanvasCommand(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  if (!cmd.verb) {
    return { status: 'info', message: '' };
  }

  const args = cmd.args;

  switch (cmd.verb) {
    case 'line':
      ctx.onStartLine?.();
      return { status: 'ok', message: 'LINE: Specify next point or length [A for Arc, Esc to cancel]' };

    case 'circle':
      ctx.onStartCircle?.();
      return { status: 'ok', message: 'CIRCLE: Specify center point or [T] for TTR [Esc to cancel]' };

    case 'select':
      ctx.onToggleSelection?.();
      return { status: 'ok', message: 'SELECT: Click lines to select/deselect [B for Box, D/Del to remove]' };

    case 'box':
      ctx.onToggleBoxSelect?.();
      return { status: 'ok', message: 'BOX SELECT: Drag rectangular window across entities' };

    case 'trim':
      ctx.onStartTrim?.();
      return { status: 'ok', message: 'TRIM: Click segments to cut at intersections [Esc to exit]' };

    case 'extend':
      ctx.onStartExtend?.();
      return { status: 'ok', message: 'EXTEND: Click a line to extend it to the boundary [Esc to exit]' };

    case 'copy': {
      const blocked = selectionRequired(cmd, ctx, 'COPY');
      if (blocked) return blocked;
      ctx.onStartCopy?.();
      return { status: 'ok', message: 'COPY: Specify base point [Esc to exit]' };
    }

    case 'offset': {
      if (args.length > 0) {
        const parsedDistance = Number(args[0]);
        if (!Number.isFinite(parsedDistance) || parsedDistance <= 0) {
          return { status: 'error', message: 'OFFSET: Enter a positive numeric distance (e.g. OS 5).' };
        }
        ctx.onStartOffset?.(parsedDistance);
        return {
          status: 'ok',
          message: `OFFSET: Distance ${parsedDistance}. Select a line, polyline, arc or circle to offset [Esc to exit]`,
        };
      }
      ctx.onStartOffset?.();
      return { status: 'ok', message: 'OFFSET: Specify offset distance (type a number) [Esc to exit]' };
    }

    case 'rectangle': {
      if (args.length > 2) {
        return {
          status: 'error',
          message: 'RECTANG: Type REC x1,y1 x2,y2 — opposite corners (e.g. REC 0,0 100,60).',
        };
      }
      if (args.length < 2) {
        if (ctx.onPrompt) {
          ctx.onPrompt({
            id: 'rectangle',
            title: 'Rectangle',
            hint: 'Opposite corners — type here or on the command line.',
            fields: [
              { key: 'p1', shortLabel: 'CORNER 1', label: 'Corner 1', kind: 'point', unit: 'E,N', placeholder: '0,0' },
              { key: 'p2', shortLabel: 'CORNER 2', label: 'Corner 2', kind: 'point', unit: 'E,N', placeholder: '100,60' },
            ],
            initialValues: { p1: args[0] ?? '', p2: args[1] ?? '' },
            submit: values => applyRectangle([values.p1 ?? '', values.p2 ?? ''], ctx),
          });
          return {
            status: 'info',
            message: 'RECTANG: Set both opposite corners in the arrow pad or on the command line, then press Enter.',
          };
        }
        return {
          status: 'error',
          message: 'RECTANG: Type REC x1,y1 x2,y2 — opposite corners (e.g. REC 0,0 100,60).',
        };
      }
      return applyRectangle(args, ctx);
    }

    case 'polygon': {
      if (args.length > 3) {
        return {
          status: 'error',
          message: 'POLYGON: Type POL sides centerX,centerY radius — e.g. POL 6 0,0 50.',
        };
      }
      if (args.length < 3) {
        const sidesValue = args[0]?.trim() ? numberFrom(args[0]) : undefined;
        if (sidesValue !== undefined && (sidesValue === null || !Number.isInteger(sidesValue) || sidesValue < 3 || sidesValue > 256)) {
          return { status: 'error', message: 'POLYGON: Sides must be a whole number from 3 to 256.' };
        }
        const centerValue = args[1]?.trim() ? parseCoordinateToken(args[1]) : undefined;
        if (args[1]?.trim() && !centerValue) {
          return { status: 'error', message: 'POLYGON: Center must be a coordinate pair (e.g. 0,0).' };
        }
        if (!ctx.onStartPolygon) {
          return { status: 'error', message: 'POLYGON: Interactive polygon mode is unavailable.' };
        }
        const sides = sidesValue ?? undefined;
        ctx.onStartPolygon(sides, centerValue ?? undefined);
        return {
          status: 'ok',
          message: centerValue
            ? `POLYGON: ${sides ?? 6} sides about ${args[1]} — drag, click, or type the diameter; scroll or [ ] changes sides [Esc cancels]`
            : 'POLYGON: Pick the center, then drag, click, or type the diameter [scroll or [ ] changes sides, Esc cancels]',
        };
      }
      return applyPolygon(args, ctx);
    }

    case 'array': {
      const blocked = selectionRequired(cmd, ctx, 'ARRAY');
      if (blocked) return blocked;
      if (args.length > 5) {
        return { status: 'error', message: 'ARRAY: Type AR rows columns rowSpacing columnSpacing [angle] — e.g. AR 3 4 20 15 30.' };
      }
      if (args.length < 4) {
        if (ctx.onPrompt) {
          const unit = ctx.linearUnitLabel;
          ctx.onPrompt({
            id: 'array',
            title: 'Rectangular array',
            hint: 'Rows, columns, spacing and direction. Type here or on the command line.',
            fields: [
              // X first: a user can enter one axis and apply without having to
              // visit the unused axis fields.
              { key: 'columns', shortLabel: 'COLS', label: 'Columns', kind: 'number', integer: true, min: 1, placeholder: '3' },
              { key: 'columnSpacing', shortLabel: 'COL SP', label: 'Column spacing', kind: 'number', unit, placeholder: '20' },
              { key: 'rows', shortLabel: 'ROWS', label: 'Rows', kind: 'number', integer: true, min: 1, placeholder: '3' },
              { key: 'rowSpacing', shortLabel: 'ROW SP', label: 'Row spacing', kind: 'number', unit, placeholder: '20' },
              { key: 'angle', shortLabel: 'DIR', label: 'Direction', kind: 'number', unit: '°', placeholder: '0' },
            ],
            initialValues: {
              rows: args[0] ?? '1',
              columns: args[1] ?? '1',
              rowSpacing: args[2] ?? '0',
              columnSpacing: args[3] ?? '0',
              angle: args[4] ?? '0',
            },
            submit: values => applyRectangularArray([
              values.rows ?? '',
              values.columns ?? '',
              values.rowSpacing ?? '',
              values.columnSpacing ?? '',
              values.angle ?? '0',
            ], ctx),
          });
          return {
            status: 'info',
            message: 'ARRAY: Set rows, columns, spacing and direction on the X/Y manipulator or type values on the command line, then press Enter.',
          };
        }
        return {
          status: 'error',
          message: 'ARRAY: Type AR rows columns rowSpacing columnSpacing [angle] — e.g. AR 3 4 20 15 30.',
        };
      }
      return applyRectangularArray(args, ctx);
    }

    case 'polar_array': {
      const blocked = selectionRequired(cmd, ctx, 'POLARARRAY');
      if (blocked) return blocked;
      if (args.length > 3) {
        return {
          status: 'error',
          message: 'POLARARRAY: Type PA count fillAngle [centerX,centerY] — e.g. PA 8 360 or PA 6 180 0,0.',
        };
      }
      if (args.length < 2) {
        if (ctx.onPrompt) {
          ctx.onPrompt({
            id: 'polar_array',
            title: 'Polar array',
            hint: 'Use PICK on the widget to choose a free point, entity snap or survey point as the rotation center; blank uses the selection center.',
            fields: [
              { key: 'count', shortLabel: 'ITEMS', label: 'Items', kind: 'number', integer: true, min: 2, max: 1000, placeholder: '6' },
              { key: 'fillAngle', shortLabel: 'FILL°', label: 'Fill angle', kind: 'number', min: 1, max: 360, unit: '°', placeholder: '360' },
              { key: 'center', shortLabel: 'CENTER', label: 'Center', kind: 'point', unit: 'E,N', placeholder: 'optional' },
            ],
            initialValues: {
              count: args[0] ?? '6',
              fillAngle: args[1] ?? '360',
              center: args[2] ?? '',
            },
            submit: values => {
              const center = (values.center ?? '').trim();
              return applyPolarArray([
                values.count ?? '',
                values.fillAngle ?? '',
                ...(center ? [center] : []),
              ], ctx);
            },
          });
          return {
            status: 'info',
            message: 'POLARARRAY: Drag the ring dot for the fill angle, set the item count, or press PICK to choose the rotation center on the canvas (free point, entity snap or survey point). Type values on the command line, then press Enter.',
          };
        }
        return {
          status: 'error',
          message: 'POLARARRAY: Type PA count fillAngle [centerX,centerY] — e.g. PA 8 360 or PA 6 180 0,0.',
        };
      }
      return applyPolarArray(args, ctx);
    }

    case 'move': {
      const blocked = selectionRequired(cmd, ctx, 'MOVE');
      if (blocked) return blocked;
      // Bare M starts the click flow: base point, then destination.
      if (args.length === 0 && ctx.onStartMove) {
        ctx.onStartMove();
        return { status: 'ok', message: 'MOVE: Specify base point — click, snap, or type E,N [Esc to cancel]' };
      }
      let dx: number | null = null;
      let dy: number | null = null;
      if (args.length === 1) {
        const point = parseCoordinateToken(args[0]);
        if (point) {
          dx = point.easting;
          dy = point.northing;
        }
      } else if (args.length === 2) {
        dx = numberFrom(args[0]);
        dy = numberFrom(args[1]);
      }
      if (dx === null || dy === null || (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12)) {
        return { status: 'error', message: 'MOVE: Type M dx,dy (or M dx dy) for a non-zero displacement.' };
      }
      const moved = ctx.onMoveSelection?.(dx, dy) ?? 0;
      return { status: 'ok', message: `MOVE: Moved ${moved} entities by ${dx}, ${dy}.` };
    }

    case 'rotate': {
      const blocked = selectionRequired(cmd, ctx, 'ROTATE');
      if (blocked) return blocked;
      // Bare RO starts the interactive flow: pick a base point, then click a
      // point or type the angle. RO angle keeps the one-shot typed form.
      if (args.length === 0 && ctx.onStartRotate) {
        ctx.onStartRotate();
        return {
          status: 'ok',
          message: 'ROTATE: Specify base point — click, snap, or type E,N [Esc to cancel]',
        };
      }
      if (args.length < 1 || args.length > 2) {
        return { status: 'error', message: 'ROTATE: Type RO angle [pivotX,pivotY] — e.g. RO 45, or type RO alone to pick the base point.' };
      }
      const angle = numberFrom(args[0]);
      const pivot = args[1] ? parseCoordinateToken(args[1]) : undefined;
      if (angle === null) {
        return { status: 'error', message: 'ROTATE: Angle must be numeric degrees (counter-clockwise positive).' };
      }
      if (args[1] && !pivot) {
        return { status: 'error', message: 'ROTATE: Pivot must be a coordinate pair (e.g. 0,0).' };
      }
      const rotated = ctx.onRotateSelection?.(angle, pivot) ?? 0;
      return {
        status: 'ok',
        message: pivot
          ? `ROTATE: Rotated ${rotated} entities ${angle}° about ${args[1]}.`
          : `ROTATE: Rotated ${rotated} entities ${angle}° about the selection center.`,
      };
    }

    case 'scale': {
      const blocked = selectionRequired(cmd, ctx, 'SCALE');
      if (blocked) return blocked;
      // Bare SC starts the click flow: reference point, then a clicked point or typed factor.
      if (args.length === 0 && ctx.onStartScale) {
        ctx.onStartScale();
        return { status: 'ok', message: 'SCALE: Specify reference point — click, snap, or type E,N [Esc to cancel]' };
      }
      if (args.length < 1 || args.length > 2) {
        return { status: 'error', message: 'SCALE: Type SC factor [pivotX,pivotY] — e.g. SC 2 or SC 0.5 0,0.' };
      }
      const factor = numberFrom(args[0]);
      const pivot = args[1] ? parseCoordinateToken(args[1]) : undefined;
      if (factor === null || factor <= 0) {
        return { status: 'error', message: 'SCALE: Factor must be a positive number.' };
      }
      if (args[1] && !pivot) {
        return { status: 'error', message: 'SCALE: Pivot must be a coordinate pair (e.g. 0,0).' };
      }
      const scaled = ctx.onScaleSelection?.(factor, pivot) ?? 0;
      return {
        status: 'ok',
        message: pivot
          ? `SCALE: Scaled ${scaled} entities by ${factor} about ${args[1]}.`
          : `SCALE: Scaled ${scaled} entities by ${factor} about the selection center.`,
      };
    }

    case 'mirror': {
      const blocked = selectionRequired(cmd, ctx, 'MIRROR');
      if (blocked) return blocked;
      // Bare MI starts the click flow: first axis point, then second.
      if (args.length === 0 && ctx.onStartMirror) {
        ctx.onStartMirror();
        return { status: 'ok', message: 'MIRROR: Specify first axis point — click, snap, or type E,N [Esc to cancel]' };
      }
      if (args.length !== 2) {
        return { status: 'error', message: 'MIRROR: Type MI x1,y1 x2,y2 — the mirror axis endpoints.' };
      }
      const p1 = parseCoordinateToken(args[0]);
      const p2 = parseCoordinateToken(args[1]);
      if (!p1 || !p2) {
        return { status: 'error', message: 'MIRROR: Axis endpoints must be coordinate pairs (e.g. MI 0,0 100,0).' };
      }
      if (Math.hypot(p2.easting - p1.easting, p2.northing - p1.northing) < 1e-9) {
        return { status: 'error', message: 'MIRROR: Axis endpoints must be different points.' };
      }
      const mirrored = ctx.onMirrorSelection?.(p1, p2) ?? 0;
      return { status: 'ok', message: `MIRROR: Mirrored ${mirrored} entities across ${args[0]} → ${args[1]}.` };
    }

    case 'join': {
      const blocked = selectionRequired(cmd, ctx, 'JOIN');
      if (blocked) return blocked;
      const joined = ctx.onJoinSelection?.() ?? 0;
      return { status: 'ok', message: `JOIN: Connected ${joined} entities into one polyline.` };
    }

    case 'explode': {
      const blocked = selectionRequired(cmd, ctx, 'EXPLODE');
      if (blocked) return blocked;
      const exploded = ctx.onExplodeSelection?.() ?? 0;
      return { status: 'ok', message: `EXPLODE: Released ${exploded} entities from their polylines.` };
    }

    case 'erase': {
      const blocked = selectionRequired(cmd, ctx, 'ERASE');
      if (blocked) return blocked;
      const erased = ctx.onEraseSelection?.() ?? 0;
      return { status: 'ok', message: `ERASE: Removed ${erased} entities.` };
    }

    case 'select_all': {
      const count = ctx.onSelectAll?.() ?? ctx.selectionCount ?? 0;
      return {
        status: 'ok',
        message: `SELECT ALL: ${count} entities selected.`,
        links: ctx.onOpenProperties ? [{ action: 'open-properties', label: 'Open Properties' }] : undefined,
      };
    }

    case 'deselect':
      ctx.onDeselectAll?.();
      return { status: 'ok', message: 'DESELECT: Selection cleared.' };

    case 'distance': {
      if (args.length > 2) {
        return { status: 'error', message: 'DIST: Type DI x1,y1 x2,y2 — e.g. DI 0,0 100,50.' };
      }
      if (args.length < 2) {
        if (ctx.onPrompt) {
          ctx.onPrompt({
            id: 'distance',
            title: 'Distance',
            hint: 'Two E,N points — the result opens in the readout.',
            fields: [
              { key: 'p1', shortLabel: 'POINT 1', label: 'Point 1', kind: 'point', unit: 'E,N', placeholder: '0,0' },
              { key: 'p2', shortLabel: 'POINT 2', label: 'Point 2', kind: 'point', unit: 'E,N', placeholder: '100,50' },
            ],
            initialValues: { p1: args[0] ?? '', p2: args[1] ?? '' },
            submit: values => applyDistance([values.p1 ?? '', values.p2 ?? '']),
          });
          return {
            status: 'info',
            message: 'DIST: Set both points in the arrow pad or on the command line, then press Enter.',
          };
        }
        return { status: 'error', message: 'DIST: Type DI x1,y1 x2,y2 — e.g. DI 0,0 100,50.' };
      }
      return applyDistance(args);
    }

    case 'properties':
      if (!ctx.onOpenProperties) {
        return { status: 'error', message: 'PROPERTIES: The properties panel is not available in this view.' };
      }
      ctx.onOpenProperties();
      return { status: 'ok', message: 'PROPERTIES: Opened the selection properties panel.' };

    case 'ortho':
      ctx.onToggleOrtho?.();
      return { status: 'ok', message: 'ORTHO: Toggled' };

    case 'inclusion':
      ctx.onStartInclusion?.();
      return { status: 'ok', message: 'INCLUSION: Drawing boundary polygon [Enter to close, Esc to cancel]' };

    case 'undo':
      ctx.onUndo?.();
      return { status: 'ok', message: 'UNDO: Reverted last change' };

    case 'redo':
      ctx.onRedo?.();
      return { status: 'ok', message: 'REDO: Reapplied change' };

    case 'zoom_extents':
      ctx.onZoomExtents?.();
      return { status: 'ok', message: 'ZOOM EXTENTS: View adjusted to fit drawing bounds' };

    case 'key_info':
      if (ctx.keyInfo) {
        return {
          status: 'ok',
          message: `KEY STATUS: ${ctx.keyInfo.label} — ${ctx.keyInfo.detail}`,
        };
      }
      ctx.onOpenKeyModal?.();
      return { status: 'info', message: 'KEY: Opening access & API key modal...' };

    case 'cancel':
      ctx.onCancel?.();
      return { status: 'info', message: 'Command cancelled' };

    case 'clear':
      ctx.onClear?.();
      return { status: 'ok', message: 'Terminal cleared' };

    case 'numeric':
      if (cmd.numeric !== undefined && ctx.onNumericInput) {
        ctx.onNumericInput(cmd.numeric);
        return { status: 'ok', message: `Input: ${cmd.numeric}` };
      }
      return { status: 'info', message: `Number: ${cmd.numeric}` };

    case 'coordinate':
      if (cmd.coordinate && ctx.onCoordinateInput) {
        ctx.onCoordinateInput(cmd.coordinate);
        return {
          status: 'ok',
          message: `Point at E: ${cmd.coordinate.easting}, N: ${cmd.coordinate.northing}`,
        };
      }
      return {
        status: 'info',
        message: `Coordinate E: ${cmd.coordinate?.easting}, N: ${cmd.coordinate?.northing}`,
      };

    case 'help':
      return {
        status: 'info',
        message: [
          'Commands:',
          'DRAW — L/PLINE (line), C (circle), REC (rectangle), POL (polygon: click center, drag/type radius, scroll or [ ] sides), P (point), I (inclusion).',
          'MODIFY — S (select), B (box), T (trim), EX (extend), CP (copy), OS (offset [distance]), M (move — bare M picks a snapped base point and destination with a live ghost preview, M dx,dy moves immediately), RO / R (rotate — bare RO or the R key picks a base point with snaps and a live ghost preview, then takes a clicked point or typed angle (Shift snaps to 15°); RO angle [pivot] rotates immediately), SC (scale — bare SC picks a snapped reference point with a live ghost preview, then takes a clicked point or typed factor; SC factor [pivot] scales immediately), MI (mirror — bare MI picks two snapped axis points with a live ghost preview, MI x1,y1 x2,y2 mirrors immediately), J (join), X (explode), E (erase).',
          'ARRAYS — AR rows cols rowSpacing colSpacing (rectangular), PA count fillAngle [center] (polar; default selection center). Typing bare AR opens a UCS-style X/Y manipulator: drag a handle for spacing, Shift-drag for quantity, Alt-drag for span, or type any value. The direction ring sets the array angle. The unused axis keeps its preloaded 1 quantity / 0 spacing, so you only enter the axis you need. Typing bare PA opens the compact ring manipulator.',
          'SELECTION — run a modify/array command with nothing selected and it waits for picks: left-click entities, drag a window to box select, MMB pans, Enter applies, Esc cancels.',
          'UTILITY — ZE (zoom extents), U (undo), REDO, ALL (select all), DS (deselect), DI x1,y1 x2,y2 (distance), KEY, CLEAR, PROP / PROPERTIES (selection properties panel).',
          'Coords are E,N (feet). Typed distances/radii/spacings use the current linear unit; angles are degrees, counter-clockwise positive.',
          'LINKS — use the buttons after a result to open it in the Text Editor, open the Properties panel, or copy it.',
        ].join('\n'),
        links: [{ action: 'open-text-editor', label: 'Open in Text Editor' }],
        helpGroups: HELP_GROUPS,
        helpNotes: HELP_NOTES,
      };

    default:
      return {
        status: 'error',
        message: `Unknown command "${cmd.raw}". Type HELP for available commands.`,
      };
  }
}
