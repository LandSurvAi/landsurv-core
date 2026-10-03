// utils/sessionDefaults.ts
// Pure constants for session management - NO LOGIC, just data

import { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  coordinatePrecision: 2,
  linearUnits: 'usSurveyFoot',
  zoomToPointLevel: 20,
  projection: { state: null, zoneName: null, epsg: null },
  defaultCutSheetInfo: { companyName: 'Your Company', crewChief: 'Crew Chief' },
  ntrip: { enabled: false, host: '', port: 2101, mountpoint: '', username: '', password: '' },
  donationRequestTimer: 0,
  northArrowStyle: 'classic',
  northArrowPosition: 'right',
  pointLabelingSettings: { style: 'numeric', prefix: '', nextNumber: 1 },
  uncertaintySensitivity: 'medium',
  pointAttributeScaling: 'screen',
  showPointSymbols: false,
  debugPreflightEstimate: false,
  debugGimbalHud: false,
  floodHatch: { style: 'lines', scale: 50, opacity: 0.18 },
  googleMaps: {
    enabled: false,
    apiKey: '',
    mapType: 'naip',
    opacity: 1.0,
    scale: 2,
    showLabels: true,
  },
};

// Compatible session versions for loading
// Supports both old semantic versioning (1.x.x) and new date-based versioning (YY.MM.DD.xx)
export const COMPATIBLE_VERSIONS = [
  // Legacy semantic versions
  "1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0", "1.6.0", "1.7.0", "1.8.0", "1.9.0",
  "1.10.0", "1.11.0", "1.12.0", "1.13.0", "1.14.0", "1.15.0", "1.16.0", "1.17.0", "1.18.0", "1.19.0",
  "1.20.0", "1.21.0", "1.22.0", "1.23.0", "1.24.0", "1.25.0", "1.26.0", "1.27.0", "1.27.1", "1.28.0",
  "1.29.0", "1.30.0", "1.31.0", "1.32.0", "1.33.0", "1.34.0", "1.35.0", "1.36.0", "1.37.0", "1.38.0", "1.39.0",
  // New date-based versioning (YY.MM.DD.xx format) - add new versions here
  "25.12.24.01", "25.12.24.02", "25.12.25.01", "25.12.26.01", "25.12.27.01", "25.12.28.01",
  "25.12.29.01", "25.12.30.01", "25.12.31.01",
  "26.01.01.01", "26.01.02.01", "26.01.02.02", "26.01.03.01", "26.01.04.01", "26.01.04.02",
  "26.01.05.01"
];

export const LSVZ_VERSION_BOUNDARIES = {
  GUARANTEED_FLOOR: '1.8.0',
  SEMVER_FLOOR_MAJOR: 1,
  DATE_VERSION_PATTERN: /^\d{2}\.\d{2}\.\d{2}\.\d{2}$/,
  SEMVER_PATTERN: /^\d+\.\d+\.\d+(\.\d+)?$/,
} as const;

/**
 * Checks if a version string is valid/compatible.
 * Accepts:
 * - Any version in the COMPATIBLE_VERSIONS list
 * - Any date-based version matching pattern YY.MM.DD.xx (e.g., 26.01.02.02)
 * - Any semantic version >= 1.0.0
 */
export const isVersionCompatible = (version: string | undefined): boolean => {
  if (!version) return false;
  
  // Check explicit list first
  if (COMPATIBLE_VERSIONS.includes(version)) return true;
  
  // Check for date-based versioning pattern (YY.MM.DD.xx)
  if (LSVZ_VERSION_BOUNDARIES.DATE_VERSION_PATTERN.test(version)) return true;
  
  // Check for semantic versioning pattern (X.Y.Z or X.Y.Z.W)
  if (LSVZ_VERSION_BOUNDARIES.SEMVER_PATTERN.test(version)) return true;
  
  return false;
};
