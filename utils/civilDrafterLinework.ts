import type { SurveyLine, SurveyPoint } from '../types.ts';

/**
 * Compact, token-bounded linework context for the Civil Drafter.
 *
 * The drafter's per-turn context historically contained only the point
 * database. Manual entities (especially circles drawn with C / POLARARRAY)
 * therefore looked like they did not exist. This serializer gives the agent the
 * existing canvas geometry, prioritizing circles and arcs so they are never
 * dropped behind a wall of straight segments.
 */
export interface CanvasLineworkContextOptions {
  /** Maximum number of detailed entities listed, after circles/arcs priority. */
  maxEntities?: number;
  /** Hard character budget for the generated block. */
  maxChars?: number;
}

type WorldPoint = { x: number; y: number };

interface LineworkEntity {
  line: SurveyLine;
  from: WorldPoint | null;
  to: WorldPoint | null;
  center: WorldPoint | null;
  radius: number | null;
  kind: 'circle' | 'arc' | 'segment';
}

const DEFAULT_MAX_ENTITIES = 250;
const DEFAULT_MAX_CHARS = 14_000;

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const formatNumber = (value: number | null | undefined): string =>
  finiteNumber(value) ? value.toFixed(3) : '?';

const layerLabel = (line: SurveyLine): string => (line.layer ?? '').trim() || '0';

function resolveEndpoint(
  line: SurveyLine,
  side: 'from' | 'to',
  pointMap: Map<string, SurveyPoint>,
): WorldPoint | null {
  const explicit = side === 'from' ? line.fromPt : line.toPt;
  if (explicit && finiteNumber(explicit.x) && finiteNumber(explicit.y)) {
    return { x: explicit.x, y: explicit.y };
  }
  const ref = String((side === 'from' ? line.from : line.to) ?? '').trim();
  const point = pointMap.get(ref);
  if (point && finiteNumber(point.easting) && finiteNumber(point.northing)) {
    return { x: point.easting, y: point.northing };
  }
  return null;
}

/** Reference/background layers that would drown out editable CAD geometry. */
function isGeneratedReference(line: SurveyLine): boolean {
  const layer = (line.layer ?? '').toUpperCase();
  return Boolean(
    line.contourGenId ||
    line.source === 'esri' ||
    line.type?.startsWith('contour') ||
    line.type === 'tin-edge' ||
    line.type === 'steep-slope' ||
    line.type === 'shrinkwrap-preview' ||
    layer === 'ESRI-CONTOUR',
  );
}

function classifyEntity(
  line: SurveyLine,
  from: WorldPoint | null,
  to: WorldPoint | null,
): LineworkEntity {
  const radius = finiteNumber(line.curveRadius) ? line.curveRadius : null;
  const center = line.circleCenter && finiteNumber(line.circleCenter.x) && finiteNumber(line.circleCenter.y)
    ? { x: line.circleCenter.x, y: line.circleCenter.y }
    : (line.isCircle ? from : null);

  const endpointsCoincide = Boolean(
    from &&
    to &&
    Math.hypot(from.x - to.x, from.y - to.y) < 1e-6,
  );
  const isCircle = Boolean(
    line.isCircle ||
    (line.isCurve && radius && endpointsCoincide && !line.chordBearing && !line.tangentBearing),
  );

  if (isCircle) {
    return { line, from, to, center: center ?? from ?? to, radius, kind: 'circle' };
  }
  if (line.isCurve && radius && finiteNumber(line.arcLength)) {
    return { line, from, to, center, radius, kind: 'arc' };
  }
  return { line, from, to, center, radius, kind: 'segment' };
}

