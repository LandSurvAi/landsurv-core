/**
 * Deed artifact capture and .lsvz export.
 *
 * When a deed is processed the source, summary, drafted boundary files,
 * closure reports, and deed chat are browser-only. This service snapshots that
 * material, sends it to the deed ledger's artifact endpoint, and later turns the
 * stored artifact into a normal `.lsvz` project that opens in the workspace.
 */

import { AgentType, type BoundaryFile, type ChatMessage, type ClosureReport, type DeedSummary, type SessionFile, type SessionState } from '../types.ts';
import { getDeviceFingerprint } from './deviceFingerprint.ts';
import { resolveDeedIdentity } from './deedCredits.ts';
import { APP_VERSION } from '../utils/appVersion.ts';
import { createSessionZip, generateSessionFileName } from '../utils/sessionZip.ts';
import { DEFAULT_SETTINGS } from '../utils/sessionDefaults.ts';

export interface DeedArtifactSource {
  name: string;
  content?: string;
  fileData?: string;
}

export interface DeedArtifact {
  fingerprintId: string;
  deedName: string | null;
  fileType: string | null;
  email: string | null;
  userId: string | null;
  capturedAt: string;
  source: DeedArtifactSource | null;
  deedSummary: DeedSummary | null;
  boundaryFiles: BoundaryFile[];
  closureReports: ClosureReport[];
  deedChatHistory: ChatMessage[];
  draftText: string | null;
}

export interface DeedArtifactCaptureInput {
  deedFile: SessionFile;
  deedSummary: DeedSummary | null;
  boundaryFiles: BoundaryFile[];
  closureReports: ClosureReport[];
  deedChatHistory: ChatMessage[];
}

const SOURCE_CONTENT_LIMIT = 600_000;
const SOURCE_FILE_LIMIT = 1_200_000;
const CHAT_HISTORY_LIMIT = 40;

function apiBase(): string {
  const env = (import.meta as any)?.env;
  const configured = env?.VITE_API_URL as string | undefined;
  if (!configured) return '';
  return configured.replace(/\/api\/?$/, '');
}

function trim(value: string | undefined, max: number): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value.slice(0, max);
}

function describeDraft(boundaryFiles: BoundaryFile[]): string | null {
  if (boundaryFiles.length === 0) return null;
  return boundaryFiles
    .map((boundary) => {
      const confidence = boundary.deedConfidence
        ? ` · ${boundary.deedConfidence.level} confidence`
        : '';
      const source = boundary.sourceTractId ? ` · ${boundary.sourceTractId}` : '';
      return `${boundary.name}: ${boundary.calls.length} course${boundary.calls.length === 1 ? '' : 's'}${source}${confidence}`;
    })
    .join('\n');
}

/**
 * Build the client-side artifact payload. Large binary/source fields are capped
 * here and again on the server; the extraction result and draft geometry are
 * kept intact so the DevOps export remains useful for review and training.
 */
export function buildDeedArtifactPayload(
  input: DeedArtifactCaptureInput,
  identity: { fingerprintId: string; email: string | null; userId: string | null },
): DeedArtifact {
  const deed = input.deedFile;
  const source: DeedArtifactSource | null = deed
    ? {
        name: deed.name || 'deed',
        content: trim(deed.content, SOURCE_CONTENT_LIMIT),
        fileData: trim(deed.fileData, SOURCE_FILE_LIMIT),
      }
    : null;

  return {
    fingerprintId: identity.fingerprintId,
    deedName: deed?.name ?? null,
    fileType: deed?.name && deed.name.includes('.') ? deed.name.split('.').pop()?.toLowerCase() ?? null : null,
    email: identity.email,
    userId: identity.userId,
    capturedAt: new Date().toISOString(),
    source,
    deedSummary: input.deedSummary ?? null,
    boundaryFiles: input.boundaryFiles ?? [],
    closureReports: input.closureReports ?? [],
    deedChatHistory: (input.deedChatHistory ?? []).slice(-CHAT_HISTORY_LIMIT),
    draftText: describeDraft(input.boundaryFiles ?? []),
  };
}

