/**
 * roadLinkRegistry — shared, non-agent owner of first-class RoadObjects.
 *
 * Roading creates/updates the road identity, Profile writes extracted payloads,
 * A2UI reads snapshots, and future utility consumers attach typed links and
 * station/offset anchors. The registry has no AI behavior and no React import.
 */

import type {
  Centerline,
  ElevationSourceKind,
  RoadAttachmentAnchor,
  RoadCorridorRun,
  RoadCrossSectionSet,
  RoadLinkKind,
  RoadObject,
  RoadObjectIssue,
  RoadObjectLink,
  RoadObjectPreferences,
  RoadProfile,
  RoadTypicalSection,
  SurveyLine,
  SurveyPoint,
  TinSurface,
} from '../types';
import { centerlineGeometrySignature } from './parametricAssociations';
import { calculateCenterlineLength, getCenterlineKeyStations } from '../utils/stationing';

const MAX_LINKS = 50;
const MAX_ATTACHMENTS = 200;
const MAX_PAYLOAD_BYTES = 8 * 1024;

export interface RoadLinkConsumer<T = Record<string, unknown>> {
  consumerId: string;
  label: string;
  kinds: RoadLinkKind[];
  schemaVersion: string;
  validate(payload: unknown):
    | { ok: true; value: T }
    | { ok: false; error: string };
  describe(payload: T): string;
  anchors?(
    payload: T,
    road: RoadObject,
  ): Array<{
    kind: string;
    station: number;
    offsetFt: number;
    elevationFt?: number | null;
    label: string;
    payload: Record<string, unknown>;
  }>;
  sectionHooks?(
    payload: T,
    station: number,
  ): Array<{
    kind: string;
    offsetFt: number;
    elevationFt: number | null;
    label: string;
  }>;
  signature?(payload: T): string;
}

export interface LinkRoadModelInput {
  roadModel: RoadCorridorRun;
  centerline: Centerline;
  lines?: SurveyLine[];
}

export interface SignatureContext {
  centerlines: Centerline[];
  points: SurveyPoint[];
  lines: SurveyLine[];
  tinSurfaces: TinSurface[];
  roadCorridors?: RoadCorridorRun[];
}

export interface AttachInput {
  roadObjectId: string;
  consumerId: string;
  kind: RoadLinkKind;
  targetKind: string;
  targetId: string;
  payload: unknown;
}

export const DEFAULT_ROAD_OBJECT_PREFERENCES: RoadObjectPreferences = {
  elevation: { order: ['tin', 'contour', 'points'], tinId: null },
  profileIntervalFt: 25,
  sectionIntervalFt: 50,
  sectionSampleIntervalFt: 2,
  sectionGroundMarginFt: 10,
  missingDataPolicy: 'ask',
};

let objects: RoadObject[] = [];
const listeners = new Set<() => void>();
const consumers = new Map<string, RoadLinkConsumer>();

function notify(): void {
  for (const listener of listeners) listener();
}

function replaceObject(id: string, updater: (road: RoadObject) => RoadObject): RoadObject | undefined {
  let next: RoadObject | undefined;
  objects = objects.map(road => {
    if (road.id !== id) return road;
    next = updater(road);
    return next;
  });
  if (next) notify();
  return next;
}

function issue(
  code: RoadObjectIssue['code'],
  severity: RoadObjectIssue['severity'],
  message: string,
  stationRange?: RoadObjectIssue['stationRange'],
): RoadObjectIssue {
  return { code, severity, message, stationRange };
}

