/**
 * stormwaterReportPdf — downloadable stormwater calculation report.
 *
 * Mirrors the on-screen Rational Method result: site surfaces, design storm,
 * time of concentration, calculation trail, optional detention storage, and
 * the applicability warnings/citations.
 */

import jsPDF from 'jspdf';
import type { PdfArtifact } from './femaReportPdf.ts';
import { finishPdf, fileStamp } from './femaReportPdf.ts';
import type {
  StormwaterDetentionResult,
  StormwaterHydraulicsSummary,
  StormwaterRunoffResult,
} from './stormwaterService.ts';

const PAGE_BOTTOM = 10.15;
const LEFT = 0.5;
const CONTENT_WIDTH = 7.5;
const LINE_HEIGHT = 0.13;

function fmt(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function buildStormwaterReportPdf(input: {
  result: StormwaterRunoffResult;
  detention?: StormwaterDetentionResult | null;
  hydraulics?: StormwaterHydraulicsSummary | null;
  projectName?: string;
  generatedAt?: Date;
}): PdfArtifact {
  const { result } = input;
  const detention = input.detention ?? null;
  const hydraulics = input.hydraulics ?? null;
  const generatedAt = input.generatedAt ?? new Date(result.computedAt);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.setProperties({
    title: 'Stormwater Runoff Calculation - Rational Method',
    subject: `Preliminary stormwater runoff, ${result.returnPeriod}-year ${result.durationLabel} storm`,
    author: 'LandSurv.ai',
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
  pdf.text('STORMWATER RUNOFF CALCULATION', LEFT, y);
  y += 0.2;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(65);
  pdf.text('Rational Method (Q = C x i x A)', LEFT, y);
  y += 0.16;

  const meta = [
    input.projectName?.trim() ? `Project: ${input.projectName.trim()}` : '',
    `Location: ${result.location ?? 'Not specified'}`,
    result.latitude !== null && result.longitude !== null
      ? `Coordinates: ${result.latitude.toFixed(6)}N, ${Math.abs(result.longitude).toFixed(6)}W`
      : '',
    `Generated: ${generatedAt.toLocaleString()}`,
  ].filter(Boolean);
  for (const line of meta) text(line, 8, 'normal', 65);

  rule();
  section('DESIGN STORM PARAMETERS');
  text(`Return period: ${result.returnPeriod}-year storm`);
  text(`Duration: ${result.durationLabel}${result.durationSource === 'time-of-concentration' ? ' (from Tc)' : ''}`);
  text(`Rainfall intensity (i): ${result.rainfallIntensity.toFixed(2)} in/hr`);
  text(`Source: ${result.citation}`, 7.5, 'normal', 70);

  if (result.tcMinutes !== null) {
    section('TIME OF CONCENTRATION (Tc)');
    text(`Calculated Tc: ${result.tcMinutes.toFixed(1)} minutes`);
    text(`Flow path length: ${fmt(result.tcFlowLengthFt ?? 0)} ft`);
    text(`Average slope: ${(result.tcSlopePercent ?? 0).toFixed(1)}%`);
    text('Method: FAA (Federal Aviation Administration) - preliminary estimate; verify site-specific.');
  }

  section('SITE CHARACTERISTICS');
  const colType = LEFT;
  const colArea = 4.15;
  const colPct = 5.35;
  const colC = 6.45;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(80);
  pdf.text('SURFACE', colType, y);
  pdf.text('AREA (SQ FT)', colArea, y);
  pdf.text('% TOTAL', colPct, y);
  pdf.text('C', colC, y);
  y += 0.1;
  pdf.setDrawColor(190);
  pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
  y += 0.13;

  for (const surface of result.surfaces) {
    ensureSpace(0.16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(45);
    const nameLines = pdf.splitTextToSize(surface.type, 3.4) as string[];
    pdf.text(nameLines[0] || '-', colType, y);
    pdf.text(fmt(surface.areaSqFt), colArea, y);
    pdf.text(`${surface.percentOfArea.toFixed(1)}%`, colPct, y);
    pdf.text(surface.coefficient.toFixed(2), colC, y);
    y += 0.15;
    for (const extra of nameLines.slice(1)) {
      ensureSpace(0.13);
      pdf.text(extra, colType, y);
      y += 0.13;
    }
  }

  ensureSpace(0.18);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(25);
  pdf.text('TOTAL', colType, y);
  pdf.text(fmt(result.totalAreaSqFt), colArea, y);
  pdf.text('100%', colPct, y);
  pdf.text(result.weightedC.toFixed(3), colC, y);
  y += 0.16;
  text(`Total drainage area: ${result.totalAreaAcres.toFixed(3)} acres`);
  text(`Weighted runoff coefficient (C): ${result.weightedC.toFixed(3)}`);

  section('CALCULATION');
  text('Q = C x i x A');
  text(
    `Q = ${result.weightedC.toFixed(3)} x ${result.rainfallIntensity.toFixed(2)} in/hr x ` +
      `${result.totalAreaAcres.toFixed(3)} acres = ${result.peakRunoffCfs.toFixed(3)} cfs`,
  );

  section('RESULT');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(20);
  ensureSpace(0.22);
  pdf.text(
    `Peak runoff (Q): ${result.peakRunoffCfs.toFixed(2)} cfs (${result.peakRunoffGpm.toFixed(0)} gpm)`,
    LEFT,
    y,
  );
  y += 0.24;

  if (detention) {
    section('DETENTION STORAGE (MODIFIED RATIONAL METHOD)');
    text(`Allowable release rate: ${detention.allowableOutflowCfs.toFixed(2)} cfs`);
    text(
      `Governing storm: ${detention.returnPeriod}-year, ${detention.governingDurationLabel} ` +
        `(peak inflow ${detention.peakInflowCfs.toFixed(2)} cfs)`,
    );
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(20);
    ensureSpace(0.2);
    pdf.text(
      `Required storage: ${fmt(detention.requiredStorageCf)} cf ` +
        `(${detention.requiredStorageAcreFt.toFixed(3)} ac-ft / ${fmt(detention.requiredStorageGallons)} gallons)`,
      LEFT,
      y,
    );
    y += 0.2;
    text(
      `Safety factor: ${detention.safetyFactor.toFixed(2)} | ${detention.method}`,
      7.5,
      'normal',
      70,
    );

    gap(0.04);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(80);
    const trialDuration = LEFT;
    const trialIntensity = 2.0;
    const trialInflow = 3.35;
    const trialStorage = 4.85;
    pdf.text('DURATION', trialDuration, y);
    pdf.text('INTENSITY (IN/HR)', trialIntensity, y);
    pdf.text('INFLOW (CFS)', trialInflow, y);
    pdf.text('STORAGE (CF)', trialStorage, y);
    y += 0.1;
    pdf.setDrawColor(190);
    pdf.line(LEFT, y, LEFT + CONTENT_WIDTH, y);
    y += 0.13;
    for (const trial of detention.trials) {
      ensureSpace(0.15);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(45);
      pdf.text(trial.durationLabel, trialDuration, y);
      pdf.text(trial.rainfallIntensity.toFixed(2), trialIntensity, y);
      pdf.text(trial.peakInflowCfs.toFixed(3), trialInflow, y);
      pdf.text(fmt(trial.storageCf), trialStorage, y);
      y += 0.14;
    }
    text(
      'Screening estimate only. Route the design storm through the proposed basin (EPA SWMM, HEC-HMS, ' +
        'or an approved local model) before sizing the outlet.',
      7,
      'italic',
      110,
    );
  }

  if (hydraulics?.hydrograph) {
    const hydrograph = hydraulics.hydrograph;
    section('DESIGN HYDROGRAPH (MODIFIED RATIONAL)');
    text(`Peak inflow: ${hydrograph.peakFlowCfs.toFixed(2)} cfs`);
    text(`Time to peak: ${hydrograph.timeToPeakMinutes.toFixed(1)} min | Time base: ${hydrograph.timeBaseMinutes.toFixed(1)} min`);
    text(`Storm duration: ${hydrograph.stormDurationMinutes.toFixed(1)} min | Runoff volume: ${fmt(hydrograph.runoffVolumeCf)} cf`);
  }

  if (hydraulics?.routing) {
    const routing = hydraulics.routing;
    section('DETENTION BASIN ROUTING (LEVEL POOL)');
    text(`Peak inflow: ${routing.peakInflowCfs.toFixed(2)} cfs | Peak outflow: ${routing.peakOutflowCfs.toFixed(2)} cfs`);
    text(`Maximum stage: ${routing.maxStageFt.toFixed(2)} ft | Maximum storage: ${fmt(routing.maxStorageCf)} cf (${routing.maxStorageAcreFt.toFixed(3)} ac-ft)`);
    text(
      `Allowable release: ${routing.allowableOutflowCfs !== null ? `${routing.allowableOutflowCfs.toFixed(2)} cfs` : 'not specified'} | ` +
        `Passes: ${routing.passesAllowable === null ? 'n/a' : routing.passesAllowable ? 'YES' : 'NO'}`,
    );
    if (routing.basinExceeded) {
      text('Basin overtop flag: YES - increase storage or outlet capacity.', 7.5, 'bold', 120);
    }
  }

  if (hydraulics?.channel) {
    const channel = hydraulics.channel;
    section('CHANNEL / PIPE CAPACITY (MANNING)');
    text(`Section: ${channel.shape} | Depth: ${channel.depthFt.toFixed(2)} ft | Area: ${channel.areaSqFt.toFixed(2)} sq ft`);
    text(`Velocity: ${channel.velocityFps.toFixed(2)} fps | Capacity: ${channel.capacityCfs.toFixed(2)} cfs`);
    text(
      `Froude: ${channel.froude !== null ? channel.froude.toFixed(2) : 'n/a'} (${channel.flowRegime}) | ` +
        `Normal depth: ${channel.normalDepthFt !== null ? `${channel.normalDepthFt.toFixed(2)} ft` : 'n/a'} | ` +
        `Critical depth: ${channel.criticalDepthFt !== null ? `${channel.criticalDepthFt.toFixed(2)} ft` : 'n/a'}`,
    );
  }

  if (result.warnings.length > 0) {
    section('APPLICABILITY WARNINGS');
    for (const warning of result.warnings) {
      text(`- ${warning}`, 7.5, 'normal', 70);
    }
  }
  if (detention && detention.warnings.length > 0) {
    section('DETENTION WARNINGS');
    for (const warning of detention.warnings) {
      text(`- ${warning}`, 7.5, 'normal', 70);
    }
  }

  section('REFERENCES');
  text(`Rainfall intensity: ${result.dataSource}`, 7, 'normal', 70);
  text(result.citation, 7, 'normal', 70);
  text(
    'Runoff coefficients: Rational Method reference coefficients, editable per surface and verified ' +
      'against the governing jurisdiction.',
    7,
    'normal',
    70,
  );
  text('Method: Rational Method Q = C x i x A for small urban drainage areas.', 7, 'normal', 70);
  text(
    'Many jurisdictions require continuous simulation (EPA SWMM, HEC-HMS, or an approved local ' +
      'model) for permit applications. This report provides preliminary conveyance sizing only.',
    7,
    'normal',
    90,
  );

  gap(0.1);
  text(
    'DISCLAIMER: This calculation is for preliminary planning purposes only. All values should be ' +
      'independently verified by a licensed professional engineer against the governing jurisdiction.',
    6.5,
    'italic',
    120,
  );

  const stamp = fileStamp(generatedAt);
  return finishPdf(pdf, `Stormwater_Calc_${stamp}.pdf`);
}