export function buildCivilDrafterLineworkContext(
  lines: SurveyLine[],
  points: SurveyPoint[] = [],
  options: CanvasLineworkContextOptions = {},
): string {
  if (!Array.isArray(lines) || lines.length === 0) return '';

  const maxEntities = Math.max(1, Math.round(options.maxEntities ?? DEFAULT_MAX_ENTITIES));
  const maxChars = Math.max(500, Math.round(options.maxChars ?? DEFAULT_MAX_CHARS));

  const visible = lines.filter(line => line && !line.hidden);
  const hiddenCount = lines.length - visible.length;
  const editable = visible.filter(line => !isGeneratedReference(line));
  const generatedCount = visible.length - editable.length;
  if (editable.length === 0) return '';

  const pointMap = new Map<string, SurveyPoint>();
  for (const point of points) pointMap.set(point.pointNumber, point);

  const entities = editable.map(line => classifyEntity(
    line,
    resolveEndpoint(line, 'from', pointMap),
    resolveEndpoint(line, 'to', pointMap),
  ));

  const circles = entities.filter(entity => entity.kind === 'circle');
  const arcs = entities.filter(entity => entity.kind === 'arc');
  const segments = entities.filter(entity => entity.kind === 'segment');

  const layerCounts = new Map<string, number>();
  for (const line of editable) {
    const layer = layerLabel(line);
    layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
  }
  const sortedLayers = [...layerCounts.entries()].sort((a, b) => b[1] - a[1]);
  const layerSummary = sortedLayers
    .slice(0, 12)
    .map(([layer, count]) => `${layer} (${count})`)
    .join(', ');
  const extraLayers = sortedLayers.length > 12 ? `, +${sortedLayers.length - 12} more` : '';

  // Include circle radii in the extent — otherwise a ring of circles around a
  // remote pivot collapses to a handful of center points and clips the frame.
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  const includePoint = (point: WorldPoint) => {
    if (!finiteNumber(point.x) || !finiteNumber(point.y)) return;
    minE = Math.min(minE, point.x);
    maxE = Math.max(maxE, point.x);
    minN = Math.min(minN, point.y);
    maxN = Math.max(maxN, point.y);
  };
  for (const entity of entities) {
    if (entity.kind === 'circle' && entity.center && entity.radius) {
      includePoint({ x: entity.center.x - entity.radius, y: entity.center.y - entity.radius });
      includePoint({ x: entity.center.x + entity.radius, y: entity.center.y + entity.radius });
      continue;
    }
    if (entity.from) includePoint(entity.from);
    if (entity.to) includePoint(entity.to);
  }

  const header = [
    '---BEGIN CANVAS LINEWORK---',
    'Existing geometry already drawn on the canvas (world coordinates: x=easting, y=northing). Treat these as available canvas entities; do not claim the canvas is empty when entities are listed here.',
    `Visible editable entities: ${entities.length} (${circles.length} circle${circles.length === 1 ? '' : 's'}, ${arcs.length} arc${arcs.length === 1 ? '' : 's'}/curve${arcs.length === 1 ? '' : 's'}, ${segments.length} line segment${segments.length === 1 ? '' : 's'}).`,
    hiddenCount > 0 ? `Hidden entities not included: ${hiddenCount}.` : '',
    generatedCount > 0 ? `Generated reference/contour entities omitted from detail: ${generatedCount}.` : '',
    layerSummary ? `Layers: ${layerSummary}${extraLayers}.` : '',
    Number.isFinite(minE) && Number.isFinite(minN)
      ? `Extent: E ${minE.toFixed(3)} to ${maxE.toFixed(3)}, N ${minN.toFixed(3)} to ${maxN.toFixed(3)}.`
      : '',
    '',
  ].filter(line => line !== '');

  const formatEntity = (entity: LineworkEntity): string | null => {
    const layer = layerLabel(entity.line);
    if (entity.kind === 'circle') {
      if (!entity.center) return null;
      return `- CIRCLE center=(${formatNumber(entity.center.x)}, ${formatNumber(entity.center.y)}) radius=${formatNumber(entity.radius)} diameter=${formatNumber(entity.radius === null ? null : entity.radius * 2)} layer=${layer}`;
    }
    if (entity.kind === 'arc') {
      if (!entity.from || !entity.to) return null;
      const center = entity.center
        ? ` center=(${formatNumber(entity.center.x)}, ${formatNumber(entity.center.y)})`
        : '';
      return `- ARC start=(${formatNumber(entity.from.x)}, ${formatNumber(entity.from.y)}) end=(${formatNumber(entity.to.x)}, ${formatNumber(entity.to.y)})${center} radius=${formatNumber(entity.radius)} arcLength=${formatNumber(entity.line.arcLength)} direction=${entity.line.curveDirection ?? 'unspecified'} layer=${layer}`;
    }
    if (!entity.from || !entity.to) return null;
    return `- LINE start=(${formatNumber(entity.from.x)}, ${formatNumber(entity.from.y)}) end=(${formatNumber(entity.to.x)}, ${formatNumber(entity.to.y)}) layer=${layer}`;
  };

  // Circles and arcs first so a large straight-segment run cannot crowd them
  // out of the capped detail list.
  const prioritized = [...circles, ...arcs, ...segments];
  const details: string[] = [];
  let usedChars = header.join('\n').length;
  let omitted = 0;
  for (const entity of prioritized) {
    const detail = formatEntity(entity);
    if (!detail) {
      omitted += 1;
      continue;
    }
    if (details.length >= maxEntities || usedChars + detail.length + 1 > maxChars) {
      omitted += 1;
      continue;
    }
    details.push(detail);
    usedChars += detail.length + 1;
  }

  const footer = [
    omitted > 0
      ? `Detail truncated: ${details.length} of ${prioritized.length} entities listed. Counts above still cover the full canvas.`
      : '',
    '---END CANVAS LINEWORK---',
    '',
  ].filter(line => line !== '');

  return [...header, ...details, ...footer].join('\n');
}
