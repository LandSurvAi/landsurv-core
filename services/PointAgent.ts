// Point Agent - CACP-enabled authoritative source for point numbering, queries
// and deed-associated point lookups.
//
// Skills (see services/AgentRegistry.ts for the full manifest):
//   - request_next_point_number  → returns next N PNs honoring user settings
//   - reserve_point_numbers      → atomically claims a block of PNs
//   - release_reservation        → frees a previously reserved block
//   - query_points               → search by number / description / elevation / spatial
//   - get_deed_points            → points associated with a deed parcel
//   - update_point_list          → create / replace / merge a named point list
//   - deed_loaded                → context-switch listener
//
// All callers should use interAgentComm; do NOT compute next point numbers
// elsewhere in the codebase.

import { interAgentComm, InterAgentCommunicationService } from './InterAgentCommunication';
import { AgentType, type PointLabelingSettings, type SurveyPoint } from '../types';
import { getNextPointNumber } from '../utils/pointFile';

export interface ReservationSnapshot {
  reservationId: string;
  numbers: string[];
  owner?: string;
  createdAt: number;
}

/** Request payload for the `update_point_list` CACP skill. */
export interface PointListUpdateRequest {
  /** Stable list id. If omitted, the bridge derives one from listName. */
  listId?: string;
  /** Display name shown in the Point Lists panel. */
  listName: string;
  /** Points to add (or replace) on the list. */
  points: SurveyPoint[];
  /** Point numbers to remove from any existing list before merge (cleanup of prior draft). */
  removePointIds?: string[];
  /** When true, list contents are replaced with `points` instead of merged. */
  replacePoints?: boolean;
  /** Initial visibility for newly-created lists. Default true. */
  isVisible?: boolean;
}

export class PointAgent {
  private static instance: PointAgent;
  private interAgentComm: InterAgentCommunicationService;
  private availablePoints: any[] = [];
  private labelingSettings: PointLabelingSettings = { style: 'numeric', prefix: '', nextNumber: 1 };
  private reservations: Map<string, ReservationSnapshot> = new Map();
  private reservationCounter = 0;
  /** Bridge to the React-owned pointLists state. App.tsx registers a callback at
   *  mount; the `update_point_list` skill delegates to it so this agent stays
   *  the canonical CACP entry point without duplicating React state. */
  private pointListBridge: ((req: PointListUpdateRequest) => { listId: string }) | null = null;

  private constructor() {
    this.interAgentComm = interAgentComm;
    this.registerHandlers();
  }

  static getInstance(): PointAgent {
    if (!PointAgent.instance) {
      PointAgent.instance = new PointAgent();
    }
    return PointAgent.instance;
  }

  // ---------------------------------------------------------------------
  // Public setters used by App.tsx
  // ---------------------------------------------------------------------

  public setAvailablePoints(points: any[]) {
    this.availablePoints = points;
  }

  public setLabelingSettings(settings: PointLabelingSettings) {
    this.labelingSettings = settings;
  }

  /** Snapshot reservations for project save. */
  public exportReservations(): ReservationSnapshot[] {
    return Array.from(this.reservations.values());
  }

