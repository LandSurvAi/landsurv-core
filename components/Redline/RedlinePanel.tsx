import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CanvasTextAnnotation,
  Centerline,
  RedlineItem,
  RedlineItemStatus,
  RedlinePatchOp,
  RedlineReadingMode,
  RedlineRun,
  RedlineSheet,
  SessionFile,
  SurveyLine,
  SurveyPoint,
} from '../../types';
import {
  extractRedlinePackage,
  type RedlinePackageInventory,
} from '../../services/redline/annotationExtraction';
import {
  assignRedlineRevision,
  buildRedlineRun,
  computeRunMetrics,
  isLowRiskTextItem,
  setRedlineItemStatus,
  summarizeRedlineRun,
} from '../../services/redline/worklist';
import {
  buildRedlineResponsePackage,
} from '../../services/redline/responseRegistry';
import {
  describeRegistration,
  solveTwoPointCalibration,
  type PagePoint,
} from '../../utils/redlineCalibration';
import { registerRedlineRuntime } from '../../services/redline/redlineRuntime';
import { RedlineIcon } from '../icons';
import { RedlineCalibrationCanvas } from './RedlineCalibrationCanvas';

export interface RedlinePatchResult {
  success: boolean;
  applied: boolean;
  errors: string[];
  verification?: unknown;
}

export interface RedlinePanelProps {
  isOpen: boolean;
  onClose?: () => void;
  /** 'surface' lets the A2UI host own the outer chrome. */
  chrome?: 'panel' | 'surface';
  runs: RedlineRun[];
  onRunsChange: React.Dispatch<React.SetStateAction<RedlineRun[]>>;
  activeRunId: string | null;
  onActiveRunIdChange: (runId: string | null) => void;
  pdfFiles: SessionFile[];
  points: SurveyPoint[];
  lines: SurveyLine[];
  textAnnotations: CanvasTextAnnotation[];
  centerlines: Centerline[];
  onAddPdfFiles: (files: SessionFile[]) => void;
  /** Configured model for the optional Deep-mode vision pass. */
  activeModel: string;
  userApiKey?: string;
  /** Worklist row selected on the drawing canvas, if any. */
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string | null) => void;
  /** Reading mode selected in the chat/intake package widget. */
  requestedMode?: RedlineReadingMode;
  applyPatch: (
    run: RedlineRun,
    item: RedlineItem,
    ops: RedlinePatchOp[],
    undoLabel: string,
  ) => Promise<RedlinePatchResult>;
  onNotify?: (message: string) => void;
}

type Phase = 'setup' | 'calibrate' | 'review';

interface CalibrationInput {
  aEasting: string;
  aNorthing: string;
  bEasting: string;
  bNorthing: string;
}

const EMPTY_INPUT: CalibrationInput = { aEasting: '', aNorthing: '', bEasting: '', bNorthing: '' };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the PDF.'));
    reader.readAsDataURL(file);
  });
}

function statusTone(status: RedlineItemStatus): string {
  switch (status) {
    case 'applied':
    case 'verified':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    case 'approved':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-300';
    case 'rejected':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
    case 'needs_clarification':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'human_action':
      return 'border-orange-500/40 bg-orange-500/10 text-orange-300';
    case 'deferred':
      return 'border-slate-500/40 bg-slate-500/10 text-slate-300';
    default:
      return 'border-red-500/40 bg-red-500/10 text-red-300';
  }
}

function statusLabel(status: RedlineItemStatus): string {
  return status.replace(/_/g, ' ');
}

function freshnessLabel(run: RedlineRun | null): string {
  if (!run) return 'No run loaded';
  return summarizeRedlineRun(run);
}

function inverseOpsFor(item: RedlineItem): RedlinePatchOp[] | null {
  const op = item.proposal?.[0];
  if (!op) return null;
  if (op.op === 'update_text' && typeof op.before?.text === 'string') {
    return [{ ...op, before: undefined, after: { text: op.before.text } }];
  }
  if (op.op === 'delete_entity') {
    const before = (op.before ?? {}) as Record<string, unknown>;
    const payload = op.entityType === 'line'
      ? before.line
      : op.entityType === 'point'
        ? before.point
        : before;
    if (!payload) return null;
    return [{
      op: 'add_entity',
      entityType: op.entityType,
      entityId: op.entityId,
      after: payload as Record<string, unknown>,
    }];
  }
  return null;
}

/**
 * Redline workspace: package intake, two-point calibration, editable worklist,
 * application through the Civil Drafter, revision block, and run metrics.
 */
