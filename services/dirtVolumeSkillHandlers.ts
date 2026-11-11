/**
 * Dirt Volume Agent CACP Skill Handlers
 *
 * Runtime implementations for the skills declared in
 * services/dirtVolumeSkillSchemas.ts. All calculations are deterministic and
 * local: no external service is required.
 */

import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType, type TinSurface } from '../types';
import {
  compareDirtVolumeScenarios,
  computeEndAreaVolumes,
  computeGridVolumes,
  computeStockpileVolume,
  computeTinVolumes,
  clearDirtVolumeScenarios,
  deleteDirtVolumeScenario,
  formatDirtVolumeReport,
  getDirtVolumeScenario,
  listDirtVolumeScenarios,
  saveDirtVolumeResult,
  type DirtVolumeComparison,
  type DirtVolumeSummary,
  type StockpilePoint,
  type VolumeSection,
} from './dirtVolumeService';
import { buildDirtVolumeReportPdf } from './dirtVolumeReportPdf';
import { triggerDownload } from '../utils/download';

export interface DirtVolumeHandlerDeps {
  /** TIN surfaces currently loaded in the project. */
  getTinSurfaces?: () => TinSurface[];
  /** Raise the Dirt Volume workspace in chat. */
  openPanel?: () => void;
  logActionToFieldbook: (message: string) => void;
}

let latestScenarioId: string | null = null;

function respond(
  message: AgentMessage,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
): AgentResponse {
  return {
    requestId: message.id,
    from: AgentType.DIRT_VOLUME_AGENT,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

function asData(message: AgentMessage): Record<string, unknown> {
  return (message.data ?? {}) as Record<string, unknown>;
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function formatSummary(result: DirtVolumeSummary): Record<string, unknown> {
  return {
    method: result.method,
    methodLabel: result.methodLabel,
    methods: result.methodLabel,
    calculationMethod: result.calculationMethod,
    cutCf: result.cutCf,
    fillCf: result.fillCf,
    cutCy: result.cutCy,
    fillCy: result.fillCy,
    netCy: result.netCy,
    cutLooseCy: result.cutLooseCy,
    fillBankRequiredCy: result.fillBankRequiredCy,
    adjustedNetCy: result.adjustedNetCy,
    cutToFillRatio: result.cutToFillRatio ?? undefined,
    cutSwellPercent: result.cutSwellPercent,
    fillShrinkPercent: result.fillShrinkPercent,
    planAreaSf: result.planAreaSf ?? undefined,
    planAreaAcres: result.planAreaAcres ?? undefined,
    lengthFt: result.lengthFt ?? undefined,
    sectionCount: result.sectionCount ?? undefined,
    cellsComputed: result.cellsComputed ?? undefined,
    cellsSkipped: result.cellsSkipped ?? undefined,
    maxCutFt: result.maxCutFt ?? undefined,
    maxFillFt: result.maxFillFt ?? undefined,
    warnings: result.warnings,
    computedAt: result.computedAt,
  };
}

function retainResult(
  result: DirtVolumeSummary,
  data: Record<string, unknown>,
  deps: DirtVolumeHandlerDeps,
): { scenarioId?: string; report: string } {
  const saveAs = stringFrom(data.saveAs) ?? stringFrom(data.name);
  let scenarioId: string | undefined;
  let report: string;
  if (saveAs) {
    const scenario = saveDirtVolumeResult(result, saveAs, stringFrom(data.notes) ?? '');
    latestScenarioId = scenario.id;
    scenarioId = scenario.id;
    report = formatDirtVolumeReport({ scenario });
    deps.logActionToFieldbook(
      `Dirt Volume Agent: saved "${scenario.name}" — cut ${scenario.cutCy.toFixed(1)} CY, ` +
        `fill ${scenario.fillCy.toFixed(1)} CY, adjusted net ${scenario.adjustedNetCy.toFixed(1)} CY.`,
    );
  } else {
    report = formatDirtVolumeReport({
      scenario: {
        id: 'unsaved',
        name: `${result.methodLabel} (unsaved)`,
        notes: stringFrom(data.notes) ?? '',
        method: result.method,
        methodLabel: result.methodLabel,
        calculationMethod: result.calculationMethod,
        cutCy: result.cutCy,
        fillCy: result.fillCy,
        netCy: result.netCy,
        cutLooseCy: result.cutLooseCy,
        fillBankRequiredCy: result.fillBankRequiredCy,
        adjustedNetCy: result.adjustedNetCy,
        cutToFillRatio: result.cutToFillRatio,
        cutSwellPercent: result.cutSwellPercent,
        fillShrinkPercent: result.fillShrinkPercent,
        planAreaSf: result.planAreaSf,
        planAreaAcres: result.planAreaAcres,
        lengthFt: result.lengthFt,
        sectionCount: result.sectionCount,
        cellsComputed: result.cellsComputed,
        cellsSkipped: result.cellsSkipped,
        maxCutFt: result.maxCutFt,
        maxFillFt: result.maxFillFt,
        warnings: result.warnings,
        computedAt: result.computedAt,
      },
    });
    deps.logActionToFieldbook(
      `Dirt Volume Agent: ${result.methodLabel} — cut ${result.cutCy.toFixed(1)} CY, ` +
        `fill ${result.fillCy.toFixed(1)} CY, adjusted net ${result.adjustedNetCy.toFixed(1)} CY.`,
    );
  }
  return { scenarioId, report };
}

function parseSections(raw: unknown): VolumeSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      station: Number(entry.station),
      cutAreaSf: Number(entry.cutAreaSf ?? entry.cutArea ?? 0),
      fillAreaSf: Number(entry.fillAreaSf ?? entry.fillArea ?? 0),
      description: typeof entry.description === 'string' ? entry.description : undefined,
    }));
}

