import type { PointList } from '../types.ts';

export type PointWorkflowStepId = 'add-points' | 'save-points';
export type PointWorkflowStepStatus = 'complete' | 'current' | 'pending';

export interface PointWorkflowStep {
  id: PointWorkflowStepId;
  label: string;
  status: PointWorkflowStepStatus;
}

export interface PointWorkflowSnapshot {
  totalPoints: number;
  unsavedPoints: number;
  savedPoints: number;
  steps: PointWorkflowStep[];
  completedStepCount: number;
  /** True once points exist and none are left in the working list. */
  isComplete: boolean;
  /** Short progress cue for the panel stepper and Quick Thought header. */
  progressLabel: string;
}

/**
 * The Point Editor flow is: add points, then save them to a named list.
 * Progress is derived entirely from the point lists so uploads, manual entries,
 * agent placements, saves, and merges all advance the same flow.
 */
export function derivePointWorkflow(pointLists: PointList[]): PointWorkflowSnapshot {
  const totalPoints = pointLists.reduce((total, list) => total + list.points.length, 0);
  const unsavedPoints = pointLists.find(list => list.id === 'working')?.points.length ?? 0;
  const savedPoints = totalPoints - unsavedPoints;
  const hasPoints = totalPoints > 0;
  const hasUnsavedPoints = unsavedPoints > 0;

  const steps: PointWorkflowStep[] = [
    {
      id: 'add-points',
      label: 'Add points',
      status: hasPoints ? 'complete' : 'current',
    },
    {
      id: 'save-points',
      label: 'Save to a list',
      status: !hasPoints ? 'pending' : hasUnsavedPoints ? 'current' : 'complete',
    },
  ];

  const isComplete = hasPoints && !hasUnsavedPoints;
  const completedStepCount = steps.filter(step => step.status === 'complete').length;
  const progressLabel = isComplete
    ? 'All steps complete'
    : hasPoints
      ? `Step 2 of 2 · Save ${unsavedPoints} point${unsavedPoints === 1 ? '' : 's'}`
      : 'Step 1 of 2 · Add points';

  return {
    totalPoints,
    unsavedPoints,
    savedPoints,
    steps,
    completedStepCount,
    isComplete,
    progressLabel,
  };
}
