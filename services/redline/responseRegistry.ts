/**
 * Redline Agent — response package registry.
 *
 * A custom adapter can replace the built-in package generator. When none is
 * registered, the built-in adapter builds a local ZIP with a response letter,
 * the JSON manifest, and the original marked-up PDFs still present in the
 * session.
 */

import type {
  RedlineResponseAdapter,
  RedlineResponseManifest,
  RedlineResponsePackage,
  RedlineRun,
  SessionFile,
} from '../../types';
import { buildRedlineResponsePackageFile } from './responsePackage';

let registeredAdapter: RedlineResponseAdapter | null = null;

const BUILT_IN_ADAPTER: RedlineResponseAdapter = {
  id: 'built-in-response-zip',
  label: 'Built-in response package',
  isAvailable: (run) => run.items.length > 0,
  build: (run, sourceFiles) => buildRedlineResponsePackageFile(
    run,
    sourceFiles,
    buildRedlineResponseManifest(run),
  ),
};

export function registerRedlineResponseAdapter(adapter: RedlineResponseAdapter | null): void {
  registeredAdapter = adapter;
}

/** Registered external adapter, or the built-in ZIP package generator. */
export function getRedlineResponseAdapter(): RedlineResponseAdapter {
  return registeredAdapter ?? BUILT_IN_ADAPTER;
}

function responseTextForItem(item: RedlineRun['items'][number]): string {
  if (item.status === 'applied' || item.status === 'verified') {
    const update = item.proposal?.find((operation) => operation.op === 'update_text');
    if (typeof update?.after?.text === 'string') return `Applied: text set to "${update.after.text}".`;
    if (item.changeKind === 'entity_delete') return `Applied: removed ${item.target?.label ?? 'the target'}.`;
    return 'Applied and verified.';
  }
  if (item.status === 'needs_clarification') return item.question ?? 'Needs clarification.';
  if (item.status === 'human_action') return item.humanActionNote ?? 'Handled as a human-action item.';
  if (item.status === 'deferred') return item.notes || 'Deferred for later review.';
  if (item.status === 'rejected') return item.notes || 'Rejected during review.';
  if (item.status === 'approved' || item.status === 'proposed') return 'Approved but not applied yet.';
  return item.notes || 'See the worklist note.';
}

export function buildRedlineResponseManifest(run: RedlineRun): RedlineResponseManifest {
  return {
    runId: run.id,
    revision: run.revision,
    items: run.items.map((item) => {
      const sheet = run.sheets.find((candidate) => candidate.id === item.sheetId);
      let disposition: RedlineResponseManifest['items'][number]['disposition'] = 'see_note';
      if (item.status === 'applied' || item.status === 'verified') disposition = 'done';
      else if (item.status === 'rejected') disposition = 'not_done';
      else if (item.status === 'deferred') disposition = 'deferred';
      else if (item.status === 'human_action') disposition = 'human_action';

      return {
        number: item.number,
        reviewerText: item.reviewerText.join(' | '),
        disposition,
        responseText: responseTextForItem(item),
        revision: item.revision ? { number: item.revision.number, delta: item.revision.delta } : undefined,
        sheet: {
          fileId: sheet?.fileId ?? '',
          pageIndex: sheet?.pageIndex ?? 0,
        },
      };
    }),
  };
}

/**
 * Returns the selected adapter's package. The built-in adapter is always
 * available, so a null result only means the run has nothing to report.
 */
export async function buildRedlineResponsePackage(
  run: RedlineRun,
  sourceFiles: SessionFile[],
): Promise<{ package: RedlineResponsePackage | null; unavailableReason?: string }> {
  const adapter = getRedlineResponseAdapter();
  if (!adapter.isAvailable(run)) {
    return {
      package: null,
      unavailableReason: `${adapter.label} is not available for this run.`,
    };
  }
  return { package: await adapter.build(run, sourceFiles) };
}
