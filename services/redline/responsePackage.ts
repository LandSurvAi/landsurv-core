/**
 * Redline Agent — built-in response package.
 *
 * The default adapter produces a ZIP containing:
 *   - response-letter.pdf — reviewer-facing disposition table and revision block
 *   - manifest.json       — machine-readable integration contract
 *   - source/<pdf>        — the original marked-up package, when still available
 *
 * This is deliberately a local, browser-side artifact. No run data is uploaded.
 */

import jsPDF from 'jspdf';
import JSZip from 'jszip';
import type {
  RedlineResponseManifest,
  RedlineResponsePackage,
  RedlineRun,
  SessionFile,
} from '../../types';

const PAGE_BOTTOM = 10.35;
const LEFT = 0.5;
const CONTENT_WIDTH = 7.5;
const LINE_HEIGHT = 0.12;

function safeFilePart(value: string, fallback: string): string {
  return (value || fallback)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || fallback;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

function buildResponseLetter(run: RedlineRun, manifest: RedlineResponseManifest): Uint8Array {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.setProperties({
    title: `Redline Response — ${run.revision.assignedRevision}`,
    subject: `Redline worklist response record for ${run.id}`,
    author: 'LandSurv.ai Redline Agent',
    creator: 'LandSurv.ai',
  });

  let y = 0.48;
  const ensureSpace = (needed: number) => {
    if (y + needed <= PAGE_BOTTOM) return;
    pdf.addPage();
    y = 0.55;
  };
  const text = (
    value: string,
    size = 8,
    style: 'normal' | 'bold' | 'italic' = 'normal',
    color = 45,
  ) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
    const lines = pdf.splitTextToSize(value, CONTENT_WIDTH) as string[];
    ensureSpace(Math.max(0.16, lines.length * LINE_HEIGHT));
    pdf.text(lines, LEFT, y);
    y += lines.length * LINE_HEIGHT;
  };
  const rule = () => {
    ensureSpace(0.1);
    pdf.setDrawColor(180);
    pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
    y += 0.1;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(25);
  pdf.text('REDLINE RESPONSE RECORD', LEFT, y);
  y += 0.25;
  text(`Revision ${run.revision.assignedRevision} · ${run.revision.date} · ${run.sheets.length} sheet${run.sheets.length === 1 ? '' : 's'}`, 8, 'normal', 80);
  text(`Run ${run.id} · ${run.items.length} item${run.items.length === 1 ? '' : 's'} · mode ${run.mode}`, 8, 'normal', 80);
  if (run.revision.description) text(run.revision.description, 9, 'bold', 30);
  if (run.revision.by) text(`By: ${run.revision.by}${run.revision.checkedBy ? ` · Checked by: ${run.revision.checkedBy}` : ''}`, 8, 'normal', 80);
  rule();

  const counts = manifest.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.disposition] = (acc[item.disposition] ?? 0) + 1;
    return acc;
  }, {});
  text(
    `Disposition: ${counts.done ?? 0} done · ${counts.not_done ?? 0} not done · ${counts.deferred ?? 0} deferred · ${counts.human_action ?? 0} human action · ${counts.see_note ?? 0} see note`,
    8,
    'normal',
    60,
  );
  y += 0.06;

  const columns = [
    { label: '#', x: 0.5, width: 0.55 },
    { label: 'Sheet', x: 1.05, width: 0.85 },
    { label: 'Reviewer markup', x: 1.9, width: 1.7 },
    { label: 'Disposition', x: 3.6, width: 0.85 },
    { label: 'Response / note', x: 4.45, width: 2.25 },
    { label: 'Rev', x: 6.7, width: 0.75 },
  ];
  const drawHeader = () => {
    ensureSpace(0.28);
    pdf.setFillColor(238, 241, 246);
    pdf.rect(LEFT, y - 0.04, CONTENT_WIDTH, 0.22, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.setTextColor(35);
    for (const column of columns) pdf.text(column.label, column.x, y + 0.1);
    y += 0.24;
  };
  drawHeader();

  for (const item of manifest.items) {
    const sheet = run.sheets.find((candidate) => candidate.fileId === item.sheet.fileId);
    const values = [
      item.number,
      `${truncate(item.sheet.fileId || sheet?.fileName || 'sheet', 26)} p${item.sheet.pageIndex + 1}`,
      item.reviewerText || '(no text)',
      item.disposition.replace(/_/g, ' '),
      item.responseText || '—',
      item.revision ? `R${item.revision.number}.${item.revision.delta}` : '—',
    ];
    const wrapped = values.map((value, index) => (
      pdf.splitTextToSize(String(value), columns[index].width) as string[]
    ));
    const rowHeight = Math.max(0.22, Math.max(...wrapped.map((lines) => lines.length)) * 0.11 + 0.1);
    ensureSpace(rowHeight + 0.02);
    if (y + rowHeight > PAGE_BOTTOM) {
      pdf.addPage();
      y = 0.55;
      drawHeader();
    }
    pdf.setDrawColor(220);
    pdf.line(LEFT, y + rowHeight - 0.04, LEFT + CONTENT_WIDTH, y + rowHeight - 0.04);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(45);
    wrapped.forEach((lines, index) => {
      pdf.text(lines, columns[index].x, y + 0.08);
    });
    y += rowHeight;
  }

  y += 0.12;
  ensureSpace(0.55);
  pdf.setDrawColor(180);
  pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
  y += 0.12;
  text('Source package', 8, 'bold', 30);
  text(
    run.sheets.map((sheet) => `${sheet.fileName} p${sheet.pageIndex + 1}`).join(' · ') || 'No source sheets recorded.',
    7.5,
    'normal',
    70,
  );
  y += 0.06;
  text(
    'Experimental Redline Agent output. Verify every applied correction against the issued drawing before distribution.',
    7.2,
    'italic',
    110,
  );

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(130);
    pdf.text(`Redline response · ${run.id} · page ${page} of ${pageCount}`, LEFT, 10.65);
  }

  return new Uint8Array(pdf.output('arraybuffer'));
}

function sourcePayload(fileData: string): string | null {
  if (!fileData) return null;
  const comma = fileData.indexOf(',');
  const payload = fileData.startsWith('data:') && comma >= 0
    ? fileData.slice(comma + 1)
    : fileData;
  return payload.trim() || null;
}

/** Build the local ZIP response package from a run and its source files. */
export async function buildRedlineResponsePackageFile(
  run: RedlineRun,
  sourceFiles: SessionFile[],
  manifest: RedlineResponseManifest,
): Promise<RedlineResponsePackage> {
  const letter = buildResponseLetter(run, manifest);
  const zip = new JSZip();
  zip.file('response-letter.pdf', letter);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const sourceNames = new Set(run.sheets.map((sheet) => sheet.fileName));
  const usedNames = new Set<string>();
  for (const file of sourceFiles) {
    if (!sourceNames.has(file.name) || !file.fileData) continue;
    const payload = sourcePayload(file.fileData);
    if (!payload) continue;
    const name = safeFilePart(file.name, 'source.pdf');
    const unique = usedNames.has(name) ? `${usedNames.size}-${name}` : name;
    usedNames.add(unique);
    zip.file(`source/${unique}`, payload, { base64: true });
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const fileName = `Redline_${safeFilePart(run.id, 'run')}_response.zip`;
  return {
    blob,
    fileName,
    mimeType: 'application/zip',
    manifest,
  };
}
