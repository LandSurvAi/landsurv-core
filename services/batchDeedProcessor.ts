import type {
  DeedBatchFileRecord,
  DeedBatchFileStatus,
  DeedBatchJob,
  DeedBatchJobStatus,
  ParcelMatchCandidate,
  ParcelMatchInput,
  ParcelMatchResult,
  AlignmentDecision,
  ParcelMatchScoreBreakdown,
  SessionFile,
  DeedSummary,
} from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// County adapter preflight — validates a GIS service before a batch run starts
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchPreflightIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface BatchPreflightResult {
  passed: boolean;
  issues: BatchPreflightIssue[];
}

/**
 * Lightweight preflight check that interrogates a county ArcGIS FeatureServer
 * layer's metadata (via `?f=json`) and verifies that the fields configured in
 * `parcelIdFields` and `ownerFields` actually exist on the layer.  Returns
 * errors for missing required fields and warnings for missing optional ones.
 *
 * Call this before starting a batch run to catch misconfigured county adapters
 * without spending tokens or executing queries.
 */
export const runCountyAdapterPreflight = async (
  serviceUrl: string,
  parcelIdFields: string[],
  ownerFields: string[],
  deedBookFields?: string[],
  deedPageFields?: string[],
): Promise<BatchPreflightResult> => {
  const issues: BatchPreflightIssue[] = [];

  try {
    const resp = await fetch(`${serviceUrl}?f=json`);
    if (!resp.ok) {
      issues.push({ level: 'error', message: `County service unreachable (HTTP ${resp.status}): ${serviceUrl}` });
      return { passed: false, issues };
    }
    const meta = await resp.json();
    if (meta.error) {
      issues.push({ level: 'error', message: `County service error: ${meta.error.message ?? JSON.stringify(meta.error)}` });
      return { passed: false, issues };
    }

    const existingFields = new Set<string>(
      (meta.fields as Array<{ name: string }> | undefined ?? []).map(f => f.name.toUpperCase()),
    );

    const foundParcelId = parcelIdFields.some(f => existingFields.has(f.toUpperCase()));
    if (!foundParcelId) {
      issues.push({
        level: 'error',
        message: `No parcel ID field found (tried: ${parcelIdFields.join(', ')}). Batch matching will not work.`,
      });
    }

    const foundOwner = ownerFields.some(f => existingFields.has(f.toUpperCase()));
    if (!foundOwner) {
      issues.push({
        level: 'warning',
        message: `No owner field found (tried: ${ownerFields.join(', ')}). Owner-name matching will be skipped.`,
      });
    }

    if (deedBookFields) {
      const foundBook = deedBookFields.some(f => existingFields.has(f.toUpperCase()));
      if (!foundBook) {
        issues.push({
          level: 'warning',
          message: `No deed-book field found (tried: ${deedBookFields.join(', ')}). Deed-ref matching will be skipped.`,
        });
      }
    }

    if (deedPageFields) {
      const foundPage = deedPageFields.some(f => existingFields.has(f.toUpperCase()));
      if (!foundPage) {
        issues.push({
          level: 'warning',
          message: `No deed-page field found (tried: ${deedPageFields.join(', ')}). Deed-ref matching will be skipped.`,
        });
      }
    }
  } catch (err) {
    issues.push({ level: 'error', message: `Preflight network error: ${err instanceof Error ? err.message : String(err)}` });
    return { passed: false, issues };
  }

  const hasErrors = issues.some(i => i.level === 'error');
  return { passed: !hasErrors, issues };
};

const nowIso = () => new Date().toISOString();

