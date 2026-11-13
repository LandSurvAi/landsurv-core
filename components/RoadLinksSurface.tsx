import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AgentType,
  type RoadObject,
  type RoadProfile,
  type RoadCrossSectionStation,
} from '../types';
import { interAgentComm } from '../services/InterAgentCommunication';
import { roadLinkRegistry } from '../services/roadLinkRegistry';

interface RoadLinksSurfaceProps {
  initialRoadObjectId?: string;
  focus?: 'profiles' | 'sections' | 'missing-data' | 'broken';
}

const STATUS_STYLE: Record<RoadObject['status'], string> = {
  live: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  linked: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  refreshing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'needs-input': 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  broken: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
};

function stationLabel(road: RoadObject, station: number): string {
  return `${(station - road.baselineBeginStation).toFixed(2)}`;
}

function ProfileChart({
  road,
  showExisting,
  showDesign,
}: {
  road: RoadObject;
  showExisting: boolean;
  showDesign: boolean;
}) {
  const width = 720;
  const height = 220;
  const pad = { left: 48, right: 16, top: 18, bottom: 28 };
  const profiles = [showExisting ? road.existingProfile : null, showDesign ? road.designProfile : null]
    .filter((profile): profile is RoadProfile => Boolean(profile));
  const allSamples = profiles.flatMap(profile => profile.samples);
  const elevations = allSamples.map(sample => sample.elevation).filter((z): z is number => z !== null);
  if (profiles.length === 0 || elevations.length === 0) {
    return <div className="h-52 flex items-center justify-center text-xs text-gray-500">No linked profile data.</div>;
  }
  const begin = road.baselineBeginStation;
  const end = road.baselineBeginStation + road.baselineLengthFt;
  const minZ = Math.min(...elevations);
  const maxZ = Math.max(...elevations);
  const spanZ = Math.max(1, maxZ - minZ);
  const x = (station: number) => pad.left + ((station - begin) / Math.max(1, end - begin)) * (width - pad.left - pad.right);
  const y = (z: number) => pad.top + (1 - (z - minZ) / spanZ) * (height - pad.top - pad.bottom);

  const segments = (profile: RoadProfile): string[] => {
    const out: string[] = [];
    let current: string[] = [];
    for (const sample of profile.samples) {
      if (sample.elevation === null) {
        if (current.length > 1) out.push(current.join(' '));
        current = [];
      } else {
        current.push(`${x(sample.station).toFixed(1)},${y(sample.elevation).toFixed(1)}`);
      }
    }
    if (current.length > 1) out.push(current.join(' '));
    return out;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto rounded-lg bg-slate-950/70 border border-slate-800">
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => (
        <line
          key={fraction}
          x1={pad.left}
          x2={width - pad.right}
          y1={pad.top + fraction * (height - pad.top - pad.bottom)}
          y2={pad.top + fraction * (height - pad.top - pad.bottom)}
          stroke="#1e293b"
          strokeWidth="1"
        />
      ))}
      <text x={4} y={pad.top + 4} fill="#94a3b8" fontSize="10">{maxZ.toFixed(1)}</text>
      <text x={4} y={height - pad.bottom} fill="#94a3b8" fontSize="10">{minZ.toFixed(1)}</text>
      <text x={pad.left} y={height - 6} fill="#94a3b8" fontSize="10">BOP</text>
      <text x={width - pad.right - 24} y={height - 6} fill="#94a3b8" fontSize="10">EOP</text>
      {showExisting && road.existingProfile && segments(road.existingProfile).map((points, index) => (
        <polyline key={`existing-${index}`} points={points} fill="none" stroke="#22d3ee" strokeWidth="2" />
      ))}
      {showDesign && road.designProfile && segments(road.designProfile).map((points, index) => (
        <polyline key={`design-${index}`} points={points} fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="6 4" />
      ))}
      <text x={pad.left + 4} y={pad.top + 10} fill="#22d3ee" fontSize="10">existing</text>
      <text x={pad.left + 60} y={pad.top + 10} fill="#fbbf24" fontSize="10">design</text>
    </svg>
  );
}

