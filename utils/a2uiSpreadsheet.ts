import type {
  A2UIPayload,
  A2UISpreadsheetColumn,
  A2UISpreadsheetRow,
  A2UISpreadsheetSpec,
  A2UISpreadsheetValue,
  PointList,
} from '../types.ts';

export const POINT_LIST_COLUMNS: A2UISpreadsheetColumn[] = [
  { key: 'list', label: 'List', width: 140 },
  { key: 'pointNumber', label: 'Point #', width: 90 },
  { key: 'northing', label: 'Northing', width: 120, align: 'right' },
  { key: 'easting', label: 'Easting', width: 120, align: 'right' },
  { key: 'elevation', label: 'Elevation', width: 100, align: 'right' },
  { key: 'description', label: 'Description', width: 240 },
];

/** Normalize the loose column shapes agents send in `open_spreadsheet`. */
export function normalizeSpreadsheetColumns(raw: unknown): A2UISpreadsheetColumn[] {
  if (!Array.isArray(raw)) return [];
  const usedKeys = new Set<string>();
  const columns: A2UISpreadsheetColumn[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const label = entry.trim() || `Column ${index + 1}`;
      let key = label;
      while (usedKeys.has(key)) key = `${key}_${index + 1}`;
      usedKeys.add(key);
      columns.push({ key, label });
      return;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const value = entry as Record<string, unknown>;
    const label =
      typeof value.label === 'string' && value.label.trim()
        ? value.label.trim()
        : typeof value.key === 'string' && value.key.trim()
          ? value.key.trim()
          : `Column ${index + 1}`;
    let key = typeof value.key === 'string' && value.key.trim() ? value.key.trim() : label;
    while (usedKeys.has(key)) key = `${key}_${index + 1}`;
    usedKeys.add(key);
    const align =
      value.align === 'right' || value.align === 'center' || value.align === 'left'
        ? value.align
        : undefined;
    const width = typeof value.width === 'number' && Number.isFinite(value.width)
      ? Math.min(600, Math.max(48, value.width))
      : undefined;
    columns.push({ key, label, align, width });
  });
  return columns;
}

/** Normalize row arrays or row objects against the final column keys. */
export function normalizeSpreadsheetRows(
  raw: unknown,
  columns: A2UISpreadsheetColumn[],
): A2UISpreadsheetRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: A2UISpreadsheetRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const source = entry as Record<string, unknown>;
    const row: A2UISpreadsheetRow = {};
    columns.forEach((column, index) => {
      const value = source[column.key] ?? source[column.label] ?? (Array.isArray(entry) ? entry[index] : undefined);
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        row[column.key] = value;
      }
    });
    rows.push(row);
  }
  return rows;
}

/** Build the data model shared by a model-emitted `open_spreadsheet` payload. */
export function buildAgentSpreadsheetSpec(raw: unknown): A2UISpreadsheetSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const columns = normalizeSpreadsheetColumns(input.columns);
  if (columns.length === 0) return null;
  const rows = normalizeSpreadsheetRows(input.rows, columns);
  const title = typeof input.title === 'string' && input.title.trim()
    ? input.title.trim()
    : 'Agent Spreadsheet';
  const fallbackFileName = `${title.replace(/[^a-z0-9]+/gi, ' ').trim() || 'spreadsheet'}.csv`;
  const rawPageSize = typeof input.pageSize === 'number' && Number.isFinite(input.pageSize)
    ? Math.min(1000, Math.max(10, input.pageSize))
    : undefined;
  return {
    title,
    description: typeof input.description === 'string' ? input.description : undefined,
    fileName:
      typeof input.fileName === 'string' && input.fileName.trim()
        ? input.fileName.trim()
        : fallbackFileName,
    columns,
    rows,
    editable: input.editable !== false,
    pageSize: rawPageSize,
  };
}

/**
 * Build an inline A2UI spreadsheet payload with both the editable text view and
 * searchable sheet view. Model responses that emit `open_spreadsheet` as JSON
 * use this so the payload never leaks into the chat as raw text.
 */
export function buildSpreadsheetA2UIPayload(
  agent: A2UIPayload['agent'],
  raw: unknown,
): A2UIPayload | null {
  const spreadsheet = buildAgentSpreadsheetSpec(raw);
  if (!spreadsheet) return null;
  return {
    kind: 'spreadsheet',
    agent,
    widgetType: 'spreadsheet',
    status: 'expanded',
    spreadsheet,
    textEditor: {
      fileName: spreadsheet.fileName,
      content: spreadsheetToCsv(spreadsheet),
      mode: 'edit',
    },
  };
}

function escapeCsvValue(value: A2UISpreadsheetValue | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Convert a spreadsheet spec to CSV using its column order and labels. */
export function spreadsheetToCsv(spec: A2UISpreadsheetSpec): string {
  const lines = [
    spec.columns.map(column => escapeCsvValue(column.label)).join(','),
    ...spec.rows.map(row =>
      spec.columns.map(column => escapeCsvValue(row[column.key])).join(','),
    ),
  ];
  return lines.join('\n');
}

/** Convert a spreadsheet spec to TSV for clipboard paste into Excel / Sheets. */
export function spreadsheetToTsv(spec: A2UISpreadsheetSpec): string {
  const clean = (value: A2UISpreadsheetValue | undefined) =>
    value === null || value === undefined
      ? ''
      : String(value).replace(/[\t\r\n]+/g, ' ');
  const lines = [
    spec.columns.map(column => clean(column.label)).join('\t'),
    ...spec.rows.map(row =>
      spec.columns.map(column => clean(row[column.key])).join('\t'),
    ),
  ];
  return lines.join('\n');
}

export interface PointListSurfaceData {
  fileName: string;
  pointCount: number;
  listCount: number;
  textContent: string;
  spreadsheet: A2UISpreadsheetSpec;
}

/**
 * Build the text and spreadsheet representations of the live point database
 * used by the in-chat A2UI surface. Both views share the same rows.
 */
export function buildPointListSurfaceData(pointLists: PointList[]): PointListSurfaceData {
  const rows: A2UISpreadsheetRow[] = pointLists.flatMap(list =>
    list.points.map(point => ({
      list: list.name,
      pointNumber: point.pointNumber,
      northing: point.northing,
      easting: point.easting,
      elevation: point.elevation ?? '',
      description: point.description ?? '',
    })),
  );
  const fileName = 'Project Points.csv';
  const spreadsheet: A2UISpreadsheetSpec = {
    title: 'Project Points',
    description: `${rows.length} point${rows.length === 1 ? '' : 's'} across ${
      pointLists.length
    } point list${pointLists.length === 1 ? '' : 's'}. Search, copy, or download the grid.`,
    fileName,
    columns: POINT_LIST_COLUMNS.map(column => ({ ...column })),
    rows,
    editable: false,
    pageSize: 100,
  };

  return {
    fileName,
    pointCount: rows.length,
    listCount: pointLists.length,
    textContent: spreadsheetToCsv(spreadsheet),
    spreadsheet,
  };
}

/** Empty scratch sheet used by the generic A2UI spreadsheet catalog entry. */
export function createBlankSpreadsheetSpec(): A2UISpreadsheetSpec {
  const columns = ['A', 'B', 'C', 'D', 'E', 'F'].map(key => ({
    key,
    label: key,
    width: 140,
  }));
  return {
    title: 'Spreadsheet',
    description: 'A lightweight scratch grid. Edit cells, copy as TSV, or download as CSV.',
    fileName: 'Spreadsheet.csv',
    columns,
    rows: [{}],
    editable: true,
    pageSize: 50,
  };
}
