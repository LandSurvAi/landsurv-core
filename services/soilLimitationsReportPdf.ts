/**
 * soilLimitationsReportPdf — downloadable PA E&S soil-limitations report.
 *
 * The PDF mirrors the on-screen report: a soil-area summary followed by one
 * block per map unit with the Table E.1 limitations and the selected
 * resolutions.
 */

import jsPDF from 'jspdf';
import type { PdfArtifact } from './femaReportPdf.ts';
import { finishPdf, fileStamp } from './femaReportPdf.ts';
import type { SoilLimitationsReport } from './soilLimitationsReport.ts';

const PAGE_BOTTOM = 10.1;
const LEFT = 0.5;
const CONTENT_WIDTH = 7.5;
const LINE_HEIGHT = 0.125;

function acres(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toFixed(2);
}

export function buildSoilLimitationsReportPdf(input: {
  report: SoilLimitationsReport;
  generatedAt?: Date;
}): PdfArtifact {
  const report = input.report;
  if (report.units.length === 0) {
    throw new Error('The soil-limitations report has no soil map units.');
  }

  const generatedAt = input.generatedAt ?? new Date(report.generatedAt);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.setProperties({
    title: 'PA E&S Soil Limitations Report',
    subject: 'Pennsylvania E&S Manual Table E.1 soil limitations and resolutions',
    author: 'LandSurv.ai',
    creator: 'LandSurv.ai',
  });

  let y = 0.5;
  const ensureSpace = (needed = 0.25): void => {
    if (y + needed <= PAGE_BOTTOM) return;
    pdf.addPage();
    y = 0.55;
  };
  const text = (value: string, size = 8, style: 'normal' | 'bold' = 'normal', color = 45): void => {
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

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(20);
  pdf.text('PA E&S SOIL LIMITATIONS REPORT', LEFT, y);
  y += 0.22;

  text(`Area: ${report.areaLabel}`, 8, 'normal', 60);
  if (report.projectName?.trim()) text(`Project: ${report.projectName.trim()}`, 8, 'normal', 60);
  text(`Generated: ${generatedAt.toLocaleString()}`, 8, 'normal', 60);
  text(
    `Source: ${report.chartSource} — Table E.1${report.chartCached ? ' (cached chart)' : ''}`,
    8,
    'normal',
    60,
  );

  if (report.boundaryAdvisory) {
    gap(0.04);
    text(report.boundaryAdvisory, 7.5, 'bold', 120);
  }

  gap(0.12);
  pdf.setDrawColor(170);
  pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
  gap(0.16);

  // Summary table.
  const columns = [0.5, 1.05, 4.55, 5.45, 6.55];
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(55);
  pdf.text('SYMBOL', columns[0], y);
  pdf.text('MAP UNIT', columns[1], y);
  pdf.text('ACRES', columns[2], y);
  pdf.text('% OF AREA', columns[3], y);
  pdf.text('LIMITATIONS', columns[4], y);
  y += 0.09;
  pdf.setDrawColor(190);
  pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
  y += 0.14;

  for (const unit of report.units) {
    ensureSpace(0.18);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(25);
    pdf.text(unit.musym || '—', columns[0], y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(45);
    const nameLines = pdf.splitTextToSize(unit.muname || unit.seriesName, 3.35) as string[];
    pdf.text(nameLines[0] || '—', columns[1], y);
    pdf.text(acres(unit.acres), columns[2], y);
    pdf.text(`${unit.percent.toFixed(1)}%`, columns[3], y);
    pdf.text(String(unit.limitations.length), columns[4], y);
    y += 0.16;
    if (nameLines.length > 1) {
      ensureSpace(0.14);
      pdf.text(nameLines.slice(1).join(' '), columns[1], y);
      y += 0.14;
    }
  }
  ensureSpace(0.18);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(30);
  pdf.text(`TOTAL: ${acres(report.soilAcres)} ac`, columns[2], y);
  y += 0.2;

  for (const unit of report.units) {
    ensureSpace(1.1);
    pdf.setDrawColor(210);
    pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
    y += 0.14;

    text(`${unit.musym || '—'} — ${unit.muname || unit.seriesName}`, 10.5, 'bold', 20);
    text(
      `Area: ${acres(unit.acres)} ac (${unit.percent.toFixed(1)}%)  |  Table E.1 series: ${unit.seriesName}${unit.matched ? '' : ' (no matching row)'}`,
      7.5,
      'normal',
      65,
    );
    text(
      `HSG: ${unit.hydrologicGroup || '—'}  |  Drainage: ${unit.drainageClass || '—'}  |  Hydric: ${unit.hydric || '—'}`,
      7.5,
      'normal',
      65,
    );
    const depth = (value: number | null | undefined): string => (
      value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(0)}"`
    );
    text(
      `Depth to seasonal high water table: ${depth(unit.depthToWaterTableIn)}  |  Depth to bedrock: ${depth(unit.depthToBedrockIn)}`,
      7.5,
      'normal',
      65,
    );

    gap(0.03);
    if (unit.limitations.length === 0) {
      text(
        'Limitations: none marked in Table E.1. Absence of an X does not mean there is no potential limitation.',
        7.5,
        'normal',
        80,
      );
    } else {
      text(
        `Limitations: ${unit.limitations
          .map(item => item.label + (item.valueLabel ? ` (${item.valueLabel})` : ''))
          .join('; ')}.`,
        7.5,
        'bold',
        55,
      );
      gap(0.03);
      text('Resolutions:', 7.5, 'bold', 55);
      unit.resolutions.forEach((resolution, index) => {
        text(`${index + 1}. ${resolution}`, 7.5, 'normal', 60);
      });
    }
    gap(0.08);
  }

  if (report.unmatched.length > 0) {
    ensureSpace(0.4);
    gap(0.05);
    text(
      `Unmatched map units: ${report.unmatched.join(', ')}. Verify the series name against Appendix E before relying on the limitation list.`,
      7,
      'bold',
      120,
    );
  }

  if (report.notes.length > 0) {
    ensureSpace(0.45);
    gap(0.08);
    text(report.notes.join(' '), 6.4, 'normal', 100);
  }

  return finishPdf(
    pdf,
    `PA_ES_Soil_Limitations_Report_${fileStamp(generatedAt)}.pdf`,
  );
}
