/**
 * roadObjectExtraction — deterministic math for linked road profiles/sections.
 *
 * The Roading Agent owns the RoadObject identity; the Profile Agent calls this
 * module with snapshots of session state. No React and no global mutation here.
 */

import type {
  Centerline,
  ElevationSourceKind,
  RoadAttachmentAnchor,
  RoadCriticalStation,
  RoadCrossSectionSet,
  RoadCrossSectionStation,
  RoadObject,
  RoadObjectIssue,
  RoadProfile,
  RoadProfileSample,
  RoadProfileSampleSource,
  RoadSectionDesignPoint,
  RoadSectionGroundPoint,
  RoadSectionHook,
  StationRange,
  SurveyLine,
  SurveyPoint,
  TinSurface,
} from '../types';
import { sampleElevationAt } from './TinService';
import {
  calculateCenterlineLength,
  calculateCenterlineTangentBearing,
  calculatePointFromStationOffset,
  formatStation,
  getCenterlineKeyStations,
} from '../utils/stationing';

export interface ExtractionContext {
  centerlines: Centerline[];
  points: SurveyPoint[];
  lines: SurveyLine[];
  tinSurfaces: TinSurface[];
}

export type RoadExtractionResult =
  | {
      kind: 'complete';
      existingProfile: RoadProfile;
      designProfile: RoadProfile | null;
      crossSections: RoadCrossSectionSet;
      issues: RoadObjectIssue[];
    }
  | {
      kind: 'needs-input';
      preview: {
        existingProfile: RoadProfile;
        designProfile: RoadProfile | null;
        crossSections: RoadCrossSectionSet;
      };
      missing: StationRange[];
      issues: RoadObjectIssue[];
    }
  | {
      kind: 'failed';
      error: string;
      issues: RoadObjectIssue[];
    };

interface ResolvedElevation {
  elevation: number | null;
  source: RoadProfileSampleSource;
}

const MAX_PROFILE_SAMPLES = 4000;
const MAX_SECTION_STATIONS = 200;
const POINT_SEARCH_RADIUS_FT = 100;
const CONTOUR_SEARCH_RADIUS_FT = 2.5;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sourceOrder(road: RoadObject): ElevationSourceKind[] {
  const order = road.preferences.elevation.order.filter(
    (kind): kind is ElevationSourceKind => kind === 'tin' || kind === 'contour' || kind === 'points',
  );
  return order.length > 0 ? order : ['tin', 'contour', 'points'];
}

