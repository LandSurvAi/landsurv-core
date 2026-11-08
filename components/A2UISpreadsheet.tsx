import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  A2UISpreadsheetColumn,
  A2UISpreadsheetRow,
  A2UISpreadsheetSpec,
} from '../types.ts';
import { spreadsheetToCsv, spreadsheetToTsv } from '../utils/a2uiSpreadsheet.ts';

export interface A2UISpreadsheetProps {
  spec: A2UISpreadsheetSpec;
  onChange?: (rows: A2UISpreadsheetRow[], spec: A2UISpreadsheetSpec) => void;
}

const alignClass = (column: A2UISpreadsheetColumn) =>
  column.align === 'right'
    ? 'text-right'
    : column.align === 'center'
      ? 'text-center'
      : 'text-left';

const cellText = (value: A2UISpreadsheetRow[string]) =>
  value === null || value === undefined ? '' : String(value);

export const A2UISpreadsheet: React.FC<A2UISpreadsheetProps> = ({ spec, onChange }) => {
  const [rows, setRows] = useState<A2UISpreadsheetRow[]>(() =>
    spec.rows.map(row => ({ ...row })),
  );
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const editable = spec.editable ?? true;
  const pageSize = Math.max(1, spec.pageSize ?? 100);

  useEffect(() => {
    setRows(spec.rows.map(row => ({ ...row })));
    setQuery('');
    setPage(0);
  }, [spec]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (!needle) return true;
        return spec.columns.some(column =>
          cellText(row[column.key]).toLowerCase().includes(needle),
        );
      });
  }, [query, rows, spec.columns]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const updateRows = (next: A2UISpreadsheetRow[]) => {
    setRows(next);
    onChange?.(next, { ...spec, rows: next });
  };

  const updateCell = (rowIndex: number, key: string, value: string) => {
    if (!editable) return;
    const next = rows.map((row, index) =>
      index === rowIndex ? { ...row, [key]: value } : row,
    );
    updateRows(next);
  };

  const addRow = () => {
    if (!editable) return;
    const blank: A2UISpreadsheetRow = {};
    for (const column of spec.columns) blank[column.key] = '';
    const next = [...rows, blank];
    updateRows(next);
    setPage(Math.floor(rows.length / pageSize));
  };

  const deleteRow = (rowIndex: number) => {
    if (!editable) return;
    updateRows(rows.filter((_, index) => index !== rowIndex));
  };

  const copyTsv = async () => {
    const text = spreadsheetToTsv({ ...spec, rows });
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([spreadsheetToCsv({ ...spec, rows })], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${spec.fileName?.replace(/\.[^.]+$/, '') || 'spreadsheet'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      data-testid="a2ui-spreadsheet"
      className="flex h-full min-h-0 flex-col bg-[#070e18]/90 text-slate-200"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white">
            {spec.title || 'Spreadsheet'}
          </p>
          {spec.description && (
            <p className="truncate text-[10px] text-slate-400">{spec.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
            <input
              data-testid="a2ui-spreadsheet-search"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Search"
              aria-label="Search spreadsheet"
              className="h-7 w-36 rounded border border-white/10 bg-black/30 pl-7 pr-2 text-[11px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={copyTsv}
            aria-label="Copy spreadsheet as TSV"
            className="inline-flex h-7 items-center gap-1 rounded border border-white/10 px-2 text-[10px] font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <Copy className="h-3 w-3" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            aria-label="Download spreadsheet as CSV"
            className="inline-flex h-7 items-center gap-1 rounded border border-white/10 px-2 text-[10px] font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
          {editable && (
            <button
              type="button"
              onClick={addRow}
              aria-label="Add spreadsheet row"
              className="inline-flex h-7 items-center gap-1 rounded border border-cyan-400/30 bg-cyan-400/10 px-2 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-400/20"
            >
              <Plus className="h-3 w-3" />
              Row
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table data-testid="a2ui-spreadsheet-table" className="w-full min-w-max border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-[#0b1626]">
            <tr>
              {spec.columns.map(column => (
                <th
                  key={column.key}
                  style={{ minWidth: column.width ?? 120 }}
                  className={`border-b border-r border-white/[0.06] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400 last:border-r-0 ${alignClass(column)}`}
                >
                  {column.label}
                </th>
              ))}
              {editable && <th className="w-8 border-b border-white/[0.06]" />}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, index }) => (
              <tr key={index} className="group hover:bg-white/[0.025]">
                {spec.columns.map(column => (
                  <td
                    key={column.key}
                    className={`border-b border-r border-white/[0.04] p-0 last:border-r-0 ${alignClass(column)}`}
                  >
                    {editable ? (
                      <input
                        value={cellText(row[column.key])}
                        onChange={event => updateCell(index, column.key, event.target.value)}
                        aria-label={`Cell ${index + 1} ${column.label}`}
                        className={`w-full bg-transparent px-2 py-1 text-[11px] text-slate-200 focus:bg-cyan-400/5 focus:outline-none ${alignClass(column)}`}
                      />
                    ) : (
                      <span className="block px-2 py-1">{cellText(row[column.key])}</span>
                    )}
                  </td>
                ))}
                {editable && (
                  <td className="border-b border-white/[0.04] text-center">
                    <button
                      type="button"
                      onClick={() => deleteRow(index)}
                      aria-label={`Delete row ${index + 1}`}
                      className="rounded p-1 text-slate-600 opacity-0 transition-opacity hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={spec.columns.length + (editable ? 1 : 0)}
                  className="px-3 py-8 text-center text-[11px] text-slate-500"
                >
                  {rows.length === 0 ? 'No rows yet.' : 'No rows match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-slate-500">
        <span>
          {filteredRows.length === rows.length
            ? `${rows.length} row${rows.length === 1 ? '' : 's'}`
            : `${filteredRows.length} of ${rows.length} rows`}
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              aria-label="Previous spreadsheet page"
              className="rounded border border-white/10 p-1 text-slate-300 disabled:opacity-30"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span>
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Next spreadsheet page"
              className="rounded border border-white/10 p-1 text-slate-300 disabled:opacity-30"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span>{pageSize} per page</span>
        )}
      </div>
    </div>
  );
};

export default A2UISpreadsheet;