export const RedlinePanel: React.FC<RedlinePanelProps> = ({
  isOpen,
  onClose,
  chrome = 'panel',
  runs,
  onRunsChange,
  activeRunId,
  onActiveRunIdChange,
  pdfFiles,
  points,
  lines,
  textAnnotations,
  centerlines,
  onAddPdfFiles,
  activeModel,
  userApiKey,
  selectedItemId,
  onSelectItem,
  requestedMode,
  applyPatch,
  onNotify,
}) => {
  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<RedlineReadingMode>('fast');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [draft, setDraft] = useState<RedlinePackageInventory | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [activeCalibrationPoint, setActiveCalibrationPoint] = useState<'a' | 'b'>('a');
  const [picks, setPicks] = useState<Record<string, { a?: PagePoint; b?: PagePoint }>>({});
  const [inputs, setInputs] = useState<Record<string, CalibrationInput>>({});
  const [busy, setBusy] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RedlineItemStatus>('all');
  const [sheetFilter, setSheetFilter] = useState<string>('all');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualIntent, setManualIntent] = useState('');
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [revisionBase, setRevisionBase] = useState('0');
  const [revisionDescription, setRevisionDescription] = useState('');
  const [revisionBy, setRevisionBy] = useState('');
  const [revisionCheckedBy, setRevisionCheckedBy] = useState('');
  const [revisionDate, setRevisionDate] = useState(new Date().toISOString().slice(0, 10));
  const knownPdfNames = useRef<Set<string> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (requestedMode) setMode(requestedMode);
  }, [requestedMode]);

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? runs[runs.length - 1] ?? null,
    [runs, activeRunId],
  );

  useEffect(() => {
    const candidates = pdfFiles.filter((file) => file.fileData || /\.pdf$/i.test(file.name));
    const firstLoad = knownPdfNames.current === null;
    const previousNames = knownPdfNames.current ?? new Set<string>();
    const addedNames = candidates
      .map((file) => file.name)
      .filter((name) => !previousNames.has(name));
    knownPdfNames.current = new Set(candidates.map((file) => file.name));
    if (candidates.length === 0) return;

    setSelectedFiles((previous) => {
      if (firstLoad) return candidates.map((file) => file.name);
      if (addedNames.length === 0) return previous;
      return [...new Set([...previous, ...addedNames])];
    });

    // A package submitted from chat should land back on intake, not silently
    // join the previous run's review screen.
    if (!firstLoad && addedNames.length > 0) {
      setPhase((current) => (current === 'review' ? 'setup' : current));
    }
  }, [pdfFiles]);

  useEffect(() => {
    if (!activeRun) return;
    setRevisionBase(String(activeRun.revision.baseRevision));
    setRevisionDescription(activeRun.revision.description);
    setRevisionBy(activeRun.revision.by ?? '');
    setRevisionCheckedBy(activeRun.revision.checkedBy ?? '');
    setRevisionDate(activeRun.revision.date || new Date().toISOString().slice(0, 10));
  }, [activeRun?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeRun && phase === 'setup' && draft === null) setPhase('review');
  }, [activeRun?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pdfCandidates = useMemo(
    () => pdfFiles.filter((file) => file.fileData || /\.pdf$/i.test(file.name)),
    [pdfFiles],
  );

  const selectedDraftSheet = draft?.sheets.find((sheet) => sheet.id === selectedSheetId) ?? null;
  const selectedSheetPicks = selectedDraftSheet ? picks[selectedDraftSheet.id] ?? {} : {};
  const selectedSheetInput = selectedDraftSheet ? inputs[selectedDraftSheet.id] ?? EMPTY_INPUT : EMPTY_INPUT;
  const selectedSourceFile = selectedDraftSheet
    ? pdfFiles.find((file) => file.name === selectedDraftSheet.fileId) ?? null
    : null;

  const updateRun = useCallback((runId: string, updater: (run: RedlineRun) => RedlineRun) => {
    onRunsChange((previous) => previous.map((run) => (run.id === runId ? updater(run) : run)));
  }, [onRunsChange]);

  // CACP handlers must see the same live runs as the workspace. Refs keep the
  // registered hooks current without re-registering on every render.
  const runtimeRef = useRef({ runs, applyPatch, pdfFiles, updateRun });
  runtimeRef.current = { runs, applyPatch, pdfFiles, updateRun };

  useEffect(() => registerRedlineRuntime({
    getRuns: () => runtimeRef.current.runs,
    updateRun: (runId, updater) => runtimeRef.current.updateRun(runId, updater),
    applyItems: async (runId, itemIds) => {
      const snapshot = runtimeRef.current;
      const run = snapshot.runs.find((candidate) => candidate.id === runId);
      if (!run) {
        return {
          applied: [],
          failed: itemIds.map((itemId) => ({ itemId, error: 'Redline run not found.' })),
        };
      }
      const applied: string[] = [];
      const failed: Array<{ itemId: string; error: string }> = [];
      const runnable: RedlineItem[] = [];
      for (const itemId of itemIds) {
        const item = run.items.find((candidate) => candidate.id === itemId);
        if (!item) {
          failed.push({ itemId, error: 'Redline item not found.' });
          continue;
        }
        if (item.status === 'applied' || item.status === 'verified') {
          applied.push(item.id);
          continue;
        }
        if (item.status !== 'proposed' && item.status !== 'approved') {
          failed.push({ itemId, error: `Item status "${item.status}" cannot be applied.` });
          continue;
        }
        if (!item.proposal) {
          failed.push({ itemId, error: 'This item has no applyable proposal.' });
          continue;
        }
        runnable.push(item);
      }
      if (runnable.length === 0) return { applied, failed };

      // One Civil Drafter call and one history label for the whole batch. The
      // per-item statuses are merged only after the patch is confirmed.
      const combinedOps = runnable.flatMap((item) => item.proposal ?? []);
      try {
        const result = await snapshot.applyPatch(
          run,
          runnable[0],
          combinedOps,
          `Redline ${run.id} — ${runnable.length} correction${runnable.length === 1 ? '' : 's'}`,
        );
        if (result.success && result.applied) {
          snapshot.updateRun(run.id, (current) => {
            let next = current;
            for (const item of runnable) next = setRedlineItemStatus(next, item.id, 'applied');
            return next;
          });
          applied.push(...runnable.map((item) => item.id));
        } else {
          const reason = result.errors.join(' ') || 'The Civil Drafter did not confirm the patch.';
          snapshot.updateRun(run.id, (current) => {
            let next = current;
            for (const item of runnable) {
              next = setRedlineItemStatus(next, item.id, 'approved', `Apply failed: ${reason}`);
            }
            return next;
          });
          failed.push(...runnable.map((item) => ({ itemId: item.id, error: reason })));
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'The patch call failed.';
        failed.push(...runnable.map((item) => ({ itemId: item.id, error: reason })));
      }
      return { applied, failed };
    },
    revertItem: async (runId, itemId) => {
      const snapshot = runtimeRef.current;
      const run = snapshot.runs.find((candidate) => candidate.id === runId);
      const item = run?.items.find((candidate) => candidate.id === itemId);
      if (!run || !item) return { success: false, error: 'Redline item not found.' };
      if (item.status !== 'applied' && item.status !== 'verified') {
        return { success: false, error: `Item status "${item.status}" cannot be reverted.` };
      }
      const inverse = inverseOpsFor(item);
      if (!inverse) return { success: false, error: 'Revert is not available for this change type yet.' };
      try {
        const result = await snapshot.applyPatch(run, item, inverse, `Undo Redline ${item.number}`);
        if (!result.success || !result.applied) {
          return {
            success: false,
            error: result.errors.join(' ') || 'The Civil Drafter did not confirm the revert.',
          };
        }
        snapshot.updateRun(run.id, (current) => {
          const next = setRedlineItemStatus(current, item.id, 'approved', 'Reverted by user.');
          return {
            ...next,
            items: next.items.map((candidate) =>
              candidate.id === item.id ? { ...candidate, appliedAt: undefined, revision: undefined } : candidate,
            ),
          };
        });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'The revert call failed.',
        };
      }
    },
    buildResponse: async (runId) => {
      const snapshot = runtimeRef.current;
      const run = snapshot.runs.find((candidate) => candidate.id === runId);
      if (!run) return { ok: false, message: 'Redline run not found.' };
      const result = await buildRedlineResponsePackage(run, snapshot.pdfFiles);
      return {
        ok: Boolean(result.package),
        fileName: result.package?.fileName,
        message: result.package
          ? `Built ${result.package.fileName}.`
          : result.unavailableReason ?? 'Response generation is not configured.',
      };
    },
  }), []);

  const handleAddPdfs = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const added: SessionFile[] = [];
    for (const file of Array.from(list)) {
      if (!/\.pdf$/i.test(file.name)) {
        setError('Annotated PDFs only. Image and point files are not accepted.');
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        added.push({ name: file.name, content: '', fileData: dataUrl });
      } catch (readError) {
        setError(readError instanceof Error ? readError.message : 'Could not read the PDF.');
      }
    }
    if (added.length > 0) {
      onAddPdfFiles(added);
      setSelectedFiles((previous) => [...new Set([...previous, ...added.map((file) => file.name)])]);
    }
  };

  const handleExtract = async () => {
    setError(null);
    setResponseMessage(null);
    const files = pdfCandidates.filter(
      (file) => selectedFiles.includes(file.name) && Boolean(file.fileData),
    );
    if (files.length === 0) {
      setError('Select at least one annotated PDF with readable file data.');
      return;
    }
    setBusy(true);
    setProgress(mode === 'deep'
      ? 'Reading annotations, then rendering each page for the vision pass…'
      : 'Reading the PDF annotation layer…');
    try {
      const inventory = await extractRedlinePackage(
        files.map((file) => ({ name: file.name, dataUrl: file.fileData! })),
        (update) => {
          setProgress(
            `${update.fileName} · page ${update.pageIndex + 1}/${update.pageCount} · ${update.markupsFound} marks`,
          );
        },
        { deep: mode === 'deep', model: activeModel, userApiKey },
      );
      if (inventory.markups.length === 0) {
        setError(mode === 'deep'
          ? 'No embedded or visual reviewer marks were found. Confirm the PDF contains revision clouds, callouts, highlights, or notes. An empty worklist is not treated as success.'
          : 'No embedded annotations found. Switch to a Bluebeam/Acrobat export with a live annotation layer, or choose Deep mode for flattened pages. An empty worklist is not treated as success.');
        setDraft(inventory);
        return;
      }
      setDraft(inventory);
      setSelectedSheetId(inventory.sheets[0]?.id ?? null);
      setPicks({});
      setInputs({});
      setPhase('calibrate');
      setProgress('');
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Could not read the package.');
    } finally {
      setBusy(false);
    }
  };

  const handlePick = (point: PagePoint) => {
    if (!selectedDraftSheet) return;
    const sheetId = selectedDraftSheet.id;
    setPicks((previous) => {
      const current = previous[sheetId] ?? {};
      if (activeCalibrationPoint === 'a' || (!current.a && current.b !== point)) {
        return { ...previous, [sheetId]: { ...current, a: point } };
      }
      return { ...previous, [sheetId]: { ...current, b: point } };
    });
    setActiveCalibrationPoint(activeCalibrationPoint === 'a' ? 'b' : 'a');
  };

  const handleSolveCalibration = () => {
    if (!selectedDraftSheet) return;
    const { a, b } = selectedSheetPicks;
    if (!a || !b) {
      setError('Pick both sheet points A and B before solving.');
      return;
    }
    const parse = (value: string) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : NaN;
    };
    const registration = solveTwoPointCalibration({
      pdfA: a,
      pdfB: b,
      worldA: { easting: parse(selectedSheetInput.aEasting), northing: parse(selectedSheetInput.aNorthing) },
      worldB: { easting: parse(selectedSheetInput.bEasting), northing: parse(selectedSheetInput.bNorthing) },
      pageHeight: selectedDraftSheet.pageHeight,
    });
    setDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        sheets: previous.sheets.map((sheet) =>
          sheet.id === selectedDraftSheet.id ? { ...sheet, registration } : sheet,
        ),
      };
    });
    setError(null);
  };

  const handleBuildRun = () => {
    if (!draft) return;
    const runId = `rdl-${Date.now().toString(36)}`;
    const run = buildRedlineRun({
      runId,
      mode,
      sheets: draft.sheets,
      markups: draft.markups,
      entities: { points, lines, textAnnotations, centerlines },
      warnings: draft.warnings,
      options: { autoApplyLowRisk: false, precedence: 'reviewer' },
    });
    onRunsChange((previous) => [...previous, run]);
    onActiveRunIdChange(run.id);
    setSelectedItemIds(new Set());
    setPhase('review');
    onNotify?.(`Redline worklist ready: ${run.items.length} item${run.items.length === 1 ? '' : 's'}.`);
  };

  const handleApply = async (run: RedlineRun, item: RedlineItem) => {
    if (!item.proposal) {
      setError('This item has no applyable proposal.');
      return;
    }
    setBusyItemId(item.id);
    setError(null);
    try {
      const result = await applyPatch(run, item, item.proposal, `Redline ${item.number} — ${item.changeKind.replace(/_/g, ' ')}`);
      if (result.success && result.applied) {
        updateRun(run.id, (current) => setRedlineItemStatus(current, item.id, 'applied'));
        onNotify?.(`${item.number} applied.`);
      } else {
        updateRun(run.id, (current) =>
          setRedlineItemStatus(
            current,
            item.id,
            'approved',
            `Apply failed: ${result.errors.join(' ') || 'the Civil Drafter did not confirm the patch.'}`,
          ),
        );
        setError(result.errors.join(' ') || 'The Civil Drafter did not confirm the patch.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The Civil Drafter call failed.');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRevert = async (run: RedlineRun, item: RedlineItem) => {
    const inverse = inverseOpsFor(item);
    if (!inverse) {
      setError('Revert is not available for this change type yet. Use canvas undo for a deletion.');
      return;
    }
    setBusyItemId(item.id);
    setError(null);
    try {
      const result = await applyPatch(run, item, inverse, `Undo Redline ${item.number}`);
      if (result.success && result.applied) {
        updateRun(run.id, (current) => {
          const next = setRedlineItemStatus(current, item.id, 'approved', 'Reverted by user.');
          return {
            ...next,
            items: next.items.map((candidate) =>
              candidate.id === item.id ? { ...candidate, appliedAt: undefined, revision: undefined } : candidate,
            ),
          };
        });
        onNotify?.(`${item.number} reverted.`);
      } else {
        setError(result.errors.join(' ') || 'The Civil Drafter did not confirm the revert.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The Civil Drafter call failed.');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleApplyLowRisk = async () => {
    if (!activeRun) return;
    const eligible = activeRun.items.filter(isLowRiskTextItem);
    if (eligible.length === 0) {
      setError('No low-risk text items are ready. Only high/medium-confidence text content qualifies.');
      return;
    }
    setBusyItemId('__redline_batch__');
    setError(null);
    const combinedOps = eligible.flatMap((item) => item.proposal ?? []);
    try {
      const result = await applyPatch(
        activeRun,
        eligible[0],
        combinedOps,
        `Redline ${activeRun.id} — ${eligible.length} low-risk text correction${eligible.length === 1 ? '' : 's'}`,
      );
      if (result.success && result.applied) {
        updateRun(activeRun.id, (current) => {
          let next = current;
          for (const item of eligible) next = setRedlineItemStatus(next, item.id, 'applied');
          return next;
        });
        onNotify?.(`Applied ${eligible.length} low-risk text correction${eligible.length === 1 ? '' : 's'} as one batch.`);
      } else {
        const reason = result.errors.join(' ') || 'The Civil Drafter did not confirm the batch.';
        updateRun(activeRun.id, (current) => {
          let next = current;
          for (const item of eligible) next = setRedlineItemStatus(next, item.id, 'approved', `Apply failed: ${reason}`);
          return next;
        });
        setError(reason);
      }
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'The Civil Drafter batch call failed.');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleBulkStatus = (status: RedlineItemStatus) => {
    if (!activeRun || selectedItemIds.size === 0) return;
    updateRun(activeRun.id, (current) => {
      let next = current;
      for (const itemId of selectedItemIds) next = setRedlineItemStatus(next, itemId, status);
      return next;
    });
    setSelectedItemIds(new Set());
  };

  const handleAddManual = () => {
    if (!activeRun || !manualText.trim()) return;
    const number = `R-M-${String(activeRun.items.filter((item) => item.manual).length + 1).padStart(3, '0')}`;
    const item: RedlineItem = {
      id: `rdl-${activeRun.id}-manual-${Date.now().toString(36)}`,
      number,
      sheetId: activeRun.sheets[0]?.id ?? '',
      markupIds: [],
      reviewerText: [manualText.trim()],
      interpretedIntent: manualIntent.trim() || manualText.trim(),
      markupKind: 'other',
      changeKind: 'none',
      risk: 'standard',
      target: null,
      proposal: null,
      status: 'human_action',
      confidence: 'low',
      notes: 'Manual item added by the reviewer.',
      manual: true,
      createdAt: new Date().toISOString(),
      proposedAt: new Date().toISOString(),
    };
    updateRun(activeRun.id, (current) => {
      const nextItems = [...current.items, item];
      return { ...current, items: nextItems, metrics: computeRunMetrics(nextItems), updatedAt: new Date().toISOString() };
    });
    setManualText('');
    setManualIntent('');
    setManualOpen(false);
  };

  const handleAssignRevision = () => {
    if (!activeRun) return;
    const base = Number(revisionBase);
    if (!Number.isInteger(base) || base < 0) {
      setError('Base revision must be a non-negative integer.');
      return;
    }
    updateRun(activeRun.id, (current) =>
      assignRedlineRevision(current, base, {
        description: revisionDescription,
        by: revisionBy || undefined,
        checkedBy: revisionCheckedBy || undefined,
        date: revisionDate,
      }),
    );
    onNotify?.('Revision block assigned.');
  };

  const handleBuildResponse = async () => {
    if (!activeRun) return;
    setResponseMessage(null);
    const result = await buildRedlineResponsePackage(activeRun, pdfFiles);
    if (!result.package) {
      setResponseMessage(result.unavailableReason ?? 'Response generation is not configured.');
      return;
    }
    const url = URL.createObjectURL(result.package.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.package.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setResponseMessage(`Built ${result.package.fileName} — response letter, manifest, and source PDFs.`);
    onNotify?.(`Response package ready: ${result.package.fileName}`);
  };

  if (!isOpen) return null;

  const filteredItems = activeRun
    ? activeRun.items.filter((item) => {
        if (statusFilter === 'all') return true;
        return item.status === statusFilter;
      }).filter((item) => sheetFilter === 'all' || item.sheetId === sheetFilter)
    : [];

  const lowRiskCount = activeRun ? activeRun.items.filter(isLowRiskTextItem).length : 0;

  const renderSetup = () => (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">1 · Package</h3>
              <p className="mt-1 text-[11px] text-slate-400">
                One annotated package per run. Source PDFs stay in the project; the run references them by file name.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-200 hover:bg-red-500/20"
            >
              Add PDFs
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(event) => void handleAddPdfs(event.target.files)}
            />
          </div>

          {pdfCandidates.length === 0 ? (
            <p className="mt-3 rounded border border-dashed border-slate-600 px-3 py-4 text-center text-xs text-slate-400">
              No PDFs in this project yet. Add a marked-up package to begin.
            </p>
          ) : (
            <ul className="mt-3 max-h-56 space-y-1 overflow-auto pr-1">
              {pdfCandidates.map((file) => {
                const checked = selectedFiles.includes(file.name);
                return (
                  <li key={file.name}>
                    <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 bg-slate-800/50 px-2 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setSelectedFiles((previous) =>
                            event.target.checked
                              ? [...new Set([...previous, file.name])]
                              : previous.filter((name) => name !== file.name),
                          )
                        }
                        className="h-3.5 w-3.5 accent-red-500"
                      />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      {!file.fileData && <span className="text-[9px] text-amber-300">no file data</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <h3 className="text-sm font-semibold text-slate-100">2 · Reading mode</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('fast')}
              className={`rounded-lg border px-3 py-2 text-left ${mode === 'fast' ? 'border-red-400/70 bg-red-500/15' : 'border-slate-700 bg-slate-800/50'}`}
            >
              <span className="block text-xs font-semibold text-slate-100">Fast — annotations + text layer</span>
              <span className="mt-1 block text-[10px] text-slate-400">No vision call. Requires live Bluebeam/Acrobat markup objects.</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('deep')}
              className={`rounded-lg border px-3 py-2 text-left ${mode === 'deep' ? 'border-red-400/70 bg-red-500/15' : 'border-slate-700 bg-slate-800/50'}`}
            >
              <span className="block text-xs font-semibold text-slate-100">Deep — annotations + vision</span>
              <span className="mt-1 block text-[10px] text-slate-400">Also renders each page and sends the imagery to the configured model. Slower; use for flattened or unusual marks.</span>
            </button>
          </div>
          <p className="mt-3 rounded border border-slate-700 bg-slate-800/40 px-2 py-1.5 text-[10.5px] leading-relaxed text-slate-400">
            Nothing is applied during extraction. High-confidence text corrections are flagged for the explicit
            “Apply low-risk text” action after review.
          </p>
        </div>

        <button
          type="button"
          disabled={busy || selectedFiles.length === 0}
          onClick={() => void handleExtract()}
          className="w-full rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Reading package…' : 'Extract annotations'}
        </button>
        {progress && <p className="text-[11px] text-slate-400">{progress}</p>}
        {error && <p className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">{error}</p>}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Runs</h3>
          {runs.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-400">No redline runs yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {[...runs].reverse().map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onActiveRunIdChange(run.id);
                      setPhase('review');
                    }}
                    className={`w-full rounded border px-2 py-1.5 text-left text-[11px] ${run.id === activeRun?.id ? 'border-red-500/50 bg-red-500/10 text-red-100' : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500'}`}
                  >
                    <span className="block font-semibold">{new Date(run.createdAt).toLocaleString()}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">{run.sheets.length} sheets · {run.items.length} items · {run.mode}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-100">
          <strong>Experimental.</strong> Markup interpretation and entity matching can be wrong. Verify every applied correction before issuing a drawing.
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-[11px] leading-relaxed text-slate-400">
          <p className="font-semibold text-slate-200">What the worklist will contain</p>
          <p className="mt-1">Every annotation becomes an item: text replacement, deletion, dimension question, clarification, or human action. Revision clouds are never dropped — an empty cloud creates a question.</p>
          <p className="mt-2">Sheets without a two-point calibration still produce a worklist, but drawing edits are blocked and converted to human-action items.</p>
        </div>
      </div>
    </div>
  );

  const renderCalibrate = () => {
    if (!draft) return null;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Calibrate sheets</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Two points per sheet. Calibration can be skipped, but uncalibrated sheets block drawing edits.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleBuildRun}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400"
            >
              Build worklist ({draft.markups.length} markups)
            </button>
            <button
              type="button"
              onClick={() => setPhase('setup')}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-400"
            >
              Back
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {draft.sheets.map((sheet) => {
            const registered = sheet.registration?.valid;
            return (
              <button
                key={sheet.id}
                type="button"
                onClick={() => {
                  setSelectedSheetId(sheet.id);
                  setActiveCalibrationPoint('a');
                }}
                className={`rounded-full border px-2.5 py-1 text-[10.5px] ${sheet.id === selectedSheetId ? 'border-red-400 bg-red-500/15 text-red-100' : 'border-slate-700 bg-slate-800/60 text-slate-300'}`}
              >
                {sheet.fileName} · p{sheet.pageIndex + 1}
                <span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${registered ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </button>
            );
          })}
        </div>

        {selectedDraftSheet && (
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <div>
              {selectedSourceFile ? (
                <RedlineCalibrationCanvas
                  file={selectedSourceFile}
                  pageIndex={selectedDraftSheet.pageIndex}
                  pageWidth={selectedDraftSheet.pageWidth}
                  pageHeight={selectedDraftSheet.pageHeight}
                  pointA={selectedSheetPicks.a ?? null}
                  pointB={selectedSheetPicks.b ?? null}
                  onPick={(pick) => handlePick(pick.page)}
                />
              ) : (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
                  Source PDF “{selectedDraftSheet.fileName}” is no longer in the project. Calibration and edits for this sheet are blocked.
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Picking</span>
                <button type="button" onClick={() => setActiveCalibrationPoint('a')} className={`rounded px-2 py-0.5 text-[10px] ${activeCalibrationPoint === 'a' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300'}`}>Point A</button>
                <button type="button" onClick={() => setActiveCalibrationPoint('b')} className={`rounded px-2 py-0.5 text-[10px] ${activeCalibrationPoint === 'b' ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-300'}`}>Point B</button>
                <button
                  type="button"
                  onClick={() => setPicks((previous) => ({ ...previous, [selectedDraftSheet.id]: {} }))}
                  className="ml-auto text-[10px] text-slate-400 hover:text-slate-200"
                >
                  Clear
                </button>
              </div>

              {(['a', 'b'] as const).map((key) => (
                <div key={key} className="rounded border border-slate-700 bg-slate-800/40 p-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {key === 'a' ? 'Point A — sheet + coordinate' : 'Point B — sheet + coordinate'}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Sheet: {selectedSheetPicks[key] ? `${selectedSheetPicks[key]!.x.toFixed(1)}, ${selectedSheetPicks[key]!.y.toFixed(1)} pt` : 'not picked'}
                  </p>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    <input
                      value={key === 'a' ? selectedSheetInput.aEasting : selectedSheetInput.bEasting}
                      onChange={(event) =>
                        setInputs((previous) => ({
                          ...previous,
                          [selectedDraftSheet.id]: {
                            ...(previous[selectedDraftSheet.id] ?? EMPTY_INPUT),
                            [key === 'a' ? 'aEasting' : 'bEasting']: event.target.value,
                          },
                        }))
                      }
                      placeholder="Easting"
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                    />
                    <input
                      value={key === 'a' ? selectedSheetInput.aNorthing : selectedSheetInput.bNorthing}
                      onChange={(event) =>
                        setInputs((previous) => ({
                          ...previous,
                          [selectedDraftSheet.id]: {
                            ...(previous[selectedDraftSheet.id] ?? EMPTY_INPUT),
                            [key === 'a' ? 'aNorthing' : 'bNorthing']: event.target.value,
                          },
                        }))
                      }
                      placeholder="Northing"
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleSolveCalibration}
                className="w-full rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400"
              >
                Solve & save calibration
              </button>

              <div className="rounded border border-slate-700 bg-slate-800/40 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registration</p>
                <p className="mt-1 text-xs text-slate-200">{describeRegistration(selectedDraftSheet.registration)}</p>
                {selectedDraftSheet.registration?.warnings.map((warning) => (
                  <p key={warning} className="mt-1 text-[10px] leading-snug text-amber-300">{warning}</p>
                ))}
              </div>

              <div className="rounded border border-slate-700 bg-slate-800/40 p-2 text-[10px] text-slate-400">
                <p className="font-semibold text-slate-300">{selectedDraftSheet.markupCount} annotations on this sheet</p>
                {draft.warnings.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {draft.warnings.slice(0, 4).map((warning) => <li key={warning}>• {warning}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {error && <p className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">{error}</p>}
      </div>
    );
  };

  const renderReview = () => {
    if (!activeRun) {
      return <p className="text-sm text-slate-400">No run loaded. Start a package from Setup.</p>;
    }
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{freshnessLabel(activeRun)}</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {activeRun.sheets.length} sheets · {activeRun.mode} mode · revision R{activeRun.revision.assignedRevision}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={lowRiskCount === 0 || Boolean(busyItemId)}
              onClick={() => void handleApplyLowRisk()}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              Apply low-risk text ({lowRiskCount})
            </button>
            <button
              type="button"
              onClick={() => setManualOpen((open) => !open)}
              className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-slate-400"
            >
              + Manual item
            </button>
            <button
              type="button"
              onClick={() => setPhase('setup')}
              className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-slate-400"
            >
              New run
            </button>
          </div>
        </div>

        {manualOpen && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-[11px] font-semibold text-red-200">Add a manual correction item</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                placeholder="Reviewer wording (verbatim)"
                className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
              <input
                value={manualIntent}
                onChange={(event) => setManualIntent(event.target.value)}
                placeholder="Interpreted intent (optional)"
                className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handleAddManual} disabled={!manualText.trim()} className="rounded bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Add item</button>
              <button type="button" onClick={() => setManualOpen(false)} className="text-[11px] text-slate-400">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
          >
            <option value="all">All statuses</option>
            <option value="proposed">Proposed</option>
            <option value="needs_clarification">Needs answer</option>
            <option value="approved">Approved</option>
            <option value="applied">Applied</option>
            <option value="human_action">Human action</option>
            <option value="rejected">Rejected</option>
            <option value="deferred">Deferred</option>
          </select>
          <select
            value={sheetFilter}
            onChange={(event) => setSheetFilter(event.target.value)}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
          >
            <option value="all">All sheets</option>
            {activeRun.sheets.map((sheet) => (
              <option key={sheet.id} value={sheet.id}>{sheet.fileName} · p{sheet.pageIndex + 1}</option>
            ))}
          </select>
          {selectedItemIds.size > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400">{selectedItemIds.size} selected</span>
              <button type="button" onClick={() => handleBulkStatus('approved')} className="rounded border border-sky-500/40 px-2 py-0.5 text-[10px] text-sky-200">Accept</button>
              <button type="button" onClick={() => handleBulkStatus('rejected')} className="rounded border border-rose-500/40 px-2 py-0.5 text-[10px] text-rose-200">Reject</button>
              <button type="button" onClick={() => handleBulkStatus('deferred')} className="rounded border border-slate-500/40 px-2 py-0.5 text-[10px] text-slate-200">Defer</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-slate-900/90 text-[9.5px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="w-7 px-2 py-2"><input type="checkbox" aria-label="Select all" checked={filteredItems.length > 0 && filteredItems.every((item) => selectedItemIds.has(item.id))} onChange={(event) => setSelectedItemIds(event.target.checked ? new Set(filteredItems.map((item) => item.id)) : new Set())} className="h-3 w-3 accent-red-500" /></th>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Sheet</th>
                <th className="px-2 py-2">Reviewer text</th>
                <th className="px-2 py-2">Intent</th>
                <th className="px-2 py-2">Target</th>
                <th className="px-2 py-2">Match</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredItems.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">No items match this filter.</td></tr>
              )}
              {filteredItems.map((item) => {
                const sheet = activeRun.sheets.find((candidate) => candidate.id === item.sheetId);
                const busyThis = busyItemId === item.id;
                const rowSelected = selectedItemId === item.id;
                return (
                  <tr
                    key={item.id}
                    aria-selected={rowSelected}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest('button,input,select,a,label')) return;
                      onSelectItem?.(item.id);
                    }}
                    className={rowSelected
                      ? 'cursor-pointer bg-red-500/10 ring-1 ring-inset ring-red-500/40'
                      : item.conflictWith?.length
                        ? 'cursor-pointer bg-amber-500/5'
                        : 'cursor-pointer bg-slate-950/40'}
                  >
                    <td className="px-2 py-2 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.number}`}
                        checked={selectedItemIds.has(item.id)}
                        onChange={(event) => {
                          setSelectedItemIds((previous) => {
                            const next = new Set(previous);
                            if (event.target.checked) next.add(item.id); else next.delete(item.id);
                            return next;
                          });
                        }}
                        className="h-3 w-3 accent-red-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 align-top font-semibold text-red-200">{item.number}{item.manual ? ' · M' : ''}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top text-slate-400">{sheet ? `${sheet.fileName} p${sheet.pageIndex + 1}` : '—'}</td>
                    <td className="max-w-[220px] px-2 py-2 align-top text-slate-200">{item.reviewerText.join(' | ') || <span className="text-amber-300">(empty cloud)</span>}</td>
                    <td className="max-w-[200px] px-2 py-2 align-top text-slate-400">{item.interpretedIntent}</td>
                    <td className="max-w-[180px] px-2 py-2 align-top text-slate-300">{item.target?.label ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top">
                      <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase ${item.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-300' : item.confidence === 'medium' ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'}`}>
                        {item.confidence}{item.target ? ` ${Math.round(item.target.matchConfidence * 100)}%` : ''}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 align-top">
                      <span className={`rounded border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                      {item.risk === 'low' && <span className="ml-1 rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] text-emerald-300">low risk</span>}
                      {item.conflictWith?.length ? <span className="ml-1 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] text-amber-300">conflict</span> : null}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {item.status === 'applied' && (
                          <button type="button" disabled={busyThis} onClick={() => void handleRevert(activeRun, item)} className="rounded border border-rose-500/40 px-1.5 py-0.5 text-[10px] text-rose-200 disabled:opacity-40">Revert</button>
                        )}
                        {item.status === 'approved' && (
                          <button type="button" disabled={busyThis} onClick={() => void handleApply(activeRun, item)} className="rounded border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-200 disabled:opacity-40">{busyThis ? 'Applying…' : 'Apply'}</button>
                        )}
                        {item.status === 'proposed' && (
                          <>
                            <button type="button" onClick={() => updateRun(activeRun.id, (current) => setRedlineItemStatus(current, item.id, 'approved'))} className="rounded border border-sky-500/40 px-1.5 py-0.5 text-[10px] text-sky-200">Accept</button>
                            <button type="button" disabled={busyThis} onClick={() => void handleApply(activeRun, item)} className="rounded border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-200 disabled:opacity-40">{busyThis ? 'Applying…' : 'Accept + apply'}</button>
                          </>
                        )}
                        {item.status === 'needs_clarification' && (
                          <button type="button" onClick={() => updateRun(activeRun.id, (current) => setRedlineItemStatus(current, item.id, 'approved'))} className="rounded border border-sky-500/40 px-1.5 py-0.5 text-[10px] text-sky-200">Target is right</button>
                        )}
                        {['proposed', 'needs_clarification', 'approved'].includes(item.status) && (
                          <>
                            <button type="button" onClick={() => updateRun(activeRun.id, (current) => setRedlineItemStatus(current, item.id, 'rejected'))} className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">Reject</button>
                            <button type="button" onClick={() => updateRun(activeRun.id, (current) => setRedlineItemStatus(current, item.id, 'deferred'))} className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">Defer</button>
                          </>
                        )}
                        {['rejected', 'deferred', 'human_action', 'applied'].includes(item.status) && (
                          <button type="button" onClick={() => updateRun(activeRun.id, (current) => setRedlineItemStatus(current, item.id, 'proposed'))} className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">Reopen</button>
                        )}
                      </div>
                      {item.question && item.status === 'needs_clarification' && (
                        <p className="mt-1 max-w-[220px] text-[10px] leading-snug text-amber-300">{item.question}</p>
                      )}
                      {item.revision && <p className="mt-1 text-[9.5px] text-emerald-300">{item.revision.label}</p>}
                      {item.notes && <p className="mt-1 max-w-[240px] text-[9.5px] leading-snug text-slate-500">{item.notes}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {activeRun.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10.5px] text-amber-200">
            {activeRun.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
          </div>
        )}
        {error && <p className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">{error}</p>}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <h4 className="text-xs font-semibold text-slate-100">Revision block</h4>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-[10px] text-slate-400">Base revision
                <input value={revisionBase} onChange={(event) => setRevisionBase(event.target.value)} className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100" />
              </label>
              <label className="text-[10px] text-slate-400">Date
                <input type="date" value={revisionDate} onChange={(event) => setRevisionDate(event.target.value)} className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100" />
              </label>
              <label className="col-span-2 text-[10px] text-slate-400">Description
                <input value={revisionDescription} onChange={(event) => setRevisionDescription(event.target.value)} className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100" />
              </label>
              <label className="text-[10px] text-slate-400">By
                <input value={revisionBy} onChange={(event) => setRevisionBy(event.target.value)} className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100" />
              </label>
              <label className="text-[10px] text-slate-400">Checked by
                <input value={revisionCheckedBy} onChange={(event) => setRevisionCheckedBy(event.target.value)} className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100" />
              </label>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-400">Applies to R{activeRun.revision.assignedRevision}; deltas are assigned to applied items.</p>
              <button type="button" onClick={handleAssignRevision} className="rounded bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-400">Assign</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <h4 className="text-xs font-semibold text-slate-100">Response package</h4>
            <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">
              Generates a ZIP with a reviewer response letter, the JSON manifest, and the original marked-up PDFs still in this session. A custom adapter can replace the built-in package.
            </p>
            <button type="button" onClick={() => void handleBuildResponse()} className="mt-2 rounded border border-slate-600 px-2.5 py-1 text-[11px] text-slate-200 hover:border-slate-400">Generate response package</button>
            {responseMessage && <p className="mt-1 text-[10.5px] text-amber-300">{responseMessage}</p>}
            <p className="mt-2 text-[10px] text-slate-500">Run metrics: {activeRun.metrics.itemsAccepted} accepted · {activeRun.metrics.autoApplied} auto text · {activeRun.metrics.itemsHumanAction} human action · mean match {activeRun.metrics.meanMatchConfidence.toFixed(2)}</p>
          </div>
        </div>
      </div>
    );
  };

  const phaseTabs = (
    <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
      {(['setup', 'calibrate', 'review'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setPhase(tab)}
          disabled={tab !== 'setup' && !activeRun && !draft}
          className={`rounded-md px-2.5 py-1 text-[10.5px] font-semibold capitalize transition ${phase === tab ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-slate-200'} disabled:opacity-30`}
        >
          {tab === 'calibrate' ? 'Calibrate' : tab === 'review' ? 'Worklist' : 'Package'}
        </button>
      ))}
    </div>
  );

  if (!isOpen) return null;

  const workspace = (
    <div
      className={
        chrome === 'surface'
          ? 'flex min-h-0 flex-col bg-slate-950 text-slate-200'
          : 'flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-red-500/30 bg-slate-950 shadow-2xl'
      }
    >
      {chrome === 'surface' ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.02] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <RedlineIcon className="h-4 w-4 flex-shrink-0 text-red-300" aria-hidden="true" />
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-red-200">Redline review</span>
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Experimental</span>
          </div>
          {phaseTabs}
        </div>
      ) : (
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-red-500/15 text-red-300">
                <RedlineIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="truncate text-sm font-bold text-slate-100">Redline Agent</h2>
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Experimental</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-slate-400">Annotated PDFs · worklist · Civil Drafter coordination · revision record</p>
          </div>
          <div className="flex items-center gap-2">
            {phaseTabs}
            {onClose && (
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white">Close</button>
            )}
          </div>
        </header>
      )}
      <div className={chrome === 'surface' ? 'min-h-0 flex-1 p-3' : 'flex-1 overflow-auto p-3 sm:p-4'}>
        {phase === 'setup' && renderSetup()}
        {phase === 'calibrate' && renderCalibrate()}
        {phase === 'review' && renderReview()}
      </div>
    </div>
  );

  if (chrome === 'surface') return workspace;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-2 sm:p-5">
      {workspace}
    </div>
  );
};

export default RedlinePanel;