function parseGrid(raw: unknown, field: string): number[][] {
  if (!Array.isArray(raw)) {
    throw new Error(`${field} must be a two-dimensional array of elevations.`);
  }
  return raw.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error(`${field}[${rowIndex}] must be an array of elevations.`);
    }
    return row.map((value) => Number(value));
  });
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSurface(
  surfaces: TinSurface[],
  reference: unknown,
  label: string,
): TinSurface {
  const wanted = stringFrom(reference);
  if (!wanted) throw new Error(`${label} surface id or name is required.`);
  const exact =
    surfaces.find((surface) => surface.id === wanted) ??
    surfaces.find((surface) => normalize(surface.name) === normalize(wanted));
  if (exact) return exact;
  const matches = surfaces.filter((surface) => normalize(surface.name).includes(normalize(wanted)));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `${label} surface "${wanted}" matches multiple surfaces: ${matches.map((surface) => surface.name).join(', ')}. ` +
        'Use the full surface name.',
    );
  }
  throw new Error(
    `${label} surface "${wanted}" was not found. Available surfaces: ` +
      (surfaces.length ? surfaces.map((surface) => surface.name).join(', ') : 'none loaded'),
  );
}

function comparePayload(comparison: DirtVolumeComparison): Record<string, unknown> {
  const report = formatDirtVolumeReport({ comparison });
  return {
    baselineId: comparison.baselineId,
    rows: comparison.rows,
    spreadNetCy: comparison.spreadNetCy,
    bestBalancedId: comparison.bestBalancedId,
    report,
  };
}

function resolveReportScenario(data: Record<string, unknown>) {
  const requestedId = stringFrom(data.scenarioId) ?? latestScenarioId ?? undefined;
  if (requestedId) {
    const scenario = getDirtVolumeScenario(requestedId);
    if (!scenario) {
      throw new Error(
        `No saved scenario "${requestedId}" exists. Available scenarios: ` +
          (listDirtVolumeScenarios().map((entry) => entry.name).join(', ') || 'none'),
      );
    }
    return scenario;
  }
  const all = listDirtVolumeScenarios();
  if (all.length > 0) return all[all.length - 1];
  throw new Error('No saved volume scenario exists yet. Compute and save a volume scenario first.');
}