/** Best-effort capture. It must never delay or block deed processing. */
export async function uploadDeedArtifact(input: DeedArtifactCaptureInput): Promise<boolean> {
  try {
    const fingerprint = await getDeviceFingerprint();
    if (!fingerprint.id) return false;
    const identity = resolveDeedIdentity();
    const artifact = buildDeedArtifactPayload(input, {
      fingerprintId: fingerprint.id,
      email: identity.email,
      userId: identity.userId,
    });

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15_000) : null;
    try {
      const response = await fetch(`${apiBase()}/api/deeds/artifact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprintId: fingerprint.id,
          email: identity.email,
          userId: identity.userId,
          artifact,
        }),
        cache: 'no-store',
        signal: controller?.signal,
      });
      return response.ok;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[DeedArtifact] capture failed:', err);
    return false;
  }
}

function emptyChatHistory(): ChatMessage[] {
  return [];
}

/**
 * Convert a stored deed artifact into a `.lsvz` manifest. The manifest is a
 * normal SessionState so the workspace loader accepts it, with an additional
 * `deedArtifact` block that makes the user, results, and draft explicit to a
 * human opening the archive or training from it.
 */
export async function buildDeedArtifactLsvz(artifact: DeedArtifact): Promise<{ blob: Blob; fileName: string }> {
  const deedFile: SessionFile | null = artifact.source
    ? {
        name: artifact.source.name,
        content: artifact.source.content ?? '',
        fileData: artifact.source.fileData,
      }
    : null;
  const jobName = artifact.deedName?.replace(/\.[^.]+$/, '') || 'Deed review';
  const boundaryFiles = artifact.boundaryFiles ?? [];
  const closureReports = artifact.closureReports ?? [];

  const manifest: Record<string, unknown> = {
    version: APP_VERSION,
    savedAt: artifact.capturedAt,
    sessionMetadata: {
      note: `Deed processing artifact captured ${artifact.capturedAt}.`,
      exportedByAgent: AgentType.DEED_READER,
      includeTimestampInName: false,
    },
    settings: DEFAULT_SETTINGS,
    rawFile: null,
    deedFile,
    planFiles: null,
    dxfFile: null,
    clFile: null,
    imageFiles: null,
    gisFile: null,
    generatedFiles: [],
    pdfViewerFiles: deedFile ? [deedFile] : null,
    pdfHighlights: [],
    customSymbols: [],
    customAnnotations: [],
    annotationScale: 1,
    closureReports,
    boundaryFiles,
    dimensions: [],
    jobInfo: {
      jobName,
      jobNo: '',
      clientEmail: artifact.email ?? undefined,
      jobScope: 'Deed extraction, drafted boundary, and closure review.',
    },
    rawChatHistory: [],
    deedChatHistory: artifact.deedChatHistory ?? [],
    civilDrafterChatHistory: emptyChatHistory(),
    dxfChatHistory: emptyChatHistory(),
    stationingChatHistory: emptyChatHistory(),
    pointEditorChatHistory: emptyChatHistory(),
    fieldbookChatHistory: emptyChatHistory(),
    gpsStakeoutChatHistory: emptyChatHistory(),
    lsvzChatHistory: emptyChatHistory(),
    planExpertChatHistory: emptyChatHistory(),
    imageAnalyzerChatHistory: emptyChatHistory(),
    gisChatHistory: emptyChatHistory(),
    contouringChatHistory: emptyChatHistory(),
    profileChatHistory: emptyChatHistory(),
    cogoChatHistory: emptyChatHistory(),
    rinexChatHistory: emptyChatHistory(),
    zoningChatHistory: emptyChatHistory(),
    standardsComplianceChatHistory: emptyChatHistory(),
    fieldbookNotes: '',
    pointLists: [{ id: 'working', name: 'Deed draft', points: [], isVisible: true }],
    lines: [],
    contourLabels: [],
    centerlines: [],
    wmsServices: [],
    activeWmsLayers: [],
    offlineMapAreas: [],
    cutSheetData: [],
    cutSheetInfo: {
      projectName: jobName,
      projectNumber: '',
      date: artifact.capturedAt.slice(0, 10),
      companyName: '',
      crewChief: '',
    },
    uiState: {
      activeAgent: AgentType.DEED_READER,
      activeModel: '',
      activeVisualPanel: 'canvas',
      isPdfViewerFullscreen: false,
      isVisualPanelFullscreen: false,
      attributeScale: 1,
      lineLabelScale: 1,
      dimensionScale: 1,
      symbolScale: 1,
      pointLayers: [],
      activeTextEditorFile: null,
      isPointEditorFullscreen: false,
      isChatPanelVisible: true,
      linesVisible: true,
      centerlinesVisible: true,
      activeBoundaryFileId: boundaryFiles[0]?.id ?? null,
      showRotatedBearings: false,
    },
    deedArtifact: {
      capturedAt: artifact.capturedAt,
      submittedBy: {
        fingerprintId: artifact.fingerprintId,
        email: artifact.email,
        userId: artifact.userId,
      },
      deedName: artifact.deedName,
      fileType: artifact.fileType,
      summary: artifact.deedSummary,
      draft: {
        boundaryFiles,
        closureReports,
        draftText: artifact.draftText,
      },
      chatMessageCount: (artifact.deedChatHistory ?? []).length,
    },
  };

  const files = deedFile ? [deedFile] : [];
  const blob = await createSessionZip(manifest as unknown as SessionState, files);
  const fileName = generateSessionFileName(jobName, [artifact.deedName ?? undefined, artifact.email ?? undefined], {
    author: artifact.email ?? undefined,
    savedAt: artifact.capturedAt,
    includeTimestampInName: false,
  });
  return { blob, fileName };
}