function addIssue(road: RoadObject, next: RoadObjectIssue): RoadObjectIssue[] {
  if (road.issues.some(i => i.code === next.code && i.message === next.message)) return road.issues;
  return [...road.issues, next];
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function checksum<T>(items: T[], serialize: (item: T) => string): string {
  return fnv1a(items.map(serialize).join('|'));
}

export function sanitizeRoadObjectId(centerlineId: string): string {
  const safe = centerlineId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `roadobj-${safe || 'baseline'}`;
}

export function defaultRoadObjectPreferences(sectionIntervalFt?: number): RoadObjectPreferences {
  return {
    ...DEFAULT_ROAD_OBJECT_PREFERENCES,
    elevation: { ...DEFAULT_ROAD_OBJECT_PREFERENCES.elevation, order: [...DEFAULT_ROAD_OBJECT_PREFERENCES.elevation.order] },
    sectionIntervalFt:
      typeof sectionIntervalFt === 'number' && sectionIntervalFt > 0
        ? sectionIntervalFt
        : DEFAULT_ROAD_OBJECT_PREFERENCES.sectionIntervalFt,
  };
}

function criticalStationsFor(centerline: Centerline): RoadObject['criticalStations'] {
  return getCenterlineKeyStations(centerline).map(key => {
    const reason =
      key.label === 'BOP' ? 'bop'
        : key.label === 'EOP' ? 'eop'
          : key.label.startsWith('PC-') ? 'pc'
            : 'pt';
    return { station: key.station, reason, label: key.label };
  });
}

function modelSignature(roadModel: RoadCorridorRun): string {
  return JSON.stringify({
    mode: roadModel.mode,
    centerlineId: roadModel.centerlineId ?? null,
    name: roadModel.name,
    typicalSection: roadModel.typicalSection,
    culDeSacRadiusFt: roadModel.culDeSacRadiusFt ?? null,
    filletRadiusFt: roadModel.filletRadiusFt ?? null,
  });
}

function lineworkIdsSignature(
  lineIds: string[],
  pointIds: string[],
  associationIds: string[],
): string {
  const sortedLines = [...lineIds].sort();
  const sortedPoints = [...pointIds].sort();
  const sortedAssociations = [...associationIds].sort();
  return `${sortedLines.join(',')}|${sortedPoints.join(',')}|${sortedAssociations.join(',')}`;
}

function lineworkSignature(input: LinkRoadModelInput): string {
  return lineworkIdsSignature(
    input.roadModel.drawnLineIds ?? [],
    input.roadModel.drawnPointIds ?? [],
    input.roadModel.associationIds ?? [],
  );
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function builtInLinks(road: RoadObject): RoadObjectLink[] {
  const now = new Date().toISOString();
  const links = road.links.filter(link => link.consumerId !== 'builtin.profile' && link.consumerId !== 'builtin.cross-section');
  if (road.existingProfile) {
    links.push({
      id: `link-${road.id}-existing`,
      roadObjectId: road.id,
      kind: 'profile',
      targetKind: 'road-profile',
      targetId: road.existingProfile.id,
      consumerId: 'builtin.profile',
      schemaVersion: '1.0.0',
      sourceSignature: road.existingProfile.inputSignature,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (road.designProfile) {
    links.push({
      id: `link-${road.id}-design`,
      roadObjectId: road.id,
      kind: 'profile',
      targetKind: 'road-profile',
      targetId: road.designProfile.id,
      consumerId: 'builtin.profile',
      schemaVersion: '1.0.0',
      sourceSignature: road.designProfile.inputSignature,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (road.crossSections) {
    links.push({
      id: `link-${road.id}-sections`,
      roadObjectId: road.id,
      kind: 'cross-section',
      targetKind: 'cross-section-set',
      targetId: road.crossSections.id,
      consumerId: 'builtin.cross-section',
      schemaVersion: '1.0.0',
      sourceSignature: road.crossSections.inputSignature,
      createdAt: now,
      updatedAt: now,
    });
  }
  return links;
}

export const roadLinkRegistry = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): readonly RoadObject[] {
    return objects;
  },

  list(): readonly RoadObject[] {
    return objects;
  },

  get(roadObjectId: string): RoadObject | undefined {
    return objects.find(road => road.id === roadObjectId);
  },

  getByBaseline(baselineId: string): RoadObject | undefined {
    return objects.find(road => road.baselineId === baselineId);
  },

  hydrate(next: RoadObject[]): void {
    objects = Array.isArray(next) ? next.map(road => ({ ...road, issues: [...(road.issues ?? [])] })) : [];
    notify();
  },

  resetForTests(): void {
    objects = [];
    consumers.clear();
    notify();
  },

  registerConsumer(consumer: RoadLinkConsumer): void {
    consumers.set(consumer.consumerId, consumer);
  },

  getConsumer(consumerId: string): RoadLinkConsumer | undefined {
    return consumers.get(consumerId);
  },

  linkRoadModel(input: LinkRoadModelInput): RoadObject {
    const { roadModel, centerline } = input;
    const baselineId = centerline.id;
    const existing = this.getByBaseline(baselineId);
    const now = new Date().toISOString();
    const baseId = sanitizeRoadObjectId(baselineId);
    const id =
      existing?.id ??
      (objects.some(road => road.id === baseId && road.baselineId !== baselineId)
        ? `${baseId}-${objects.filter(road => road.id.startsWith(baseId)).length + 1}`
        : baseId);

    if (existing) {
      const previousModelId = existing.roadModelId;
      const next: RoadObject = {
        ...existing,
        name: roadModel.name || existing.name,
        baselineName: centerline.name || existing.baselineName,
        baselineBeginStation: centerline.beginStation,
        baselineLengthFt: calculateCenterlineLength(centerline),
        baselineSignature: centerlineGeometrySignature(centerline),
        roadModelId: roadModel.id,
        roadModelName: roadModel.name,
        typicalSection: { ...roadModel.typicalSection },
        modelSignature: modelSignature(roadModel),
        linework: {
          lineIds: [...(roadModel.drawnLineIds ?? [])],
          pointIds: [...(roadModel.drawnPointIds ?? [])],
          associationIds: [...(roadModel.associationIds ?? [])],
          signature: lineworkSignature(input),
        },
        criticalStations: criticalStationsFor(centerline),
        existingProfile: existing.roadModelId === roadModel.id ? existing.existingProfile : null,
        designProfile: existing.roadModelId === roadModel.id ? existing.designProfile : null,
        crossSections: existing.roadModelId === roadModel.id ? existing.crossSections : null,
        status: 'linked',
        issues: previousModelId && previousModelId !== roadModel.id
          ? addIssue(existing, issue('road-model-moved', 'info', `Linked to ${roadModel.name}; supersedes the previous model on this baseline.`))
          : existing.issues.filter(i => i.code !== 'road-model-moved'),
        updatedAt: now,
      };
      next.links = builtInLinks(next);
      return replaceObject(existing.id, () => next) ?? next;
    }

    const road: RoadObject = {
      id,
      schemaVersion: 1,
      name: roadModel.name || centerline.name || 'Road Object',
      baselineId,
      baselineName: centerline.name || 'Baseline',
      baselineBeginStation: centerline.beginStation,
      baselineLengthFt: calculateCenterlineLength(centerline),
      baselineSignature: centerlineGeometrySignature(centerline),
      roadModelId: roadModel.id,
      roadModelName: roadModel.name,
      typicalSection: { ...roadModel.typicalSection },
      modelSignature: modelSignature(roadModel),
      linework: {
        lineIds: [...(roadModel.drawnLineIds ?? [])],
        pointIds: [...(roadModel.drawnPointIds ?? [])],
        associationIds: [...(roadModel.associationIds ?? [])],
        signature: lineworkSignature(input),
      },
      preferences: defaultRoadObjectPreferences(roadModel.typicalSection.stationIntervalFt),
      criticalStations: criticalStationsFor(centerline),
      existingProfile: null,
      designProfile: null,
      crossSections: null,
      links: [],
      attachments: [],
      status: 'linked',
      issues: [],
      createdAt: now,
      updatedAt: now,
    };
    objects = [...objects, road];
    notify();
    return road;
  },

  /**
   * Replace the current station-point links with the points that actually carry
   * this road object's association. Line-work point ids that still exist are
   * retained so legacy road-model points are not dropped during the migration.
   */
  syncPointLinks(roadObjectId: string, pointIds: string[]): RoadObject | undefined {
    const current = this.get(roadObjectId);
    if (!current) return undefined;

    const nextPointIds = [...new Set(pointIds)].sort();
    if (sameIds(current.linework.pointIds, nextPointIds)) return current;

    return replaceObject(roadObjectId, road => ({
      ...road,
      linework: {
        ...road.linework,
        pointIds: nextPointIds,
        signature: lineworkIdsSignature(
          road.linework.lineIds,
          nextPointIds,
          road.linework.associationIds,
        ),
      },
      updatedAt: new Date().toISOString(),
    }));
  },

  updatePreferences(roadObjectId: string, patch: Partial<RoadObjectPreferences>): RoadObject | undefined {
    return replaceObject(roadObjectId, road => {
      const elevationOrder = patch.elevation?.order?.filter(
        (kind): kind is ElevationSourceKind => kind === 'tin' || kind === 'contour' || kind === 'points',
      );
      const cleaned = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as Partial<RoadObjectPreferences>;
      return {
        ...road,
        preferences: {
          ...road.preferences,
          ...cleaned,
          elevation: {
            ...road.preferences.elevation,
            ...(patch.elevation ?? {}),
            order: elevationOrder && elevationOrder.length > 0 ? elevationOrder : road.preferences.elevation.order,
          },
        },
        status: road.status === 'broken' ? 'broken' : 'linked',
        updatedAt: new Date().toISOString(),
      };
    });
  },

  beginExtraction(roadObjectId: string): RoadObject | undefined {
    return replaceObject(roadObjectId, road => ({
      ...road,
      status: road.status === 'broken' ? 'broken' : 'refreshing',
      updatedAt: new Date().toISOString(),
    }));
  },

  applyExtraction(
    roadObjectId: string,
    result: {
      existingProfile: RoadProfile;
      designProfile: RoadProfile | null;
      crossSections: RoadCrossSectionSet;
      issues?: RoadObjectIssue[];
    },
    signature: string,
  ): RoadObject | undefined {
    return replaceObject(roadObjectId, road => {
      const next: RoadObject = {
        ...road,
        existingProfile: result.existingProfile,
        designProfile: result.designProfile,
        crossSections: result.crossSections,
        issues: (result.issues ?? []).filter(i => i.code !== 'extraction-failed' && i.code !== 'profile-agent-unavailable'),
        status: 'live',
        computedInputSignature: signature,
        lastExtractedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      next.links = builtInLinks(next);
      return next;
    });
  },

  markNeedsInput(
    roadObjectId: string,
    issues: RoadObjectIssue[],
    signature?: string,
  ): RoadObject | undefined {
    return replaceObject(roadObjectId, road => ({
      ...road,
      status: 'needs-input',
      issues: [
        ...road.issues.filter(i => i.code !== 'missing-elevation'),
        ...issues,
      ],
      computedInputSignature: signature ?? road.computedInputSignature,
      updatedAt: new Date().toISOString(),
    }));
  },

  failExtraction(roadObjectId: string, message: string): RoadObject | undefined {
    return replaceObject(roadObjectId, road => ({
      ...road,
      status: 'failed',
      issues: addIssue(road, issue('extraction-failed', 'error', message)),
      updatedAt: new Date().toISOString(),
    }));
  },

  setStatus(roadObjectId: string, status: RoadObject['status'], issues?: RoadObjectIssue[]): RoadObject | undefined {
    return replaceObject(roadObjectId, road => ({
      ...road,
      status,
      issues: issues ?? road.issues,
      updatedAt: new Date().toISOString(),
    }));
  },

  unlink(roadObjectId: string): { removed: RoadObject } | undefined {
    const removed = this.get(roadObjectId);
    if (!removed) return undefined;
    objects = objects.filter(road => road.id !== roadObjectId);
    notify();
    return { removed };
  },

  assertBaselineDeletable(baselineId: string): { allowed: boolean; roadObject?: RoadObject } {
    const roadObject = this.getByBaseline(baselineId);
    return { allowed: !roadObject, roadObject };
  },

  buildInputSignature(road: RoadObject, context: SignatureContext): string {
    const centerline = context.centerlines.find(cl => cl.id === road.baselineId);
    const baseline = centerline ? centerlineGeometrySignature(centerline) : 'missing';
    const roadModel = context.roadCorridors?.find(model => model.id === road.roadModelId);
    const tinParts = [...context.tinSurfaces]
      .map(tin => `${tin.id}:${tin.vertices.length}:${tin.triangles.length}:${tin.vertices[0]?.elevation ?? ''}:${tin.vertices[tin.vertices.length - 1]?.elevation ?? ''}`)
      .sort();
    const contourParts = context.lines
      .filter(line => line.type?.startsWith('contour'))
      .map(line => `${line.id ?? ''}:${line.fromPt?.x ?? ''}:${line.fromPt?.y ?? ''}:${line.fromPt?.z ?? ''}:${line.toPt?.x ?? ''}:${line.toPt?.y ?? ''}:${line.toPt?.z ?? ''}`)
      .sort();
    const pointParts = context.points
      .filter(point => Number.isFinite(point.elevation))
      .map(point => `${point.pointNumber}:${point.easting}:${point.northing}:${point.elevation}`)
      .sort();
    const attachmentParts = road.attachments
      .map(anchor => `${anchor.id}:${anchor.consumerId}:${anchor.kind}:${anchor.station}:${anchor.offsetFt}:${anchor.elevationFt ?? ''}`)
      .sort();
    return fnv1a(JSON.stringify({
      baseline,
      beginStation: road.baselineBeginStation,
      typical: road.typicalSection,
      model: roadModel ? modelSignature(roadModel) : road.modelSignature,
      linework: road.linework.signature,
      preferences: road.preferences,
      critical: road.criticalStations.map(k => `${k.station}:${k.reason}:${k.label}`).sort(),
      tins: tinParts,
      contours: checksum(contourParts, value => value),
      points: checksum(pointParts, value => value),
      attachments: attachmentParts,
    }));
  },

  attach(input: AttachInput): { link: RoadObjectLink; attachments: RoadAttachmentAnchor[] } {
    const road = this.get(input.roadObjectId);
    if (!road) throw new Error('ROAD_OBJECT_NOT_FOUND');
    const consumer = consumers.get(input.consumerId);
    if (!consumer) throw new Error('ROAD_CONSUMER_UNKNOWN');
    if (!consumer.kinds.includes(input.kind)) throw new Error('ROAD_CONSUMER_INVALID');
    const validation = consumer.validate(input.payload);
    if (validation.ok === false) throw new Error(`ROAD_CONSUMER_INVALID: ${validation.error}`);
    if (road.links.length >= MAX_LINKS) throw new Error('ROAD_ATTACHMENT_LIMIT');
    const payloadText = JSON.stringify(input.payload);
    if (payloadText.length > MAX_PAYLOAD_BYTES) throw new Error('ROAD_PAYLOAD_TOO_LARGE');

    const now = new Date().toISOString();
    const link: RoadObjectLink = {
      id: `link-${road.id}-${consumer.consumerId}-${Date.now()}`,
      roadObjectId: road.id,
      kind: input.kind,
      targetKind: input.targetKind,
      targetId: input.targetId,
      consumerId: consumer.consumerId,
      schemaVersion: consumer.schemaVersion,
      sourceSignature: consumer.signature?.(validation.value) ?? fnv1a(payloadText),
      createdAt: now,
      updatedAt: now,
    };
    const anchors: RoadAttachmentAnchor[] = (consumer.anchors?.(validation.value, road) ?? [])
      .slice(0, MAX_ATTACHMENTS)
      .map((anchor, index) => ({
        id: `attach-${road.id}-${consumer.consumerId}-${Date.now()}-${index}`,
        roadObjectId: road.id,
        consumerId: consumer.consumerId,
        kind: anchor.kind,
        station: anchor.station,
        offsetFt: anchor.offsetFt,
        elevationFt: anchor.elevationFt ?? null,
        label: anchor.label,
        payload: anchor.payload,
        createdAt: now,
        updatedAt: now,
      }));
    replaceObject(road.id, current => ({
      ...current,
      links: [...current.links, link],
      attachments: [...current.attachments, ...anchors].slice(0, MAX_ATTACHMENTS),
      updatedAt: now,
    }));
    return { link, attachments: anchors };
  },

  detach(roadObjectId: string, linkId: string): void {
    const road = this.get(roadObjectId);
    if (!road) throw new Error('ROAD_OBJECT_NOT_FOUND');
    const link = road.links.find(item => item.id === linkId);
    if (!link) throw new Error('ROAD_LINK_NOT_FOUND');
    replaceObject(roadObjectId, current => ({
      ...current,
      links: current.links.filter(item => item.id !== linkId),
      attachments: current.attachments.filter(anchor => anchor.consumerId !== link.consumerId),
      updatedAt: new Date().toISOString(),
    }));
  },

  /** Create RoadObjects for legacy parametric models. Returns only newly created roads. */
  adoptLegacyRoadModels(roadCorridors: RoadCorridorRun[], centerlines: Centerline[]): RoadObject[] {
    const adopted: RoadObject[] = [];
    for (const model of roadCorridors) {
      if (model.mode !== 'road-model' && model.mode !== 'corridor-design') continue;
      const centerline = centerlines.find(cl => cl.id === model.centerlineId);
      if (!centerline || (centerline.pis?.length ?? 0) < 2) continue;
      if (calculateCenterlineLength(centerline) <= 0) continue;
      if (this.getByBaseline(centerline.id)) continue;
      const road = this.linkRoadModel({ roadModel: model, centerline });
      model.roadObjectId = road.id;
      adopted.push(road);
    }
    return adopted;
  },
};

export type RoadLinkRegistry = typeof roadLinkRegistry;