export function registerDirtVolumeSkillHandlers(
  getDeps: () => DirtVolumeHandlerDeps,
): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_end_area', async (message) => {
      const deps = getDeps();
      const data = asData(message);
      const sections = parseSections(data.sections);
      if (sections.length < 2) {
        return respond(message, false, undefined, 'At least two cross sections are required.');
      }
      try {
        const result = computeEndAreaVolumes(sections, {
          useSimpsonRule: data.useSimpsonRule === true,
          cutSwellPercent: numberFrom(data.cutSwellPercent),
          fillShrinkPercent: numberFrom(data.fillShrinkPercent),
        });
        const saved = retainResult(result, data, deps);
        return respond(message, true, {
          ...formatSummary(result),
          ...saved,
        });
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_grid', async (message) => {
      const deps = getDeps();
      const data = asData(message);
      try {
        const result = computeGridVolumes({
          spacingX: Number(data.spacingX),
          spacingY: Number(data.spacingY),
          existing: parseGrid(data.existing, 'existing'),
          proposed: parseGrid(data.proposed, 'proposed'),
          toleranceFt: numberFrom(data.toleranceFt),
          cutSwellPercent: numberFrom(data.cutSwellPercent),
          fillShrinkPercent: numberFrom(data.fillShrinkPercent),
        });
        const saved = retainResult(result, data, deps);
        return respond(message, true, { ...formatSummary(result), ...saved });
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_tin_compare', async (message) => {
      const deps = getDeps();
      const data = asData(message);
      const surfaces = deps.getTinSurfaces?.() ?? [];
      if (surfaces.length === 0) {
        return respond(
          message,
          false,
          { availableSurfaces: [] },
          'No TIN surfaces are loaded in this project. Create or import surfaces first, or supply section areas.',
        );
      }
      try {
        const existing = resolveSurface(surfaces, data.existingSurface ?? data.existingTin, 'Existing');
        const proposed = resolveSurface(surfaces, data.proposedSurface ?? data.proposedTin, 'Proposed');
        if (existing.id === proposed.id) {
          return respond(message, false, undefined, 'Pick two different TIN surfaces to compare.');
        }
        const result = computeTinVolumes({
          existing,
          proposed,
          spacingFt: numberFrom(data.spacingFt),
          toleranceFt: numberFrom(data.toleranceFt),
          cutSwellPercent: numberFrom(data.cutSwellPercent),
          fillShrinkPercent: numberFrom(data.fillShrinkPercent),
        });
        const saved = retainResult(result, data, deps);
        return respond(message, true, {
          ...formatSummary(result),
          existingSurface: existing.name,
          proposedSurface: proposed.name,
          overlap: result.overlap,
          ...saved,
        });
      } catch (error) {
        return respond(
          message,
          false,
          { availableSurfaces: surfaces.map((surface) => surface.name) },
          error instanceof Error ? error.message : String(error),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_stockpile', async (message) => {
      const deps = getDeps();
      const data = asData(message);
      const rawPoints = Array.isArray(data.points) ? data.points : [];
      const points: StockpilePoint[] = rawPoints
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
          easting: Number(entry.easting ?? entry.e),
          northing: Number(entry.northing ?? entry.n),
          elevation: Number(entry.elevation ?? entry.z),
        }));
      if (points.length < 3) {
        return respond(message, false, undefined, 'At least three stockpile top points are required.');
      }
      try {
        const result = computeStockpileVolume({
          baseElevation: Number(data.baseElevation ?? data.base),
          points,
          spacingFt: numberFrom(data.spacingFt),
          cutSwellPercent: numberFrom(data.cutSwellPercent),
          fillShrinkPercent: numberFrom(data.fillShrinkPercent),
        });
        const saved = retainResult(result, data, deps);
        return respond(message, true, {
          ...formatSummary(result),
          baseElevation: result.baseElevation,
          ...saved,
        });
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_list_scenarios', async (message) => {
      const scenarios = listDirtVolumeScenarios();
      return respond(message, true, { scenarios, count: scenarios.length });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_compare', async (message) => {
      const data = asData(message);
      const ids = Array.isArray(data.ids)
        ? data.ids.filter((id): id is string => typeof id === 'string')
        : undefined;
      try {
        const comparison = compareDirtVolumeScenarios(ids, stringFrom(data.baselineId));
        return respond(message, true, comparePayload(comparison));
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_format_report', async (message) => {
      const data = asData(message);
      try {
        const scenario = resolveReportScenario(data);
        let comparison: DirtVolumeComparison | null = null;
        if (data.includeComparison !== false) {
          try {
            if (listDirtVolumeScenarios().length >= 2) comparison = compareDirtVolumeScenarios();
          } catch {
            comparison = null;
          }
        }
        return respond(message, true, {
          report: formatDirtVolumeReport({
            scenario,
            comparison,
            projectName: stringFrom(data.projectName),
            location: stringFrom(data.location),
            preparedBy: stringFrom(data.preparedBy),
            notes: stringFrom(data.notes),
          }),
          scenarioId: scenario.id,
          cutCy: scenario.cutCy,
          fillCy: scenario.fillCy,
          adjustedNetCy: scenario.adjustedNetCy,
        });
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_export_pdf', async (message) => {
      const data = asData(message);
      try {
        const scenario = resolveReportScenario(data);
        const comparison = data.includeComparison === false
          ? null
          : listDirtVolumeScenarios().length >= 2
            ? compareDirtVolumeScenarios()
            : null;
        const artifact = buildDirtVolumeReportPdf({
          scenario,
          comparison,
          projectName: stringFrom(data.projectName),
          location: stringFrom(data.location),
          preparedBy: stringFrom(data.preparedBy),
          notes: stringFrom(data.notes),
        });
        if (typeof document !== 'undefined') {
          triggerDownload(artifact.blob, artifact.fileName);
        }
        return respond(message, true, {
          exported: true,
          fileName: artifact.fileName,
          scenarioId: scenario.id,
        });
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_open_panel', async (message) => {
      getDeps().openPanel?.();
      return respond(message, true, { opened: true, mounted: 'chat' });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_clear', async (message) => {
      clearDirtVolumeScenarios();
      latestScenarioId = null;
      return respond(message, true, { cleared: true });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('dirt_volume_delete_scenario', async (message) => {
      const data = asData(message);
      const id = stringFrom(data.scenarioId);
      if (!id) return respond(message, false, undefined, 'scenarioId is required.');
      const deleted = deleteDirtVolumeScenario(id);
      if (latestScenarioId === id) latestScenarioId = null;
      if (!deleted) return respond(message, false, undefined, `No scenario "${id}" exists.`);
      return respond(message, true, { deleted: true, scenarioId: id });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
    latestScenarioId = null;
  };
}
