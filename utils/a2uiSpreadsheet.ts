import type {
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
