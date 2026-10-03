/**
 * FCL to Trimble CSV Converter Utility
 * 
 * Logic:
 * - Carlson FCL: Code, Polyline (Y/N), 3D Polyline (Y/N), Layer, Full Description
 * - Trimble CSV: Feature Code, Description, Feature Type, Layer
 * 
 * Conversion Rules:
 * - Feature Code = Carlson Code
 * - Description = Carlson Full Description
 * - Feature Type = 'Line' if Polyline or 3D Polyline is 'Y', else 'Point'
 * - Layer = Carlson Layer
 */

export interface CarlsonFclRow {
  code: string;
  polyline: string;
  polyline3d: string;
  layer: string;
  description: string;
}

export interface TrimbleCsvRow {
  featureCode: string;
  description: string;
  featureType: 'Line' | 'Point';
  layer: string;
}

/**
 * Parses Carlson FCL content and converts to Trimble CSV format
 */
export function convertFclToTrimbleCsv(fclContent: string): string {
  const lines = fclContent.split(/\r?\n/);
  const trimbleRows: string[] = [];
  
  // Add Header
  trimbleRows.push('Feature Code,Description,Feature Type,Layer');

  for (const line of lines) {
    if (!line.trim()) continue;

    // FCL is typically comma-delimited
    const parts = line.split(',').map(p => p.trim());
    
    if (parts.length >= 5) {
      const code = parts[0];
      const polyline = parts[1].toUpperCase();
      const polyline3d = parts[2].toUpperCase();
      const layer = parts[3];
      const description = parts.slice(4).join(','); // Description might contain commas if not quoted correctly, though unlikely in standard FCL

      const featureType = (polyline === 'Y' || polyline3d === 'Y') ? 'Line' : 'Point';

      // Escape quotes for CSV
      const escapedDesc = description.replace(/"/g, '""');
      const escapedLayer = layer.replace(/"/g, '""');
      const escapedCode = code.replace(/"/g, '""');

      trimbleRows.push(`"${escapedCode}","${escapedDesc}","${featureType}","${escapedLayer}"`);
    }
  }

  return trimbleRows.join('\n');
}

/**
 * Triggers a download of the converted CSV
 */
export function downloadTrimbleCsv(csvContent: string, fileName: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName.replace(/\.[^/.]+$/, "") + "_trimble.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
