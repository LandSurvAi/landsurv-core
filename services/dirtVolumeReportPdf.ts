/**
 * dirtVolumeReportPdf — downloadable earthwork quantity report.
 *
 * Mirrors the Dirt Volume workspace: scenario method, cut/fill quantities,
 * haul balance, optional scenario comparison, warnings, and the report
 * disclaimer. Uses the shared LandSurv PDF finish/file-stamp helpers.
 */

import jsPDF from 'jspdf';
import type { PdfArtifact } from './femaReportPdf.ts';
import { finishPdf, fileStamp } from './femaReportPdf.ts';
import type {
  DirtVolumeComparison,
  DirtVolumeScenario,
} from './dirtVolumeService.ts';

const PAGE_BOTTOM = 10.15;
const LEFT = 0.5;
const CONTENT_WIDTH = 7.5;
const LINE_HEIGHT = 0.13;

function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function buildDirtVolumeReportPdf(input: {
  scenario: DirtVolumeScenario;
  comparison?: DirtVolumeComparison | null;
  projectName?: string;
  location?: string;
  preparedBy?: string;
  notes?: string;
  generatedAt?: Date;
}): PdfArtifact {
  const { scenario } = input;
  const comparison = input.comparison ?? null;
  const generatedAt = input.generatedAt ?? new Date();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.setProperties({
    title: 'Dirt Volume / Earthwork Quantity Report',
    subject: `${scenario.methodLabel} takeoff`,
    author: input.preparedBy?.trim() || 'LandSurv.ai',
    creator: 'LandSurv.ai',
  });

  let y = 0.5;
  const ensureSpace = (needed = 0.25): void => {
    if (y + needed <= PAGE_BOTTOM) return;
    pdf.addPage();
    y = 0.55;
  };
  const text = (
    value: string,
    size = 8,
    style: 'normal' | 'bold' | 'italic' = 'normal',
    color = 45,
  ): void => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
    const lines = pdf.splitTextToSize(value, CONTENT_WIDTH) as string[];
    const blockHeight = lines.length * LINE_HEIGHT;
    ensureSpace(blockHeight);
    pdf.text(lines, LEFT, y);
    y += blockHeight;
  };
  const gap = (amount = 0.08): void => {
    y += amount;
  };
  const rule = (): void => {
    ensureSpace(0.12);
    pdf.setDrawColor(180);
    pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
    y += 0.12;
  };
  const section = (title: string): void => {
    ensureSpace(0.3);
    gap(0.06);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(25);
    pdf.text(title, LEFT, y);
    y += 0.14;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(20);
  pdf.text('DIRT VOLUME / EARTHWORK QUANTITY REPORT', LEFT, y);
  y += 0.2;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(65);
  pdf.text(scenario.methodLabel, LEFT, y);
  y += 0.16;

  const meta = [
    scenario.name ? `Scenario: ${scenario.name}` : '',
    input.projectName?.trim() ? `Project: ${input.projectName.trim()}` : '',
    input.location?.trim() ? `Location: ${input.location.trim()}` : '',
    input.preparedBy?.trim() ? `Prepared by: ${input.preparedBy.trim()}` : '',
    `Generated: ${generatedAt.toLocaleString()}`,
    `Computed: ${new Date(scenario.computedAt).toLocaleString()}`,
  ].filter(Boolean);
  for (const line of meta) text(line, 8, 'normal', 65);

  rule();
  section('CALCULATION METHOD');
  text(`Method: ${scenario.methodLabel}`);
  text(`Calculation: ${scenario.calculationMethod}`);
  if (scenario.lengthFt !== null) text(`Corridor length: ${fmt(scenario.lengthFt, 1)} ft`);
  if (scenario.sectionCount !== null) text(`Cross sections: ${scenario.sectionCount}`);
  if (scenario.planAreaSf !== null) {
    text(`Plan area: ${fmt(scenario.planAreaSf, 0)} sq ft (${fmt(scenario.planAreaAcres ?? 0, 3)} acres)`);
  }
  if (scenario.cellsComputed !== null) {
    text(
      `Sampled cells: ${scenario.cellsComputed}` +
        (scenario.cellsSkipped ? ` | skipped: ${scenario.cellsSkipped}` : ''),
    );
  }

  section('QUANTITIES');
  const labelX = LEFT;
  const valueX = 3.4;
  const rows: Array<[string, string]> = [
    ['Cut (bank)', `${fmt(scenario.cutCy)} CY`],
    ['Fill (compacted)', `${fmt(scenario.fillCy)} CY`],
    ['Raw net (cut - fill)', `${fmt(scenario.netCy)} CY`],
    ['Cut swell', `${fmt(scenario.cutSwellPercent, 1)} %`],
    ['Cut (loose)', `${fmt(scenario.cutLooseCy)} CY`],
    ['Fill shrink', `${fmt(scenario.fillShrinkPercent, 1)} %`],
    ['Fill (bank required)', `${fmt(scenario.fillBankRequiredCy)} CY`],
    ['Adjusted balance (+ surplus)', `${fmt(scenario.adjustedNetCy)} CY`],
    [
      'Cut-to-fill ratio',
      scenario.cutToFillRatio !== null ? `${fmt(scenario.cutToFillRatio, 2)} : 1` : 'No fill',
    ],
  ];
  for (const [label, value] of rows) {
    ensureSpace(0.16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(55);
    pdf.text(label, labelX, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(25);
    pdf.text(value, valueX, y);
    y += 0.15;
  }

  if (scenario.maxCutFt !== null || scenario.maxFillFt !== null) {
    section('DEPTHS');
    text(
      `Maximum cut: ${scenario.maxCutFt !== null ? `${fmt(scenario.maxCutFt)} ft` : 'n/a'} | ` +
        `Maximum fill: ${scenario.maxFillFt !== null ? `${fmt(scenario.maxFillFt)} ft` : 'n/a'}`,
    );
  }

  if (comparison) {
    section('SCENARIO COMPARISON');
    const baseline = comparison.rows.find((row) => row.id === comparison.baselineId);
    text(`Baseline: ${baseline?.name ?? comparison.baselineId}`, 8, 'normal', 65);
    gap(0.04);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.8);
    pdf.setTextColor(80);
    const colName = LEFT;
    const colCut = 2.15;
    const colFill = 3.15;
    const colNet = 4.15;
    const colDNet = 5.3;
    pdf.text('SCENARIO', colName, y);
    pdf.text('CUT CY', colCut, y);
    pdf.text('FILL CY', colFill, y);
    pdf.text('ADJ NET', colNet, y);
    pdf.text('D NET', colDNet, y);
    y += 0.1;
    pdf.setDrawColor(190);
    pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
    y += 0.13;
    for (const row of comparison.rows) {
      ensureSpace(0.16);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.2);
      pdf.setTextColor(45);
      const nameLines = pdf.splitTextToSize(row.name, 1.55) as string[];
      pdf.text(nameLines[0] || '-', colName, y);
      pdf.text(fmt(row.cutCy, 1), colCut, y);
      pdf.text(fmt(row.fillCy, 1), colFill, y);
      pdf.text(fmt(row.adjustedNetCy, 1), colNet, y);
      pdf.text(fmt(row.deltaNetCy, 1), colDNet, y);
      y += 0.15;
    }
    const best = comparison.rows.find((row) => row.id === comparison.bestBalancedId);
    text(
      `Net spread: ${fmt(comparison.spreadNetCy)} CY. Best-balanced: ${best?.name ?? comparison.bestBalancedId}.`,
      7.5,
      'normal',
      65,
    );
  }

  if (scenario.warnings.length > 0) {
    section('WARNINGS & ASSUMPTIONS');
    for (const warning of scenario.warnings) text(`- ${warning}`, 7.5, 'normal', 70);
  }

  if (input.notes?.trim() || scenario.notes.trim()) {
    section('NOTES');
    text(input.notes?.trim() || scenario.notes.trim(), 7.5, 'normal', 60);
  }

  section('METHOD NOTES');
  text('Quantities are reported in cubic yards (1 CY = 27 CF).', 7, 'normal', 70);
  text('Cut is bank / in-place material; fill is compacted in-place material.', 7, 'normal', 70);
  text(
    'Cut swell and fill shrink are user-supplied factors applied only to the adjusted balance.',
    7,
    'normal',
    70,
  );
  text(
    'Average end area is exact for linear prisms. TIN, grid, and stockpile volumes sample a regular grid; ' +
      'smaller spacing improves the estimate.',
    7,
    'normal',
    70,
  );

  gap(0.1);
  text(
    'DISCLAIMER: This takeoff is for preliminary planning and quantity comparison. Verify section areas, ' +
      'surface models, shrink/swell factors, and final quantities with a licensed professional before ' +
      'bidding, construction, or payment.',
    6.5,
    'italic',
    120,
  );

  const safeName =
    scenario.name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Volume';
  return finishPdf(pdf, `Dirt_Volume_${safeName}_${fileStamp(generatedAt)}.pdf`);
}