function tinCandidates(road: RoadObject, tins: TinSurface[]): TinSurface[] {
  const selected = road.preferences.elevation.tinId;
  if (selected) {
    const chosen = tins.find(tin => tin.id === selected);
    return chosen ? [chosen] : [];
  }
  return [...tins].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

function resolveElevation(
  easting: number,
  northing: number,
  road: RoadObject,
  context: ExtractionContext,
): ResolvedElevation {
  for (const source of sourceOrder(road)) {
    if (source === 'tin') {
      for (const tin of tinCandidates(road, context.tinSurfaces)) {
        const z = sampleElevationAt(tin, easting, northing);
        if (z !== null && Number.isFinite(z)) return { elevation: round(z), source: 'tin' };
      }
    } else if (source === 'contour') {
      const z = nearestContourElevation(easting, northing, context.lines);
      if (z !== null) return { elevation: round(z), source: 'contour' };
    } else {
      const z = inverseDistanceElevation(easting, northing, context.points);
      if (z !== null) return { elevation: round(z), source: 'points' };
    }
  }
  return { elevation: null, source: 'gap' };
}

function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { distance: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { distance: Math.hypot(px - ax, py - ay), t: 0 };
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return { distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

function nearestContourElevation(easting: number, northing: number, lines: SurveyLine[]): number | null {
  let best: { distance: number; z: number } | null = null;
  for (const line of lines) {
    if (!line.type?.startsWith('contour')) continue;
    const a = line.fromPt;
    const b = line.toPt;
    if (!a || !b) continue;
    if (![a.x, a.y, a.z, b.x, b.y, b.z].every(value => typeof value === 'number' && Number.isFinite(value))) continue;
    const hit = distancePointToSegment(easting, northing, a.x, a.y, b.x, b.y);
    if (hit.distance > CONTOUR_SEARCH_RADIUS_FT) continue;
    const z = (a.z as number) + hit.t * ((b.z as number) - (a.z as number));
    if (!best || hit.distance < best.distance) best = { distance: hit.distance, z };
  }
  return best?.z ?? null;
}

function inverseDistanceElevation(easting: number, northing: number, points: SurveyPoint[]): number | null {
  let weighted = 0;
  let weightSum = 0;
  for (const point of points) {
    if (!Number.isFinite(point.elevation)) continue;
    const distance = Math.hypot(point.easting - easting, point.northing - northing);
    if (distance <= 0.001) return point.elevation as number;
    if (distance > POINT_SEARCH_RADIUS_FT) continue;
    const weight = 1 / (distance * distance);
    weighted += (point.elevation as number) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weighted / weightSum : null;
}

function addStation(
  map: Map<string, { station: number; reason: RoadCriticalStation['reason'] | 'interval'; label: string }>,
  station: number,
  reason: RoadCriticalStation['reason'] | 'interval',
  label: string,
): void {
  if (!Number.isFinite(station)) return;
  const key = station.toFixed(3);
  const existing = map.get(key);
  if (existing && existing.reason !== 'interval' && reason === 'interval') return;
  map.set(key, { station: round(station, 3), reason, label });
}

function stationGrid(
  begin: number,
  end: number,
  interval: number,
  keyStations: Array<{ label: string; station: number }>,
  critical: RoadCriticalStation[],
  maxStations: number,
): Array<{ station: number; reason: RoadCriticalStation['reason'] | 'interval'; label: string }> {
  const map = new Map<string, { station: number; reason: RoadCriticalStation['reason'] | 'interval'; label: string }>();
  const effectiveInterval = Math.max(0.01, interval);
  let count = 0;
  for (let station = begin; station <= end + 1e-6; station += effectiveInterval) {
    addStation(map, station, 'interval', formatStation(station));
    count++;
    if (count > maxStations * 2) break;
  }
  addStation(map, begin, 'interval', formatStation(begin));
  addStation(map, end, 'interval', formatStation(end));
  for (const key of keyStations) {
    const reason: RoadCriticalStation['reason'] =
      key.label === 'BOP' ? 'bop'
        : key.label === 'EOP' ? 'eop'
          : key.label.startsWith('PC-') ? 'pc'
            : 'pt';
    addStation(map, key.station, reason, key.label);
  }
  for (const station of critical) {
    addStation(map, station.station, station.reason, station.label);
  }
  const sorted = [...map.values()].sort((a, b) => a.station - b.station);
  if (sorted.length <= maxStations) return sorted;
  const stride = Math.ceil(sorted.length / maxStations);
  const kept = sorted.filter((_, index) => index % stride === 0 || index === sorted.length - 1);
  return kept;
}

function gapsFromSamples(samples: Array<{ station: number; elevation: number | null }>): StationRange[] {
  const gaps: StationRange[] = [];
  let start: number | null = null;
  let end: number | null = null;
  for (const sample of samples) {
    if (sample.elevation === null) {
      if (start === null) start = sample.station;
      end = sample.station;
    } else if (start !== null) {
      gaps.push({ startStation: start, endStation: end as number });
      start = null;
      end = null;
    }
  }
  if (start !== null) gaps.push({ startStation: start, endStation: end as number });
  return gaps;
}

function extrapolateProfile(samples: RoadProfileSample[]): RoadProfileSample[] {
  const next = samples.map(sample => ({ ...sample }));
  let last: number | null = null;
  for (const sample of next) {
    if (sample.elevation !== null) last = sample.elevation;
    else if (last !== null) sample.elevation = last;
  }
  let following: number | null = null;
  for (let index = next.length - 1; index >= 0; index--) {
    const sample = next[index];
    if (sample.elevation !== null) following = sample.elevation;
    else if (following !== null) sample.elevation = following;
  }
  for (const sample of next) {
    if (sample.elevation !== null && sample.source === 'gap') sample.source = 'extrapolated';
  }
  return next;
}

function profileStatus(samples: RoadProfileSample[], policy: string): RoadProfile['status'] {
  if (samples.some(sample => sample.source === 'extrapolated')) return 'unverified';
  if (samples.some(sample => sample.elevation === null)) return policy === 'gaps' ? 'unverified' : 'partial';
  return 'ok';
}

function buildProfile(
  road: RoadObject,
  kind: 'existing' | 'design',
  samples: RoadProfileSample[],
  begin: number,
  end: number,
  signature: string,
): RoadProfile {
  const elevations = samples.map(sample => sample.elevation).filter((z): z is number => z !== null);
  return {
    id: `profile-${road.id}-${kind}`,
    roadObjectId: road.id,
    kind,
    samples,
    beginStation: begin,
    endStation: end,
    lengthFt: round(end - begin, 2),
    minElevation: elevations.length > 0 ? Math.min(...elevations) : null,
    maxElevation: elevations.length > 0 ? Math.max(...elevations) : null,
    gaps: gapsFromSamples(samples),
    sourceOrder: sourceOrder(road),
    status: profileStatus(samples, road.preferences.missingDataPolicy),
    inputSignature: signature,
    computedAt: new Date().toISOString(),
  };
}

function sectionHalfWidth(road: RoadObject): number {
  const section = road.typicalSection;
  const halfTravel = (section.laneCount * section.laneWidthFt) / 2;
  let outer = halfTravel;
  if (section.includeCurbAndGutter) outer += Math.max(0, section.gutterWidthFt) + Math.max(0, section.curbWidthFt);
  if (section.includeSidewalk) outer += Math.max(0, section.sidewalkOffsetFt) + Math.max(0, section.sidewalkWidthFt);
  if (section.rowWidthFt > 0) outer = Math.max(outer, section.rowWidthFt / 2);
  return round(outer + Math.max(0, road.preferences.sectionGroundMarginFt), 2);
}

function designTemplate(
  road: RoadObject,
  station: number,
  startZ: number | null,
): RoadSectionDesignPoint[] {
  const section = road.typicalSection;
  const halfTravel = (section.laneCount * section.laneWidthFt) / 2;
  const backOfCurb = halfTravel +
    (section.includeCurbAndGutter ? Math.max(0, section.gutterWidthFt) + Math.max(0, section.curbWidthFt) : 0);
  const designZ =
    startZ === null || section.designGradePct === undefined
      ? null
      : round(startZ + ((station - road.baselineBeginStation) * section.designGradePct) / 100);
  const edgeZ = designZ === null ? null : round(designZ - (halfTravel * section.crownSlopePct) / 100);
  const offsets: Array<{ offset: number; feature: RoadSectionDesignPoint['feature']; verticalFace?: boolean }> = [
    { offset: 0, feature: 'cl' },
    { offset: -halfTravel, feature: 'ep' },
    { offset: halfTravel, feature: 'ep' },
  ];
  if (section.laneCount > 2) {
    for (let lane = 1; lane < section.laneCount / 2; lane++) {
      const offset = lane * section.laneWidthFt;
      offsets.push({ offset: -offset, feature: 'lane' });
      offsets.push({ offset, feature: 'lane' });
    }
  }
  if (section.includeCurbAndGutter) {
    const gutter = halfTravel + Math.max(0, section.gutterWidthFt);
    const curbBack = gutter + Math.max(0, section.curbWidthFt);
    offsets.push({ offset: -gutter, feature: 'gutter' });
    offsets.push({ offset: gutter, feature: 'gutter' });
    offsets.push({ offset: -curbBack, feature: 'curb-back' });
    offsets.push({ offset: curbBack, feature: 'curb-back' });
    offsets.push({ offset: -gutter, feature: 'curb-face', verticalFace: true });
    offsets.push({ offset: gutter, feature: 'curb-face', verticalFace: true });
  }
  if (section.includeSidewalk) {
    const inner = backOfCurb + Math.max(0, section.sidewalkOffsetFt);
    const outer = inner + Math.max(0, section.sidewalkWidthFt);
    offsets.push({ offset: -inner, feature: 'sidewalk-in' });
    offsets.push({ offset: inner, feature: 'sidewalk-in' });
    offsets.push({ offset: -outer, feature: 'sidewalk-out' });
    offsets.push({ offset: outer, feature: 'sidewalk-out' });
  }
  if (section.rowWidthFt > 0) {
    offsets.push({ offset: -section.rowWidthFt / 2, feature: 'row' });
    offsets.push({ offset: section.rowWidthFt / 2, feature: 'row' });
  }
  const seen = new Set<string>();
  const points: RoadSectionDesignPoint[] = [];
  for (const item of offsets) {
    const offset = round(item.offset, 2);
    const key = `${offset}:${item.feature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const elevation =
      designZ === null
        ? null
        : Math.abs(offset) <= halfTravel
          ? round(designZ - (Math.abs(offset) * section.crownSlopePct) / 100)
          : edgeZ;
    points.push({
      offsetFt: offset,
      elevationFt: elevation,
      feature: item.feature,
      ...(item.verticalFace ? { verticalFace: true } : {}),
    });
  }
  return points;
}

function sectionHooks(
  road: RoadObject,
  sections: RoadCrossSectionStation[],
  interval: number,
): { hooks: Map<number, RoadSectionHook[]>; outOfRange: RoadAttachmentAnchor[] } {
  const hooks = new Map<number, RoadSectionHook[]>();
  const outOfRange: RoadAttachmentAnchor[] = [];
  for (const anchor of road.attachments) {
    let nearest = -1;
    let nearestDelta = Infinity;
    sections.forEach((section, index) => {
      const delta = Math.abs(section.station - anchor.station);
      if (delta < nearestDelta) {
        nearest = index;
        nearestDelta = delta;
      }
    });
    if (nearest < 0 || nearestDelta > interval / 2 + 1e-6) {
      outOfRange.push(anchor);
      continue;
    }
    const list = hooks.get(nearest) ?? [];
    list.push({
      attachmentId: anchor.id,
      consumerId: anchor.consumerId,
      kind: anchor.kind,
      offsetFt: anchor.offsetFt,
      elevationFt: anchor.elevationFt ?? null,
      label: anchor.label,
      stationDeltaFt: round(anchor.station - sections[nearest].station, 3),
    });
    hooks.set(nearest, list);
  }
  return { hooks, outOfRange };
}

export function extractRoadObject(
  road: RoadObject,
  context: ExtractionContext,
  options?: { inputSignature?: string; missingDataPolicy?: 'ask' | 'gaps' | 'extrapolate' },
): RoadExtractionResult {
  const baseline = context.centerlines.find(centerline => centerline.id === road.baselineId);
  if (!baseline) {
    return {
      kind: 'failed',
      error: 'Baseline not found for this road object.',
      issues: [{ code: 'baseline-missing', severity: 'error', message: 'The linked baseline is missing.' }],
    };
  }
  if ((baseline.pis?.length ?? 0) < 2 || calculateCenterlineLength(baseline) <= 0) {
    return {
      kind: 'failed',
      error: 'Baseline has no usable alignment.',
      issues: [{ code: 'baseline-invalid', severity: 'error', message: 'The linked baseline has fewer than two PIs or zero length.' }],
    };
  }

  const begin = baseline.beginStation;
  const length = calculateCenterlineLength(baseline);
  const end = begin + length;
  const signature = options?.inputSignature ?? '';
  const policy = options?.missingDataPolicy ?? road.preferences.missingDataPolicy;
  const keyStations = getCenterlineKeyStations(baseline);

  const profileInterval = Math.max(0.01, road.preferences.profileIntervalFt || 25);
  const profileGrid = stationGrid(begin, end, profileInterval, keyStations, road.criticalStations, MAX_PROFILE_SAMPLES);
  const existingSamples: RoadProfileSample[] = profileGrid.map(station => {
    const point = calculatePointFromStationOffset(baseline, station.station, 0);
    if (!point) return { station: station.station, elevation: null, source: 'gap' };
    const resolved = resolveElevation(point.easting, point.northing, road, context);
    return { station: round(station.station, 3), elevation: resolved.elevation, source: resolved.source };
  });

  const existingProfile = buildProfile(road, 'existing', existingSamples, begin, end, signature);
  const missing = existingProfile.gaps;
  const firstExisting = existingSamples.find(sample => sample.elevation !== null)?.elevation ?? null;

  let designProfile: RoadProfile | null = null;
  if (road.typicalSection.designGradePct !== undefined) {
    const designSamples: RoadProfileSample[] = existingSamples.map(sample => ({
      station: sample.station,
      elevation:
        firstExisting === null
          ? null
          : round(firstExisting + ((sample.station - begin) * (road.typicalSection.designGradePct as number)) / 100),
      source: 'gap',
    }));
    designProfile = buildProfile(road, 'design', designSamples, begin, end, signature);
  }

  const halfWidth = sectionHalfWidth(road);
  const sectionInterval = Math.max(0.01, road.preferences.sectionIntervalFt || road.typicalSection.stationIntervalFt || 50);
  const sectionGrid = stationGrid(begin, end, sectionInterval, keyStations, road.criticalStations, MAX_SECTION_STATIONS);
  const sampleInterval = Math.max(0.5, road.preferences.sectionSampleIntervalFt || 2);
  const sections: RoadCrossSectionStation[] = sectionGrid.map(station => {
    const bearing = calculateCenterlineTangentBearing(baseline, station.station);
    const left = calculatePointFromStationOffset(baseline, station.station, -halfWidth);
    const right = calculatePointFromStationOffset(baseline, station.station, halfWidth);
    const offsets = new Set<number>([-halfWidth, 0, halfWidth]);
    for (let offset = -halfWidth; offset <= halfWidth + 1e-6; offset += sampleInterval) {
      offsets.add(round(clamp(offset, -halfWidth, halfWidth), 2));
    }
    const sortedOffsets = [...offsets].sort((a, b) => a - b);
    const ground: RoadSectionGroundPoint[] = sortedOffsets.map(offset => {
      const point = calculatePointFromStationOffset(baseline, station.station, offset);
      if (!point) return { offsetFt: offset, elevationFt: null, source: 'gap' };
      const resolved = resolveElevation(point.easting, point.northing, road, context);
      return { offsetFt: offset, elevationFt: resolved.elevation, source: resolved.source };
    });
    return {
      id: `xs-${road.id}-${station.station.toFixed(3)}`,
      station: station.station,
      stationLabel: station.label,
      reason: station.reason,
      sectionLine: {
        startEasting: left?.easting ?? 0,
        startNorthing: left?.northing ?? 0,
        endEasting: right?.easting ?? 0,
        endNorthing: right?.northing ?? 0,
        bearingDeg: round((bearing * 180) / Math.PI, 3),
      },
      ground,
      design: designTemplate(road, station.station, firstExisting),
      hooks: [],
      gaps: gapsFromSamples(ground.map(point => ({ station: point.offsetFt, elevation: point.elevationFt }))),
    };
  });

  const hooks = sectionHooks(road, sections, sectionInterval);
  hooks.hooks.forEach((list, index) => {
    sections[index].hooks = list;
  });

  const sectionsWithGaps = sections.some(section => section.gaps.length > 0);
  const crossSections: RoadCrossSectionSet = {
    id: `sections-${road.id}`,
    roadObjectId: road.id,
    stations: sections,
    intervalFt: sectionInterval,
    sampleIntervalFt: sampleInterval,
    leftWidthFt: halfWidth,
    rightWidthFt: halfWidth,
    status: sectionsWithGaps ? 'partial' : 'ok',
    inputSignature: signature,
    computedAt: new Date().toISOString(),
  };

  const issues: RoadObjectIssue[] = [];
  if (road.typicalSection.designGradePct === undefined) {
    issues.push({ code: 'no-design-grade', severity: 'info', message: 'Set a design grade in Roading Studio to generate a design profile.' });
  }
  if (hooks.outOfRange.length > 0) {
    issues.push({
      code: 'attachment-out-of-range',
      severity: 'warning',
      message: `${hooks.outOfRange.length} utility attachment(s) are outside the section station range.`,
    });
  }

  if (missing.length > 0 && policy === 'ask') {
    return {
      kind: 'needs-input',
      preview: { existingProfile, designProfile, crossSections },
      missing,
      issues: [
        ...issues,
        {
          code: 'missing-elevation',
          severity: 'warning',
          message: `No elevation for ${missing.length} station range(s).`,
          stationRange: missing[0],
        },
      ],
    };
  }

  if (policy === 'extrapolate' && missing.length > 0) {
    existingProfile.samples = extrapolateProfile(existingProfile.samples);
    existingProfile.gaps = gapsFromSamples(existingProfile.samples);
    existingProfile.status = 'unverified';
    existingProfile.minElevation = Math.min(
      ...existingProfile.samples.map(sample => sample.elevation).filter((z): z is number => z !== null),
    );
    existingProfile.maxElevation = Math.max(
      ...existingProfile.samples.map(sample => sample.elevation).filter((z): z is number => z !== null),
    );
    for (const section of crossSections.stations) {
      const ground = section.ground.map(point => ({ ...point }));
      let previous: number | null = null;
      for (const point of ground) {
        if (point.elevationFt !== null) previous = point.elevationFt;
        else if (previous !== null) {
          point.elevationFt = previous;
          point.source = 'extrapolated';
        }
      }
      let following: number | null = null;
      for (let index = ground.length - 1; index >= 0; index--) {
        const point = ground[index];
        if (point.elevationFt !== null) following = point.elevationFt;
        else if (following !== null) {
          point.elevationFt = following;
          point.source = 'extrapolated';
        }
      }
      section.ground = ground;
      section.gaps = gapsFromSamples(ground.map(point => ({ station: point.offsetFt, elevation: point.elevationFt })));
    }
    crossSections.status = 'unverified';
  }

  return {
    kind: 'complete',
    existingProfile,
    designProfile,
    crossSections,
    issues,
  };
}
