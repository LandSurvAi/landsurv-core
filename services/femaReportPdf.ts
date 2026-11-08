import jsPDF from 'jspdf';
import type { SoilMapUnit } from '../types.ts';

/**
 * femaReportPdf — turns the flood-map image and the USDA SSURGO tabular data
 * into downloadable PDF exhibits. Both artifacts are returned with a browser
 * Blob (for the download) and a data URL (for File Manager / .lsvz storage).
 */

export interface PdfArtifact {
  blob: Blob;
  dataUrl: string;
  fileName: string;
}

export interface SoilReportRow {
  /** Dominant component (soil series) name from SSURGO. */
  compname?: string;
  /** Dominant component percentage. */
  comppct_r?: number | null;
  hydgrpdcd?: string;
  drclassdcd?: string;
  taxclname?: string;
  farmlndcl?: string;
  hydricrating?: string;
  /** Depth to annual minimum water table, inches. */
  wtdepannmin?: number | null;
  /** Depth to bedrock, inches. */
  brockdepmin?: number | null;
  slope_r?: number | null;
}

export type SoilReportTable = Record<string, SoilReportRow>;

const PDF_DATA_PREFIX = 'data:application/pdf;base64,';

const cleanFilePart = (value: string, fallback: string): string => {
  const cleaned = value
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (cleaned || fallback).slice(0, 48);
};

export const fileStamp = (date: Date): string => (
  date.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
);

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};

export const finishPdf = (pdf: jsPDF, fileName: string): PdfArtifact => {
  const arrayBuffer = pdf.output('arraybuffer');
  const bytes = new Uint8Array(arrayBuffer);
  return {
    blob: new Blob([arrayBuffer], { type: 'application/pdf' }),
    dataUrl: `${PDF_DATA_PREFIX}${bytesToBase64(bytes)}`,
    fileName,
  };
};

const truncate = (value: string, max: number): string => (
  value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
);

const FARMLAND_LABELS: Record<string, string> = {
  P: 'Prime',
  S: 'Statewide',
  U: 'Unique',
  L: 'Local',
  N: 'Not prime',
};

/** Wrap the NFHL map image in a letter-size FIRMETTE PDF with source metadata. */
export function buildFirmettePdf(input: {
  imageDataUrl: string;
  bbox: string;
  projectName?: string;
  generatedAt?: Date;
}): PdfArtifact {
  if (!input.imageDataUrl || !input.imageDataUrl.startsWith('data:image/')) {
    throw new Error('FIRMETTE PDF requires a valid map image.');
  }

  const generatedAt = input.generatedAt ?? new Date();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.setProperties({
    title: 'FEMA FIRMETTE - Flood Map',
    subject: `FEMA NFHL flood map for bbox ${input.bbox}`,
    author: 'LandSurv.ai',
    creator: 'LandSurv.ai',
  });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('FEMA FIRMETTE - FLOOD MAP', 0.5, 0.42);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(70);
  const project = input.projectName?.trim() ? `Project: ${input.projectName.trim()}  |  ` : '';
  pdf.text(`${project}Source: FEMA National Flood Hazard Layer (NFHL)`, 0.5, 0.58);

  // 850 x 1100 is the same aspect ratio as the on-screen FIRMETTE preview.
  const imageWidth = 7.5;
  const imageHeight = imageWidth * (1100 / 850);
  pdf.addImage(input.imageDataUrl, 'PNG', 0.5, 0.7, imageWidth, imageHeight);

  pdf.setFontSize(6.4);
  pdf.setTextColor(85);
  const footerY = 10.58;
  pdf.text(`NFHL bbox: ${input.bbox}`, 0.5, footerY);
  pdf.text(`Fetched ${generatedAt.toLocaleString()}  |  FEMA NFHL MapServer export`, 0.5, footerY + 0.11);
  pdf.text('Screening exhibit only - verify against the effective FIRM panel for the project community.', 0.5, footerY + 0.22);

  return finishPdf(
    pdf,
    `FEMA_FIRMETTE_${cleanFilePart(input.bbox, 'flood_map')}_${fileStamp(generatedAt)}.pdf`,
  );
}

