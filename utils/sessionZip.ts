// utils/sessionZip.ts
// Pure utility functions for session ZIP file handling - NO STATE, NO HOOKS

import JSZip from 'jszip';
import { AgentType, SessionState, SessionFile, SessionSaveOptions } from '../types';

/**
 * Extracts the raw base64 payload from a value that may be either a full data URI
 * (`data:image/png;base64,AAAA`) or a bare base64 string (`AAAA`). Returns null
 * when the value cannot yield usable base64 so callers can skip it safely instead
 * of throwing and aborting the entire save.
 */
const extractBase64Payload = (fileData: string): string | null => {
  if (!fileData) return null;
  const commaIndex = fileData.indexOf(',');
  const payload = fileData.startsWith('data:') && commaIndex !== -1
    ? fileData.slice(commaIndex + 1)
    : fileData;
  return payload.trim().length > 0 ? payload.trim() : null;
};

/**
 * Ensures every file added to the archive has a unique, non-empty entry name so
 * later files never silently overwrite earlier ones (JSZip is last-write-wins).
 * `manifest.json` is reserved for the session manifest.
 */
const makeUniqueName = (rawName: string, used: Set<string>): string => {
  let base = (rawName || 'file').replace(/[\\/]+/g, '_').trim() || 'file';
  if (base.toLowerCase() === 'manifest.json') {
    base = `file_${base}`;
  }
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let counter = 1;
  let candidate = `${stem}_${counter}${ext}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${stem}_${counter}${ext}`;
  }
  used.add(candidate);
  return candidate;
};

const sanitizeNameSegment = (value: string | undefined): string => {
  return (value || '')
    .trim()
    .replace(/\.(lsvz|zip)$/i, '')
    .replace(/[^a-z0-9._-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
};

const formatTimestampSegment = (savedAt: string | undefined): string => {
  const date = savedAt ? new Date(savedAt) : new Date();
  if (Number.isNaN(date.getTime())) return '';

  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
};

const formatAgentSegment = (activeAgent: AgentType | undefined): string => {
  return sanitizeNameSegment(activeAgent || '');
};

/**
 * Creates a .lsvz ZIP file from session state and files.
 * This is a pure function that takes all data as parameters.
 *
 * Hardened so a single malformed file (e.g. bad base64) does not abort the whole
 * save, duplicate/empty file names cannot clobber each other, and the caller gets
 * a clear, actionable error when the manifest cannot be serialized.
 *
 * @param sessionState - The complete session state object
 * @param files - Array of SessionFiles to include in the ZIP (rawFile, deedFile, etc.)
 * @returns Promise<Blob> - The ZIP file blob
 */
export const createSessionZip = async (
  sessionState: SessionState,
  files: { name?: string; content?: string; fileData?: string }[]
): Promise<Blob> => {
  const zip = new JSZip();

  // Write manifest. Serialize defensively so a non-serializable value (circular
  // reference, BigInt, etc.) produces a clear error instead of a cryptic failure.
  let manifestJson: string;
  try {
    manifestJson = JSON.stringify(sessionState, null, 2);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to serialize session manifest: ${detail}`);
  }
  if (!manifestJson) {
    throw new Error('Failed to serialize session manifest: empty result.');
  }
  zip.file('manifest.json', manifestJson);

  // Add all provided files, skipping anything unusable rather than throwing.
  const usedNames = new Set<string>(['manifest.json']);
  for (const file of Array.isArray(files) ? files : []) {
    if (!file || !file.name) continue;

    // Prefer base64 image payloads; fall back to text/document content.
    if (file.fileData) {
      const base64Data = extractBase64Payload(file.fileData);
      if (base64Data === null) continue;
      try {
        zip.file(makeUniqueName(file.name, usedNames), base64Data, { base64: true });
      } catch {
        // Corrupt base64 for one file must not sink the whole session save.
        continue;
      }
    } else if (typeof file.content === 'string') {
      zip.file(makeUniqueName(file.name, usedNames), file.content);
    }
  }

  // Generate the archive. DEFLATE keeps large sessions (point databases, chat
  // histories, embedded imagery) from producing oversized .lsvz files.
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/x-landsurvai-session',
  });

  if (!blob || blob.size === 0) {
    throw new Error('Session archive generation produced an empty file.');
  }
  return new Blob([blob], { type: 'application/x-landsurvai-session' });
};

/**
 * Extracts the suggested filename from session data.
 *
 * @param jobName - Job name from jobInfo
 * @param fileNames - Array of fallback filenames (rawFile.name, deedFile.name, etc.)
 * @returns Suggested session filename
 */
export const generateSessionFileName = (
  jobName: string | undefined,
  fileNames: (string | undefined)[],
  options: SessionSaveOptions = {}
): string => {
  const fallback = Array.isArray(fileNames) ? fileNames.find(f => f && f.trim()) : undefined;
  const baseName = options.fileName?.trim() || (jobName && jobName.trim()) || (fallback && fallback.trim()) || 'session';
  const segments = ['landsurvai_session'];
  const cleanedBase = sanitizeNameSegment(baseName) || 'session';
  segments.push(cleanedBase);

  if (options.includeJobNumberInName) {
    const jobNumberSegment = sanitizeNameSegment(options.jobNumber);
    if (jobNumberSegment) segments.push(jobNumberSegment);
  }

  if (options.includeActiveAgentInName) {
    const agentSegment = formatAgentSegment(options.activeAgent);
    if (agentSegment) segments.push(agentSegment);
  }

  if (options.includeAuthorInName) {
    const authorSegment = sanitizeNameSegment(options.author);
    if (authorSegment) segments.push(authorSegment);
  }

  if (options.includeTimestampInName) {
    const timestampSegment = formatTimestampSegment(options.savedAt);
    if (timestampSegment) segments.push(timestampSegment);
  }

  return `${segments.join('_').slice(0, 180)}.lsvz`;
};
