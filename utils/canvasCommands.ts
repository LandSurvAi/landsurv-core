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
  onStartLine?: () => void;
  onStartCircle?: () => void;
  onStartInclusion?: () => void;
  onToggleOrtho?: () => void;
  onToggleSelection?: () => void;
  onToggleBoxSelect?: () => void;
  onStartTrim?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomExtents?: () => void;
  onOpenSettings?: () => void;
  onOpenKeyModal?: () => void;
  onClear?: () => void;
  onCancel?: () => void;
  onNumericInput?: (value: number) => void;
  onCoordinateInput?: (point: { easting: number; northing: number }) => void;
  keyInfo?: {
    label: string;
    detail: string;
    tone?: string;
  };
}

export interface CommandResult {
  status: 'ok' | 'info' | 'error';
  message: string;
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
  o: 'ortho',
  ortho: 'ortho',
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

export function executeCanvasCommand(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  if (!cmd.verb) {
    return { status: 'info', message: '' };
  }

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
        message: 'Commands: L (line), C (circle), S (select), B (box), T (trim), O (ortho), I (inclusion), ZE (zoom extents), U (undo), REDO, KEY (info/status), CLEAR. Coords: E,N. Numbers: segment length / circle radius.',
      };

    default:
      return {
        status: 'error',
        message: `Unknown command "${cmd.raw}". Type HELP for available commands.`,
      };
  }
}