/** Build a tabular SSURGO soil report PDF for the loaded map units. */
export function buildSoilsReportPdf(input: {
  mapUnits: SoilMapUnit[];
  reportData?: SoilReportTable | null;
  projectName?: string;
  generatedAt?: Date;
}): PdfArtifact {
  if (input.mapUnits.length === 0) {
    throw new Error('Soil report PDF requires at least one SSURGO map unit.');
  }

  const generatedAt = input.generatedAt ?? new Date();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.setProperties({
    title: 'USDA NRCS SSURGO Soil Report',
    subject: 'SSURGO soil map-unit attributes',
    author: 'LandSurv.ai',
    creator: 'LandSurv.ai',
  });

  let y = 0.52;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('USDA NRCS SSURGO SOIL REPORT', 0.5, y);

  y += 0.25;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(70);
  if (input.projectName?.trim()) {
    pdf.text(`Project: ${input.projectName.trim()}`, 0.5, y);
    y += 0.15;
  }
  pdf.text(`Generated: ${generatedAt.toLocaleString()}`, 0.5, y);
  y += 0.15;
  pdf.text('Source: USDA NRCS Soil Data Access (SDA) / SSURGO', 0.5, y);
  y += 0.15;
  pdf.text(`${input.mapUnits.length} soil map unit${input.mapUnits.length === 1 ? '' : 's'}`, 0.5, y);

  y += 0.24;
  pdf.setDrawColor(170);
  pdf.line(0.5, y, 8.0, y);
  y += 0.18;

  const columns = [0.5, 1.05, 3.65, 4.28, 4.95, 6.35];
  const drawHeader = () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(55);
    pdf.text('SYMBOL', columns[0], y);
    pdf.text('MAP UNIT NAME', columns[1], y);
    pdf.text('ACRES', columns[2], y);
    pdf.text('HYDRO', columns[3], y);
    pdf.text('DRAINAGE', columns[4], y);
    pdf.text('FARMLAND', columns[5], y);
    y += 0.08;
    pdf.setDrawColor(190);
    pdf.line(0.5, y, 8.0, y);
    y += 0.16;
  };

  drawHeader();

  for (const unit of input.mapUnits) {
    if (y > 10.25) {
      pdf.addPage();
      y = 0.6;
      drawHeader();
    }
    const report = input.reportData?.[unit.mukey];
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(25);
    pdf.text(truncate(unit.musym || '-', 12), columns[0], y);

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(45);
    pdf.text(truncate(unit.muname || '-', 42), columns[1], y);
    pdf.text(Number.isFinite(unit.acres) ? Number(unit.acres).toFixed(1) : '-', columns[2], y);
    pdf.text(report?.hydgrpdcd || '-', columns[3], y);
    pdf.text(truncate(report?.drclassdcd || unit.drclassdcd || '-', 22), columns[4], y);
    const farmland = report?.farmlndcl || unit.farmlndcl;
    pdf.text(farmland ? (FARMLAND_LABELS[farmland] ?? farmland) : '-', columns[5], y);
    y += 0.2;
  }

  if (y > 9.95) {
    pdf.addPage();
    y = 0.7;
  }

  y += 0.2;
  pdf.setFontSize(6.5);
  pdf.setTextColor(90);
  const disclaimer = pdf.splitTextToSize(
    'SSURGO data are a planning-level soils inventory and are not a substitute for a site-specific geotechnical investigation. ' +
    'Hydrologic groups: A = high infiltration, B = moderate, C = slow, D = very slow. ' +
    'Verify map-unit boundaries and interpretations against the current USDA Web Soil Survey and NRCS field data.',
    7.5,
  );
  pdf.text(disclaimer, 0.5, y);

  return finishPdf(
    pdf,
    `USDA_SSURGO_Soil_Report_${fileStamp(generatedAt)}.pdf`,
  );
}