function SectionView({
  road,
  station,
}: {
  road: RoadObject;
  station: RoadCrossSectionStation;
}) {
  const width = 720;
  const height = 240;
  const pad = { left: 44, right: 16, top: 18, bottom: 28 };
  const left = -road.crossSections!.leftWidthFt;
  const right = road.crossSections!.rightWidthFt;
  const allZ = [...station.ground.map(point => point.elevationFt), ...station.design.map(point => point.elevationFt)]
    .filter((z): z is number => z !== null);
  const minZ = allZ.length > 0 ? Math.min(...allZ) : 0;
  const maxZ = allZ.length > 0 ? Math.max(...allZ) : 1;
  const spanZ = Math.max(1, maxZ - minZ);
  const x = (offset: number) => pad.left + ((offset - left) / Math.max(1, right - left)) * (width - pad.left - pad.right);
  const y = (z: number) => pad.top + (1 - (z - minZ) / spanZ) * (height - pad.top - pad.bottom);

  const groundSegments: string[] = [];
  let current: string[] = [];
  for (const point of station.ground) {
    if (point.elevationFt === null) {
      if (current.length > 1) groundSegments.push(current.join(' '));
      current = [];
    } else {
      current.push(`${x(point.offsetFt).toFixed(1)},${y(point.elevationFt).toFixed(1)}`);
    }
  }
  if (current.length > 1) groundSegments.push(current.join(' '));
  const design = station.design
    .filter(point => point.elevationFt !== null)
    .sort((a, b) => a.offsetFt - b.offsetFt);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto rounded-lg bg-slate-950/70 border border-slate-800">
        {[0, 0.25, 0.5, 0.75, 1].map(fraction => (
          <line
            key={fraction}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + fraction * (height - pad.top - pad.bottom)}
            y2={pad.top + fraction * (height - pad.top - pad.bottom)}
            stroke="#1e293b"
          />
        ))}
        <text x={4} y={pad.top + 4} fill="#94a3b8" fontSize="10">{maxZ.toFixed(1)}</text>
        <text x={4} y={height - pad.bottom} fill="#94a3b8" fontSize="10">{minZ.toFixed(1)}</text>
        <line x1={x(0)} x2={x(0)} y1={pad.top} y2={height - pad.bottom} stroke="#475569" strokeDasharray="3 3" />
        <text x={x(0) + 3} y={pad.top + 10} fill="#94a3b8" fontSize="10">CL</text>
        {groundSegments.map((points, index) => (
          <polyline key={`ground-${index}`} points={points} fill="none" stroke="#22d3ee" strokeWidth="2" />
        ))}
        {design.length > 1 && (
          <polyline
            points={design.map(point => `${x(point.offsetFt).toFixed(1)},${y(point.elevationFt as number).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2"
          />
        )}
        {station.hooks.map(hook => (
          <g key={hook.attachmentId}>
            <circle cx={x(hook.offsetFt)} cy={height - pad.bottom - 6} r="5" fill="#f472b6" />
            <text x={x(hook.offsetFt) + 7} y={height - pad.bottom - 4} fill="#fbcfe8" fontSize="9">{hook.label}</text>
          </g>
        ))}
        <text x={pad.left} y={height - 6} fill="#94a3b8" fontSize="10">{left.toFixed(1)}′ LT</text>
        <text x={width - pad.right - 38} y={height - 6} fill="#94a3b8" fontSize="10">{right.toFixed(1)}′ RT</text>
        <text x={x(0) + 4} y={height - 6} fill="#e2e8f0" fontSize="10">{stationLabel(road, station.station)}</text>
      </svg>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-gray-400">
        <div>Station <span className="text-gray-200">{station.stationLabel}</span></div>
        <div>Reason <span className="text-gray-200">{station.reason}</span></div>
        <div>Ground points <span className="text-gray-200">{station.ground.length}</span></div>
        <div>Hooks <span className="text-gray-200">{station.hooks.length}</span></div>
      </div>
    </div>
  );
}

export const RoadLinksSurface: React.FC<RoadLinksSurfaceProps> = ({ initialRoadObjectId, focus }) => {
  const roads = useSyncExternalStore(
    roadLinkRegistry.subscribe,
    roadLinkRegistry.getSnapshot,
    roadLinkRegistry.getSnapshot,
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialRoadObjectId ?? roads[0]?.id ?? null);
  const [stationIndex, setStationIndex] = useState(0);
  const [showExisting, setShowExisting] = useState(true);
  const [showDesign, setShowDesign] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialRoadObjectId) setSelectedId(initialRoadObjectId);
  }, [initialRoadObjectId]);

  const selected = useMemo(
    () => roads.find(road => road.id === selectedId) ?? roads[0] ?? null,
    [roads, selectedId],
  );
  const sections = selected?.crossSections?.stations ?? [];
  const section = sections[stationIndex] ?? sections[0] ?? null;

  useEffect(() => {
    setStationIndex(0);
  }, [selected?.id]);

  const dispatch = async (agent: AgentType, skill: string, data: Record<string, unknown>) => {
    setBusy(true);
    try {
      await interAgentComm.askPeer(agent, skill, data);
    } finally {
      setBusy(false);
    }
  };

  if (roads.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-3xl">⇄</div>
        <h2 className="text-lg font-semibold text-gray-100">No linked roads yet</h2>
        <p className="max-w-md text-sm text-gray-400">
          Design a parametric corridor in Roading Studio to create a live road object with existing and design
          profiles and cross sections.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-950 text-gray-200">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div>
          <div className="text-sm font-semibold">Road Links</div>
          <div className="text-[10px] text-gray-500">Baseline ↔ linework ↔ live profiles & sections</div>
        </div>
        <button
          type="button"
          disabled={!selected || busy}
          onClick={() => selected && void dispatch(AgentType.ROADING_AGENT, 'road_object_refresh', { roadObjectId: selected.id, reason: 'surface-refresh' })}
          className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-200 disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-60 shrink-0 border-r border-slate-800 overflow-y-auto">
          {roads.map(road => (
            <button
              key={road.id}
              type="button"
              onClick={() => setSelectedId(road.id)}
              className={`w-full text-left px-3 py-2 border-b border-slate-900 transition-colors ${
                selected?.id === road.id ? 'bg-cyan-500/10' : 'hover:bg-slate-900/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold">{road.name}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[8px] uppercase ${STATUS_STYLE[road.status]}`}>
                  {road.status}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-gray-500">{road.baselineName}</div>
              <div className="mt-1 flex gap-2 text-[9px] text-gray-500">
                <span>{road.existingProfile ? 'existing' : 'no existing'}</span>
                <span>{road.designProfile ? 'design' : 'no design'}</span>
                <span>{road.crossSections?.stations.length ?? 0} xs</span>
              </div>
            </button>
          ))}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto p-3 space-y-3">
          {selected && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{selected.name}</h2>
                  <div className="text-[10px] text-gray-500">
                    {selected.baselineName} · {selected.typicalSection.laneCount} lanes ×{' '}
                    {selected.typicalSection.laneWidthFt}′ · {selected.baselineLengthFt.toFixed(2)}′ ·{' '}
                    {selected.roadModelName ?? 'model unavailable'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void dispatch(AgentType.CAD_MANAGER, 'sheet_view_add_profile_viewport', {
                      roadObjectId: selected.id,
                      profileKind: showDesign ? 'design' : 'existing',
                    })}
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] text-gray-300"
                  >
                    Add Profile to Sheet
                  </button>
                  <button
                    type="button"
                    disabled={busy || !section}
                    onClick={() => section && void dispatch(AgentType.CAD_MANAGER, 'sheet_view_add_cross_section_viewport', {
                      roadObjectId: selected.id,
                      station: section.station,
                    })}
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] text-gray-300"
                  >
                    Add Section to Sheet
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Unlink "${selected.name}"? Profiles and sections will be removed.`)) {
                        void dispatch(AgentType.ROADING_AGENT, 'road_object_unlink', { roadObjectId: selected.id, confirm: true });
                      }
                    }}
                    className="rounded border border-rose-500/40 px-2 py-1 text-[10px] text-rose-300"
                  >
                    Unlink
                  </button>
                </div>
              </div>

              {selected.issues.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200">
                  {selected.issues.map((issue, index) => (
                    <div key={`${issue.code}-${index}`}>{issue.message}</div>
                  ))}
                </div>
              )}

              {(selected.status === 'needs-input' || focus === 'missing-data') && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="text-xs font-semibold text-amber-100">Missing elevation coverage</div>
                  <p className="mt-1 text-[11px] text-amber-200/80">
                    Some profile/section stations have no TIN, contour, or point elevation. Choose how to commit them.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['gaps', 'extrapolate'] as const).map(decision => (
                      <button
                        key={decision}
                        type="button"
                        onClick={() => void dispatch(AgentType.PROFILE_AGENT, 'road_object_resolve_missing_data', {
                          roadObjectId: selected.id,
                          decision,
                        })}
                        className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-100"
                      >
                        {decision === 'gaps' ? 'Keep gaps' : 'Extrapolate nearest'}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void dispatch(AgentType.PROFILE_AGENT, 'road_object_resolve_missing_data', {
                        roadObjectId: selected.id,
                        decision: 'cancel',
                      })}
                      className="rounded border border-slate-600 px-2 py-1 text-[10px] text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-gray-300">Profiles</div>
                  <div className="flex gap-2 text-[10px]">
                    <label className="flex items-center gap-1 text-cyan-300">
                      <input type="checkbox" checked={showExisting} onChange={event => setShowExisting(event.target.checked)} />
                      Existing
                    </label>
                    <label className="flex items-center gap-1 text-amber-300">
                      <input type="checkbox" checked={showDesign} onChange={event => setShowDesign(event.target.checked)} />
                      Design
                    </label>
                  </div>
                </div>
                <ProfileChart road={selected} showExisting={showExisting} showDesign={showDesign} />
                {selected.existingProfile && selected.existingProfile.gaps.length > 0 && (
                  <div className="mt-1 text-[10px] text-amber-300">
                    {selected.existingProfile.gaps.length} gap range(s) in the existing profile.
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold text-gray-300">
                    Cross sections {selected.crossSections ? `(${sections.length})` : ''}
                  </div>
                  {sections.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setStationIndex(index => Math.max(0, index - 1))} className="rounded border border-slate-700 px-1.5 text-[10px]">◀</button>
                      <select
                        value={stationIndex}
                        onChange={event => setStationIndex(Number(event.target.value))}
                        className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] text-gray-200"
                      >
                        {sections.map((item, index) => (
                          <option key={item.id} value={index}>{item.stationLabel} · {item.reason}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setStationIndex(index => Math.min(sections.length - 1, index + 1))} className="rounded border border-slate-700 px-1.5 text-[10px]">▶</button>
                    </div>
                  )}
                </div>
                {section ? <SectionView road={selected} station={section} /> : (
                  <div className="h-32 flex items-center justify-center text-xs text-gray-500">No cross-section set.</div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default RoadLinksSurface;