const normalize = (value?: string | null): string => {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

const normalizeLoose = (value?: string | null): string => {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
};

const tokenSet = (value?: string | null): Set<string> => {
  const normalized = normalizeLoose(value);
  if (!normalized) return new Set();
  return new Set(
    normalized
      .split(/[^a-z0-9]+/)
      .map(s => s.trim())
      .filter(Boolean),
  );
};

const jaccardSimilarity = (a?: string | null, b?: string | null): number => {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  const union = aTokens.size + bTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
};

const toConfidence = (score: number): 'high' | 'medium' | 'low' => {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
};

export const createDeedBatchJob = (
  files: SessionFile[],
  label = 'Deed Batch',
): DeedBatchJob => {
  const createdAt = nowIso();
  const records: DeedBatchFileRecord[] = files.map((file, index) => ({
    id: `deed-batch-file-${Date.now()}-${index}`,
    sourceIndex: index,
    fileName: file.name,
    selectedPages: file.selectedPages,
    status: 'queued',
    updatedAt: createdAt,
  }));

  return {
    id: `deed-batch-${Date.now()}`,
    label,
    createdAt,
    updatedAt: createdAt,
    status: 'created',
    files: records,
    totalFiles: records.length,
    processedFiles: 0,
    failedFiles: 0,
  };
};

export const setDeedBatchJobStatus = (
  job: DeedBatchJob,
  status: DeedBatchJobStatus,
): DeedBatchJob => ({
  ...job,
  status,
  updatedAt: nowIso(),
});

export const updateDeedBatchFileStatus = (
  job: DeedBatchJob,
  fileId: string,
  status: DeedBatchFileStatus,
  patch: Partial<Pick<DeedBatchFileRecord, 'error' | 'summary'>> = {},
): DeedBatchJob => {
  const updatedAt = nowIso();
  const files = job.files.map(file => {
    if (file.id !== fileId) return file;
    return {
      ...file,
      status,
      updatedAt,
      ...patch,
    };
  });

  const processedStatuses: DeedBatchFileStatus[] = ['summarized', 'parsed', 'matched', 'aligned', 'review-required', 'completed', 'failed'];
  const processedFiles = files.filter(file => processedStatuses.includes(file.status)).length;
  const failedFiles = files.filter(file => file.status === 'failed').length;

  return {
    ...job,
    files,
    updatedAt,
    processedFiles,
    failedFiles,
  };
};

export const finalizeDeedBatchJob = (job: DeedBatchJob): DeedBatchJob => {
  const hasFailures = job.files.some(file => file.status === 'failed');
  const hasPending = job.files.some(file => file.status === 'queued' || file.status === 'extracting' || file.status === 'summarizing');
  const status: DeedBatchJobStatus = hasPending ? 'running' : hasFailures ? 'failed' : 'completed';
  return setDeedBatchJobStatus(job, status);
};

export const scoreParcelMatchCandidates = (
  input: ParcelMatchInput,
  candidates: ParcelMatchCandidate[],
): ParcelMatchResult[] => {
  const inputParcel = normalize(input.parcelId);
  const inputBook = normalize(input.deedBook);
  const inputPage = normalize(input.deedPage);
  const inputBlock = normalize(input.block);
  const inputUnit = normalize(input.unit);

  const results = candidates.map(candidate => {
    const explanation: string[] = [];
    const parcelIdMatch = inputParcel && normalize(candidate.parcelId) === inputParcel;
    const deedBookMatch = inputBook && normalize(candidate.deedBook) === inputBook;
    const deedPageMatch = inputPage && normalize(candidate.deedPage) === inputPage;
    const blockMatch = inputBlock && normalize(candidate.block) === inputBlock;
    const unitMatch = inputUnit && normalize(candidate.unit) === inputUnit;

    const ownerSimilarity = jaccardSimilarity(input.ownerName, candidate.ownerName);

    const breakdown: ParcelMatchScoreBreakdown = {
      parcelId: parcelIdMatch ? 45 : 0,
      ownerName: ownerSimilarity >= 0.9 ? 30 : ownerSimilarity >= 0.7 ? 20 : ownerSimilarity >= 0.5 ? 12 : 0,
      deedRef: deedBookMatch && deedPageMatch ? 18 : deedBookMatch || deedPageMatch ? 10 : 0,
      blockUnit: blockMatch && unitMatch ? 7 : blockMatch || unitMatch ? 4 : 0,
      penalties: 0,
      total: 0,
    };

    if (parcelIdMatch) explanation.push('Parcel ID exact match.');
    if (ownerSimilarity >= 0.7) explanation.push(`Owner name similarity ${(ownerSimilarity * 100).toFixed(0)}%.`);
    if (deedBookMatch || deedPageMatch) explanation.push('Deed book/page corroborated.');
    if (blockMatch || unitMatch) explanation.push('Block/unit corroborated.');

    // Penalize strong conflicts when key metadata disagrees and input has values.
    if (inputParcel && !parcelIdMatch && normalize(candidate.parcelId)) {
      breakdown.penalties -= 10;
      explanation.push('Parcel ID conflict penalty applied.');
    }

    if (inputBook && normalize(candidate.deedBook) && !deedBookMatch) {
      breakdown.penalties -= 4;
      explanation.push('Deed book mismatch penalty applied.');
    }

    if (inputPage && normalize(candidate.deedPage) && !deedPageMatch) {
      breakdown.penalties -= 4;
      explanation.push('Deed page mismatch penalty applied.');
    }

    breakdown.total = Math.max(0, breakdown.parcelId + breakdown.ownerName + breakdown.deedRef + breakdown.blockUnit + breakdown.penalties);

    return {
      candidate,
      score: breakdown.total,
      confidence: toConfidence(breakdown.total),
      breakdown,
      explanation,
    } satisfies ParcelMatchResult;
  });

  return results.sort((a, b) => b.score - a.score);
};

export const decideAlignmentAction = (matchResult?: ParcelMatchResult | null): AlignmentDecision => {
  if (!matchResult) {
    return {
      action: 'manual-review',
      confidence: 'low',
      reason: 'No parcel match candidate is available.',
    };
  }

  if (matchResult.confidence === 'high') {
    return {
      action: 'auto-align',
      confidence: 'high',
      reason: 'High-confidence parcel match satisfied auto-alignment policy.',
    };
  }

  if (matchResult.confidence === 'medium') {
    return {
      action: 'prompt',
      confidence: 'medium',
      reason: 'Medium-confidence parcel match requires operator approval.',
    };
  }

  return {
    action: 'manual-review',
    confidence: 'low',
    reason: 'Low-confidence parcel match should be reviewed manually.',
  };
};

export const summarizeCompletedBatchFiles = (job: DeedBatchJob): { completed: number; failed: number; total: number } => {
  const completed = job.files.filter(file => file.status === 'summarized' || file.status === 'completed').length;
  const failed = job.files.filter(file => file.status === 'failed').length;
  return { completed, failed, total: job.totalFiles };
};

export const pickPrimarySummary = (job: DeedBatchJob): DeedSummary | null => {
  const firstWithSummary = job.files.find(file => !!file.summary);
  return firstWithSummary?.summary ?? null;
};

/**
 * Export all processed batch files as a RFC-4180 CSV string.
 * Columns: File, Status, Tracts, Owner, ParcelId, Book, Page,
 *          MatchParcelId, MatchOwner, MatchScore, MatchConfidence, AlignAction, Error
 */
export const exportBatchJobAsCsv = (job: DeedBatchJob): string => {
  const esc = (v: string | null | undefined): string => {
    if (v == null || v === '') return '';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const header = [
    'File', 'Status', 'Tracts',
    'Owner', 'ParcelId', 'Book', 'Page',
    'MatchParcelId', 'MatchOwner', 'MatchScore', 'MatchConfidence',
    'AlignAction', 'Error',
  ].join(',');

  const rows = job.files.map(file => {
    const summary = file.summary;
    return [
      esc(file.fileName),
      esc(file.status),
      esc(String(summary?.tracts.length ?? 0)),
      esc(summary?.owner ?? ''),
      esc(summary?.parcelId ?? ''),
      esc(summary?.book ?? ''),
      esc(summary?.page ?? ''),
      esc(file.topMatch?.candidate.parcelId ?? ''),
      esc(file.topMatch?.candidate.ownerName ?? ''),
      esc(file.topMatch != null ? String(file.topMatch.score) : ''),
      esc(file.topMatch?.confidence ?? ''),
      esc(file.alignmentDecision?.action ?? ''),
      esc(file.error ?? ''),
    ].join(',');
  });

  return [header, ...rows].join('\r\n');
};

export const applyBatchParcelMatching = (
  job: DeedBatchJob,
  candidates: ParcelMatchCandidate[],
): DeedBatchJob => {
  if (candidates.length === 0) return job;

  const updatedAt = nowIso();
  let changed = false;

  const files = job.files.map(file => {
    if (!file.summary) return file;
    if (file.status !== 'summarized' && file.status !== 'parsed' && file.status !== 'matched' && file.status !== 'review-required') {
      return file;
    }

    const input: ParcelMatchInput = {
      parcelId: file.summary.parcelId ?? null,
      ownerName: file.summary.owner ?? null,
      deedBook: file.summary.book ?? null,
      deedPage: file.summary.page ?? null,
    };

    const topMatch = scoreParcelMatchCandidates(input, candidates)[0];
    const alignmentDecision = decideAlignmentAction(topMatch);
    const nextStatus: DeedBatchFileStatus =
      alignmentDecision.action === 'manual-review' ? 'review-required' : 'matched';

    if (
      file.status !== nextStatus ||
      file.topMatch?.score !== topMatch?.score ||
      file.alignmentDecision?.action !== alignmentDecision.action
    ) {
      changed = true;
    }

    return {
      ...file,
      status: nextStatus,
      topMatch,
      alignmentDecision,
      updatedAt,
    };
  });

  if (!changed) return job;

  const processedStatuses: DeedBatchFileStatus[] = ['summarized', 'parsed', 'matched', 'aligned', 'review-required', 'completed', 'failed'];
  const processedFiles = files.filter(file => processedStatuses.includes(file.status)).length;
  const failedFiles = files.filter(file => file.status === 'failed').length;

  return {
    ...job,
    files,
    updatedAt,
    processedFiles,
    failedFiles,
  };
};