  /** Restore reservations from project load. */
  public importReservations(snapshots: ReservationSnapshot[]) {
    this.reservations.clear();
    let maxId = 0;
    for (const r of snapshots) {
      this.reservations.set(r.reservationId, r);
      const n = parseInt(r.reservationId.replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    }
    this.reservationCounter = maxId;
  }

  /** Register the React-side bridge for the `update_point_list` skill. Called
   *  once from App.tsx on mount. */
  public registerPointListBridge(fn: (req: PointListUpdateRequest) => { listId: string }) {
    this.pointListBridge = fn;
  }

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

  private registerHandlers() {
    this.interAgentComm.onCommand('deed_loaded', async (message) => {
      this.onDeedLoaded(message.data);
    });

    this.interAgentComm.onCommand('get_deed_points', async (message) => {
      const deedPoints = await this.getDeedAssociatedPoints(message.data);
      return {
        requestId: message.id,
        from: AgentType.POINT_EDITOR,
        success: true,
        timestamp: Date.now(),
        data: {
          points: deedPoints,
          pointCount: deedPoints.length,
          parcelId: message.data.parcelId,
        },
      };
    });

    this.interAgentComm.onCommand('query_points', async (message) => {
      const queryResult = await this.queryPoints(message.data);
      return {
        requestId: message.id,
        from: AgentType.POINT_EDITOR,
        success: true,
        timestamp: Date.now(),
        data: queryResult,
      };
    });

    this.interAgentComm.onCommand('request_next_point_number', async (message) => {
      const count = Math.max(1, Number(message.data.count) || 1);
      const numbers = this.computeNextNumbers(count);
      return {
        requestId: message.id,
        from: AgentType.POINT_EDITOR,
        success: true,
        timestamp: Date.now(),
        data: { numbers },
      };
    });

    this.interAgentComm.onCommand('reserve_point_numbers', async (message) => {
      const count = Math.max(1, Number(message.data.count) || 1);
      const owner = typeof message.data.owner === 'string' ? message.data.owner : message.from;
      const numbers = this.computeNextNumbers(count);
      const reservationId = `res-${++this.reservationCounter}-${Date.now()}`;
      const snapshot: ReservationSnapshot = {
        reservationId,
        numbers,
        owner,
        createdAt: Date.now(),
      };
      this.reservations.set(reservationId, snapshot);
      return {
        requestId: message.id,
        from: AgentType.POINT_EDITOR,
        success: true,
        timestamp: Date.now(),
        data: { reservationId, numbers },
      };
    });

    this.interAgentComm.onCommand('release_reservation', async (message) => {
      const id = String(message.data.reservationId || '');
      const released = this.reservations.delete(id);
      return {
        requestId: message.id,
        from: AgentType.POINT_EDITOR,
        success: true,
        timestamp: Date.now(),
        data: { released },
      };
    });

    this.interAgentComm.onCommand('update_point_list', async (message) => {
      const req = message.data as unknown as PointListUpdateRequest;
      if (!this.pointListBridge) {
        return {
          requestId: message.id,
          from: AgentType.POINT_EDITOR,
          success: false,
          timestamp: Date.now(),
          data: { error: 'pointListBridge not registered' },
        };
      }
      const { listId } = this.pointListBridge(req);
      return {
        requestId: message.id,
        from: AgentType.POINT_EDITOR,
        success: true,
        timestamp: Date.now(),
        data: { listId, pointCount: req.points?.length ?? 0 },
      };
    });

    console.log(
      '[PointAgent] CACP handlers registered: deed_loaded, get_deed_points, query_points, request_next_point_number, reserve_point_numbers, release_reservation, update_point_list'
    );
  }

  // ---------------------------------------------------------------------
  // Numbering authority
  // ---------------------------------------------------------------------

  /**
   * Compute the next N point numbers honoring user labeling settings AND
   * skipping over both existing PNs and currently-reserved PNs.
   */
  private computeNextNumbers(count: number): string[] {
    const { style, prefix, nextNumber } = this.labelingSettings;

    const taken = new Set<string>();
    for (const p of this.availablePoints) {
      if (p?.pointNumber !== undefined && p?.pointNumber !== null) {
        taken.add(String(p.pointNumber));
      }
    }
    for (const r of this.reservations.values()) {
      for (const n of r.numbers) taken.add(n);
    }

    const out: string[] = [];
    let cursor = nextNumber || 1;
    for (let i = 0; i < count; i++) {
      const next = getNextPointNumber(taken, style, prefix || '', cursor);
      out.push(next);
      taken.add(next);
      const numericPart = parseInt(next.replace(prefix || '', ''), 10);
      cursor = isNaN(numericPart) ? cursor + 1 : numericPart + 1;
    }
    return out;
  }

  /**
   * Synchronous helper for in-process callers that already have direct access
   * to the singleton (e.g. App.tsx). Equivalent to `request_next_point_number`
   * but without going through the message bus.
   *
   * `caller` lets the activity log + CACP indicator attribute the request to
   * the originating agent (Boundary Agent, Civil Drafter, etc.) even though we
   * short-circuit the bus dispatch.
   */
  public getNextNumbers(count: number = 1, caller?: AgentType): string[] {
    const numbers = this.computeNextNumbers(count);
    // Surface direct (in-process) calls in the CACP activity log so the
    // bottom-left indicator and DevOps log show *all* point-numbering traffic,
    // not just messages that went over the bus.
    try {
      this.interAgentComm.recordActivity({
        from: caller ?? AgentType.POINT_EDITOR,
        to: AgentType.POINT_EDITOR,
        command: 'request_next_point_number (direct)',
        data: { count, issued: numbers },
      });
    } catch { /* never let logging break callers */ }
    return numbers;
  }

  // ---------------------------------------------------------------------
  // Existing query / deed logic (preserved)
  // ---------------------------------------------------------------------

  private onDeedLoaded(deedInfo: any) {
    console.log(`[PointAgent] Deed loaded: ${deedInfo.parcelId}`);
  }

  private async getDeedAssociatedPoints(deedQuery: any): Promise<any[]> {
    const { controlPointNumbers } = deedQuery;
    const controlSet = new Set((controlPointNumbers || []).map(String));

    const controlPoints = this.availablePoints.filter(p =>
      controlSet.has(String(p.pointNumber))
    );

    const surveyPoints = this.availablePoints.filter(p => {
      const desc = (p.description || '').toLowerCase();
      const isSurveyPoint =
        desc.includes('survey') ||
        desc.includes('set') ||
        desc.includes('found') ||
        desc.includes('c.p.') ||
        desc.includes('corner') ||
        desc.includes('prop');
      return isSurveyPoint && !controlSet.has(String(p.pointNumber));
    });

    return [...controlPoints, ...surveyPoints];
  }

  private async queryPoints(query: any): Promise<any> {
    const { pointNumbers, byDescription, byElevationRange, spatial } = query;
    let results = [...this.availablePoints];

    if (pointNumbers && pointNumbers.length > 0) {
      const set = new Set(pointNumbers.map(String));
      results = results.filter(p => set.has(String(p.pointNumber)));
    }
    if (byDescription) {
      const needle = String(byDescription).toLowerCase();
      results = results.filter(p => (p.description || '').toLowerCase().includes(needle));
    }
    if (byElevationRange) {
      const { min, max } = byElevationRange;
      results = results.filter(p => p.elevation >= min && p.elevation <= max);
    }
    if (spatial) {
      const { minE, maxE, minN, maxN } = spatial;
      results = results.filter(
        p => p.easting >= minE && p.easting <= maxE && p.northing >= minN && p.northing <= maxN
      );
    }

    return { points: results, count: results.length, query };
  }

  // ---------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------

  public broadcastPointStatus() {
    void this.interAgentComm.sendMessage(
      AgentType.POINT_EDITOR,
      'broadcast',
      'point_agent_ready',
      {
        availablePoints: this.availablePoints.length,
        reservations: this.reservations.size,
        timestamp: new Date().toISOString(),
      }
    );
  }

  public registerErrorHandler() {
    this.interAgentComm.onError((error) => {
      console.error('[PointAgent] Inter-agent communication error:', error);
    });
  }
}

// Auto-initialize and export singleton
export const pointAgent = PointAgent.getInstance();
