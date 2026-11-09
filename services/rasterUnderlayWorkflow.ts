import type { RasterUnderlay } from '../types.ts';

export type RasterUnderlayWorkflowStepId = 'import-underlay' | 'align-underlay';
export type RasterUnderlayWorkflowStepStatus = 'complete' | 'current' | 'pending';

export interface RasterUnderlayWorkflowStep {
  id: RasterUnderlayWorkflowStepId;
  label: string;
  status: RasterUnderlayWorkflowStepStatus;
}

export interface RasterUnderlayWorkflowSnapshot {
  totalUnderlays: number;
  alignedUnderlays: number;
  remainingUnderlays: number;
  steps: RasterUnderlayWorkflowStep[];
  completedStepCount: number;
  /** True once at least one underlay is imported and every underlay is aligned. */
  isComplete: boolean;
  /** Short progress cue for the panel stepper and Quick Thought header. */
  progressLabel: string;
}

/**
 * An underlay counts as aligned once both image anchors are associated with
 * project points. Older saved underlays may omit `imagePointSet`, so undefined
 * is treated as set when the pixel coordinates are finite.
 */
export const isRasterUnderlayAligned = (underlay: RasterUnderlay): boolean => {
  const anchors = underlay.anchors ?? [];
  if (anchors.length < 2) return false;
  return anchors.slice(0, 2).every(
    anchor =>
      anchor.imagePointSet !== false &&
      Number.isFinite(anchor.imageX) &&
      Number.isFinite(anchor.imageY) &&
      Boolean(anchor.pointNumber),
  );
};

/**
 * The Underlay flow is: import a plan, then align every imported underlay with
 * two anchor pairs. Progress is derived from the saved underlays so imports,
 * anchor edits, deletions, and session loads all advance the same flow.
 */
export function deriveRasterUnderlayWorkflow(
  underlays: RasterUnderlay[],
): RasterUnderlayWorkflowSnapshot {
  const totalUnderlays = underlays.length;
  const alignedUnderlays = underlays.filter(isRasterUnderlayAligned).length;
  const remainingUnderlays = Math.max(0, totalUnderlays - alignedUnderlays);
  const hasUnderlays = totalUnderlays > 0;
  const isComplete = hasUnderlays && remainingUnderlays === 0;

  const steps: RasterUnderlayWorkflowStep[] = [
    {
      id: 'import-underlay',
      label: 'Import a plan or image',
      status: hasUnderlays ? 'complete' : 'current',
    },
    {
      id: 'align-underlay',
      label: 'Align two anchor pairs',
      status: isComplete ? 'complete' : hasUnderlays ? 'current' : 'pending',
    },
  ];

  const completedStepCount = steps.filter(step => step.status === 'complete').length;
  const progressLabel = isComplete
    ? 'All steps complete'
    : !hasUnderlays
      ? 'Step 1 of 2 · Import a plan or image'
      : `Step 2 of 2 · Align ${remainingUnderlays} underlay${remainingUnderlays === 1 ? '' : 's'}`;

  return {
    totalUnderlays,
    alignedUnderlays,
    remainingUnderlays,
    steps,
    completedStepCount,
    isComplete,
    progressLabel,
  };
}
