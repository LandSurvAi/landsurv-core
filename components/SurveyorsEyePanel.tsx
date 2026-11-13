import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Eye } from 'lucide-react';
import { formatStation } from '../utils/gimbalRoadModel.ts';
import { gimbalVisionStore, type GimbalVisionSnapshot } from '../services/gimbalVisionStore.ts';
import type { VisionFrame, VisionSurvey } from '../utils/civilDrafterVision.ts';

type Section = 'frames' | 'road' | 'qa' | 'gates';
type Tone = 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose' | 'slate' | 'teal';
type AcceptanceGate = NonNullable<GimbalVisionSnapshot['acceptance']>['verdict']['gates'][number];

const CHIP_TONES: Record<Tone, { idle: string; active: string }> = {
  cyan: {
    idle: 'border-cyan-400/25 bg-cyan-400/[0.06] text-cyan-200/85 hover:bg-cyan-400/10',
    active: 'border-cyan-300/55 bg-cyan-400/15 text-cyan-100',
  },
  emerald: {
    idle: 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200/85 hover:bg-emerald-400/10',
    active: 'border-emerald-300/55 bg-emerald-400/15 text-emerald-100',
  },
  violet: {
    idle: 'border-violet-400/25 bg-violet-400/[0.06] text-violet-200/85 hover:bg-violet-400/10',
    active: 'border-violet-300/55 bg-violet-400/15 text-violet-100',
  },
  amber: {
    idle: 'border-amber-400/25 bg-amber-400/[0.06] text-amber-200/85 hover:bg-amber-400/10',
    active: 'border-amber-300/55 bg-amber-400/15 text-amber-100',
  },
  rose: {
    idle: 'border-rose-400/25 bg-rose-400/[0.06] text-rose-200/85 hover:bg-rose-400/10',
    active: 'border-rose-300/55 bg-rose-400/15 text-rose-100',
  },
  slate: {
    idle: 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]',
    active: 'border-slate-300/35 bg-white/[0.08] text-slate-200',
  },
  teal: {
    idle: 'border-teal-400/25 bg-teal-400/[0.06] text-teal-200/85 hover:bg-teal-400/10',
    active: 'border-teal-300/55 bg-teal-400/15 text-teal-100',
  },
};

function Chip({
  children,
  tone = 'slate',
  active = false,
  onClick,
  title,
  className = '',
}: {
  children: React.ReactNode;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const palette = CHIP_TONES[tone];
  const classes = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.07em] transition-colors ${active ? palette.active : palette.idle} ${className}`;
  if (!onClick) return <span className={classes} title={title}>{children}</span>;
  return (
    <button type="button" className={classes} onClick={onClick} title={title} aria-pressed={active}>
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-200">{value}</div>
    </div>
  );
}

function Card({
  title,
  tone = 'slate',
  chip,
  children,
  testId,
}: {
  title: string;
  tone?: Tone;
  chip?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  const color = tone === 'slate' ? 'text-slate-300' : CHIP_TONES[tone].active.split(' ').find(value => value.startsWith('text-')) ?? 'text-slate-300';
  return (
    <section data-testid={testId} className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className={`font-mono text-[9px] font-bold uppercase tracking-[0.13em] ${color}`}>{title}</h3>
        {chip}
      </div>
      {children}
    </section>
  );
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] px-3 py-6 text-center text-[11px] text-slate-500">
      {children}
    </div>
  );
}

function frameTitle(frame: VisionFrame): string {
  return frame.label.split('|')[1]?.trim() ?? frame.label;
}

/**
 * In-panel frame viewer. It deliberately has no viewport-sized overlay: the
 * stage stays inside the A2UI surface, the arrows open a three-up strip, and
 * selecting a strip frame returns to the single large view.
 */
function FrameViewer({ survey, inspectionSurvey, isScanning, isInspecting }: {
  survey: VisionSurvey | null;
  inspectionSurvey: VisionSurvey | null;
  isScanning: boolean;
  isInspecting: boolean;
}) {
  const surveyFrames = survey?.frames ?? [];
  const inspectionFrames = inspectionSurvey?.frames ?? [];
  const [source, setSource] = useState<'survey' | 'inspection'>(surveyFrames.length > 0 ? 'survey' : 'inspection');
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'single' | 'strip'>('single');

  useEffect(() => {
    setIndex(0);
    setMode('single');
  }, [source]);

  const activeSource = source === 'inspection' && inspectionFrames.length > 0 ? 'inspection' : 'survey';
  const frames = activeSource === 'inspection' ? inspectionFrames : surveyFrames;
  const current = frames[index] ?? frames[0];

  useEffect(() => {
    setIndex(value => Math.min(value, Math.max(0, frames.length - 1)));
  }, [frames.length]);

  const chooseSource = (next: 'survey' | 'inspection') => {
    setSource(next);
    setIndex(0);
    setMode('single');
  };

  const step = (delta: number) => {
    if (frames.length < 2) return;
    setIndex(value => Math.max(0, Math.min(frames.length - 1, value + delta)));
    setMode('strip');
  };

  const selectFrame = (nextIndex: number) => {
    setIndex(nextIndex);
    setMode('single');
  };

  const visibleCount = Math.min(3, frames.length);
  const start = Math.max(0, Math.min(index - 1, Math.max(0, frames.length - visibleCount)));
  const visible = mode === 'strip'
    ? frames.slice(start, start + visibleCount).map((frame, offset) => ({ frame, frameIndex: start + offset }))
    : current
      ? [{ frame: current, frameIndex: index }]
      : [];

  return (
    <section data-testid="vision-stage" className="border-b border-white/[0.06] bg-[#050a12]/70 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {surveyFrames.length > 0 && (
            <Chip tone="cyan" active={activeSource === 'survey'} onClick={() => chooseSource('survey')}>
              Pass 1 · Survey
            </Chip>
          )}
          {inspectionFrames.length > 0 && (
            <Chip tone="teal" active={activeSource === 'inspection'} onClick={() => chooseSource('inspection')}>
              Pass 2 · Draft
            </Chip>
          )}
          {frames.length > 0 && (
            <span className="ml-1 font-mono text-[9px] text-slate-500">
              {mode === 'strip' ? '3-up strip' : 'Full frame'}
            </span>
          )}
        </div>
        {frames.length > 0 && (
          <span data-testid="vision-frame-position" className="font-mono text-[9px] text-slate-400">
            {index + 1} / {frames.length}
          </span>
        )}
      </div>

      <div
        data-testid="vision-stage-track"
        data-view={mode === 'strip' ? 'strip' : 'single'}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, visible.length)}, minmax(0, 1fr))` }}
      >
        {visible.length === 0 ? (
          <div className={`flex h-40 items-center justify-center rounded-md border border-dashed border-white/[0.08] bg-black/20 px-4 text-center font-mono text-[10px] leading-5 ${isScanning || isInspecting ? 'animate-pulse text-cyan-200/80' : 'text-slate-500'}`}>
            {isScanning
              ? 'Capturing survey frames…'
              : isInspecting
                ? 'Capturing pass-2 draft frames…'
                : 'No survey frames yet. Frames appear here as Surveyors Eye captures them.'}
          </div>
        ) : visible.map(({ frame, frameIndex }) => {
          const active = frameIndex === index;
          return (
            <button
              key={`${frameIndex}-${frame.label}`}
              type="button"
              onClick={() => selectFrame(frameIndex)}
              aria-label={`Select frame ${frameIndex + 1}`}
              aria-current={active ? 'true' : undefined}
              title={frame.description}
              className={`group relative overflow-hidden rounded-md border bg-[#02060d] text-left transition-colors ${
                active ? 'border-cyan-300/55' : 'border-white/10 hover:border-white/25'
              }`}
            >
              <img
                src={`data:image/png;base64,${frame.base64}`}
                alt={frame.label}
                draggable={false}
                className="block w-full object-contain"
                style={{ height: mode === 'strip' ? 116 : 'clamp(180px, 30vh, 300px)' }}
              />
              <div className="flex items-center justify-between gap-1.5 border-t border-white/[0.06] bg-black/35 px-2 py-1">
                <span className={`truncate font-mono text-[8.5px] ${active ? 'text-cyan-200' : 'text-slate-400'}`}>
                  {frameIndex + 1}. {frameTitle(frame)}
                </span>
                <span className="shrink-0 font-mono text-[7.5px] uppercase tracking-[0.08em] text-slate-500">
                  {mode === 'strip' ? 'Select' : 'Active'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {frames.length > 0 && (
        <>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              data-testid="vision-stage-prev"
              aria-label="Previous frame"
              disabled={index === 0}
              onClick={() => step(-1)}
              className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-slate-300 transition-colors hover:border-cyan-400/35 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ←
            </button>
            <div className="min-w-0 flex-1 text-center">
              <span className="font-mono text-[9px] text-slate-400">
                {mode === 'strip' ? 'Select a frame to return to full size' : 'Use the arrows to open the three-up strip'}
              </span>
            </div>
            <button
              type="button"
              data-testid="vision-stage-next"
              aria-label="Next frame"
              disabled={index === frames.length - 1}
              onClick={() => step(1)}
              className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-slate-300 transition-colors hover:border-cyan-400/35 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              →
            </button>
          </div>

          {current && (
            <p className="mt-1.5 line-clamp-2 font-mono text-[9px] leading-4 text-slate-500" title={current.description}>
              {current.description}
            </p>
          )}

          <div data-testid="vision-filmstrip" className="scrollbar-hide mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {frames.map((frame, i) => (
              <button
                key={`${i}-${frame.label}`}
                type="button"
                data-testid={`vision-thumb-${i}`}
                aria-label={`Show frame ${i + 1}`}
                onClick={() => selectFrame(i)}
                className={`shrink-0 overflow-hidden rounded border bg-black/30 transition-colors ${
                  i === index ? 'border-cyan-300/55' : 'border-white/10 hover:border-white/25'
                }`}
              >
                <img
                  src={`data:image/png;base64,${frame.base64}`}
                  alt={`Frame ${i + 1} thumbnail`}
                  draggable={false}
                  className="block h-12 w-[74px] object-cover"
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function FramesSection({ survey, inspectionSurvey }: { survey: VisionSurvey | null; inspectionSurvey: VisionSurvey | null }) {
  if (!survey && !inspectionSurvey) {
    return <EmptySection>No visual survey has been captured yet.</EmptySection>;
  }

  return (
    <div className="space-y-2">
      {survey && (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Stat label="Frames" value={survey.frames.length} />
            <Stat label="Points" value={survey.totalPoints.toLocaleString()} />
            <Stat label="Lines" value={survey.totalLines.toLocaleString()} />
            <Stat label="Extent" value={`${survey.surveyExtentFt.width.toFixed(0)} × ${survey.surveyExtentFt.height.toFixed(0)} ft`} />
          </div>
          <Card
            title="Survey narrative"
            tone="cyan"
            chip={<Chip tone={survey.parcelLinesRendered ? 'amber' : 'cyan'}>{survey.parcelLinesRendered ? 'Parcels visible' : 'Parcels filtered'}</Chip>}
          >
            <p className="max-h-36 overflow-y-auto whitespace-pre-wrap font-mono text-[9.5px] leading-5 text-slate-400">
              {survey.spatialNarrative || 'No spatial narrative was recorded for this survey.'}
            </p>
          </Card>
        </>
      )}
      {inspectionSurvey && (
        <Card
          title="Pass 2 draft coverage"
          tone="teal"
          chip={<Chip tone="teal">{inspectionSurvey.frames.length} frames</Chip>}
        >
          <p className="font-mono text-[9.5px] leading-5 text-slate-400">
            The drawn road over the field shots. This set is inspected against the pass-1 target and the road math model.
          </p>
        </Card>
      )}
    </div>
  );
}

function RoadSection({ snapshot }: { snapshot: GimbalVisionSnapshot }) {
  const { roadReview, mathModel, gimbalInspection } = snapshot;
  if (!roadReview && !mathModel && !gimbalInspection) {
    return <EmptySection>No road review has run for this take yet.</EmptySection>;
  }

  return (
    <div className="space-y-2">
      {roadReview && (
        <Card
          title="Road take review"
          tone={roadReview.status === 'needs_retake' ? 'rose' : 'violet'}
          testId="road-take-review"
          chip={
            <Chip tone={roadReview.status === 'needs_retake' ? 'rose' : 'emerald'}>
              {roadReview.status === 'clean' ? 'Clean' : roadReview.status === 'corrected' ? 'Repaired' : 'Retake'}
            </Chip>
          }
        >
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Score" value={`${roadReview.scoreBefore}% → ${roadReview.scoreAfter}%`} />
            <Stat label="Takes" value={roadReview.takes} />
            <Stat label="Features" value={roadReview.featuresAudited} />
          </div>
          <p className="mt-1.5 font-mono text-[9px] leading-4 text-slate-500">
            Grounded on {roadReview.grounding.osmWays} OSM way{roadReview.grounding.osmWays === 1 ? '' : 's'} ·{' '}
            {roadReview.grounding.parcelSegments} parcel line{roadReview.grounding.parcelSegments === 1 ? '' : 's'}
            {roadReview.inferredFromGeometry ? ' · layer inferred from geometry' : ''}
          </p>
          {roadReview.repairs.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[9px] leading-4 text-slate-400">
              {roadReview.repairs.slice(0, 3).map((repair, i) => <li key={i}>· {repair}</li>)}
            </ul>
          )}
          {roadReview.remaining.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[9px] leading-4 text-rose-300/80">
              {roadReview.remaining.slice(0, 3).map((defect, i) => <li key={i}>· {defect}</li>)}
            </ul>
          )}
        </Card>
      )}

      {mathModel && mathModel.corridors.length > 0 && (
        <Card
          title="Road math model"
          tone="violet"
          testId="road-math-model"
          chip={<Chip tone="violet">{mathModel.corridors.length} corridors</Chip>}
        >
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Length" value={`${mathModel.totalLengthFt.toFixed(0)} ft`} />
            <Stat label="Width" value={mathModel.widthFt !== null ? `${mathModel.widthFt.toFixed(1)} ft` : '—'} />
            <Stat label="Sections" value={mathModel.sections} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {mathModel.corridors.slice(0, 6).map(corridor => (
              <Chip key={corridor.id} tone={corridor.source === 'parcel_gap' ? 'amber' : 'violet'}>
                {corridor.id} {corridor.source === 'parcel_gap' ? 'gap' : ''} {formatStation(corridor.stationStartFt)}→{formatStation(corridor.stationEndFt)}
              </Chip>
            ))}
          </div>
          {(mathModel.intersections?.length ?? 0) > 0 && (
            <div className="mt-2 border-t border-white/[0.06] pt-1.5">
              <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500">Intersections</div>
              {mathModel.intersections!.slice(0, 4).map(node => (
                <div key={node.id} className="mt-1 font-mono text-[9px] text-slate-400">
                  <span className="text-fuchsia-300/90">{node.id}</span> {node.kind} · {node.angleDeg.toFixed(0)}° · {node.arms.length} arms
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {gimbalInspection && (
        <Card
          title="Second inspection"
          tone={gimbalInspection.acceptable ? 'emerald' : 'rose'}
          testId="road-second-inspection"
          chip={<Chip tone={gimbalInspection.acceptable ? 'emerald' : 'rose'}>{gimbalInspection.score}%</Chip>}
        >
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Verdict" value={gimbalInspection.acceptable ? 'Pass' : 'Issues'} />
            <Stat label="Coverage" value={`${gimbalInspection.coveragePct.toFixed(0)}%`} />
            <Stat label="Width drift" value={gimbalInspection.widthDriftFt !== null ? `${gimbalInspection.widthDriftFt.toFixed(1)} ft` : '—'} />
          </div>
          {gimbalInspection.defects.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[9px] leading-4 text-rose-300/80">
              {gimbalInspection.defects.slice(0, 4).map((defect, i) => <li key={i}>· {defect}</li>)}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function QaSection({ snapshot }: { snapshot: GimbalVisionSnapshot }) {
  const { qa } = snapshot;
  if (!qa || qa.status === 'unverified') {
    return <EmptySection>No synthesis QA result is available yet.</EmptySection>;
  }

  return (
    <Card
      title="Synthesis QA"
      tone={qa.status === 'corrected' ? 'emerald' : 'cyan'}
      testId="synthesis-qa"
      chip={<Chip tone={qa.status === 'corrected' ? 'emerald' : 'cyan'}>{qa.scoreBefore}% → {qa.scoreAfter}%</Chip>}
    >
      <p className="font-mono text-[9.5px] leading-5 text-slate-400">
        {qa.status === 'corrected'
          ? `${qa.defectsCorrected} of ${qa.defectsFound} defect${qa.defectsFound === 1 ? '' : 's'} corrected on image evidence.`
          : `Image-truth verified · ${qa.featuresAudited} feature${qa.featuresAudited === 1 ? '' : 's'} audited.`}
      </p>
      {qa.repairs.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[9px] leading-4 text-slate-400">
          {qa.repairs.slice(0, 4).map((repair, i) => <li key={i}>· {repair}</li>)}
        </ul>
      )}
      {qa.overlayDataUrl && (
        <img
          src={qa.overlayDataUrl}
          alt="Synthesis QA overlay"
          className="mt-2 max-h-44 w-full rounded-md border border-emerald-400/20 object-contain"
        />
      )}
    </Card>
  );
}

function GatePins({ gates }: { gates: AcceptanceGate[] }) {
  const pinned = gates.filter(gate => Boolean(gate.at));
  if (pinned.length === 0) return null;
  const minE = Math.min(...pinned.map(gate => gate.at!.easting));
  const maxE = Math.max(...pinned.map(gate => gate.at!.easting));
  const minN = Math.min(...pinned.map(gate => gate.at!.northing));
  const maxN = Math.max(...pinned.map(gate => gate.at!.northing));

  return (
    <svg viewBox="0 0 100 70" role="img" aria-label="Road acceptance defect pins" className="mt-2 h-20 w-full rounded-md border border-white/[0.07] bg-black/25">
      {[20, 40, 60, 80].map(x => <line key={`v${x}`} x1={x} y1={6} x2={x} y2={64} stroke="rgba(148,163,184,0.10)" strokeWidth={0.3} />)}
      {[20, 40, 50].map(y => <line key={`h${y}`} x1={6} y1={y} x2={94} y2={y} stroke="rgba(148,163,184,0.10)" strokeWidth={0.3} />)}
      {pinned.map((gate, index) => {
        const px = 6 + ((gate.at!.easting - minE) / Math.max(1, maxE - minE)) * 88;
        const py = 64 - ((gate.at!.northing - minN) / Math.max(1, maxN - minN)) * 56;
        const color = gate.severity === 'red' ? '#FB7185' : '#FBBF24';
        return (
          <g key={`${gate.id}-${index}`}>
            <circle cx={px} cy={py} r={3.8} fill="rgba(2,6,15,0.9)" stroke={color} strokeWidth={1.1} />
            <circle cx={px} cy={py} r={1.1} fill={color} />
            <text x={px + 4.6} y={py + 1.8} fontSize={4.2} fill={color} fontFamily="monospace">{gate.id}{index + 1}</text>
            <title>{`${gate.id}: ${gate.detail}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

function GatesSection({ acceptance }: { acceptance: GimbalVisionSnapshot['acceptance'] }) {
  const [selectedGateKey, setSelectedGateKey] = useState<string | null>(null);
  if (!acceptance) {
    return <EmptySection>No road acceptance run has been recorded yet.</EmptySection>;
  }

  const gates = acceptance.verdict.gates;
  const selectedGate = gates.find((gate, index) => `${gate.id}-${index}` === selectedGateKey) ?? null;
  const failed = gates.filter(gate => gate.applicable && !gate.passed);

  return (
    <div className="space-y-2">
      <Card
        title="Road acceptance"
        tone={acceptance.verified ? 'emerald' : 'rose'}
        testId="road-acceptance"
        chip={<Chip tone={acceptance.verified ? 'emerald' : 'rose'}>{acceptance.verified ? 'Accepted' : 'Unverified'}</Chip>}
      >
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Stat label="Gates" value={`${acceptance.verdict.passedCount} / ${acceptance.verdict.applicableCount}`} />
          <Stat label="Score" value={`${acceptance.verdict.score}%`} />
          <Stat label="Coverage" value={`${acceptance.verdict.coveragePct.toFixed(0)}%`} />
          <Stat label="Shot recall" value={`${acceptance.verdict.shotRecallPct.toFixed(0)}%`} />
        </div>
        <p className="mt-1.5 font-mono text-[9px] text-slate-500">
          Turn {acceptance.turnsUsed}/8 · width {' '}
          {acceptance.widthDecision ? acceptance.widthDecision.replace('_', ' ') : 'unchanged'}
          {acceptance.verdict.widthDriftFt !== null ? ` · ${acceptance.verdict.widthDriftFt.toFixed(1)} ft drift` : ''}
        </p>

        <div className="mt-2 flex flex-wrap gap-1">
          {gates.map((gate, index) => {
            const key = `${gate.id}-${index}`;
            const tone: Tone = !gate.applicable ? 'slate' : gate.passed ? 'emerald' : gate.severity === 'red' ? 'rose' : 'amber';
            return (
              <Chip
                key={key}
                tone={tone}
                active={selectedGateKey === key}
                onClick={() => setSelectedGateKey(value => value === key ? null : key)}
                title={gate.detail}
              >
                {gate.applicable ? (gate.passed ? '✓' : '✕') : '–'} {gate.id}
              </Chip>
            );
          })}
        </div>

        {selectedGate && (
          <div className="mt-2 rounded-md border border-white/[0.07] bg-black/25 px-2 py-1.5 font-mono text-[9px] leading-4 text-slate-400">
            <span className="font-semibold text-slate-200">{selectedGate.id.toUpperCase()}</span>
            {selectedGate.stationFt !== null ? ` · ${formatStation(selectedGate.stationFt)}` : ''}
            {selectedGate.measured !== null ? ` · measured ${selectedGate.measured.toFixed(1)}` : ''}
            {selectedGate.allowed !== null ? ` / allowed ${selectedGate.allowed.toFixed(1)}` : ''}
            <div className="mt-1">{selectedGate.detail}</div>
          </div>
        )}

        <GatePins gates={gates} />
      </Card>

      {failed.length > 0 && (
        <Card title="Open findings" tone="amber" chip={<Chip tone="amber">{failed.length}</Chip>}>
          <ul className="space-y-0.5 font-mono text-[9px] leading-4 text-amber-200/75">
            {failed.slice(0, 5).map((gate, i) => <li key={`${gate.id}-${i}`}>· {gate.detail}</li>)}
          </ul>
        </Card>
      )}

      {acceptance.remainingDefects.length > 0 && (
        <Card title="Remaining defects" tone="rose" chip={<Chip tone="rose">{acceptance.remainingDefects.length}</Chip>}>
          <ul className="space-y-0.5 font-mono text-[9px] leading-4 text-rose-200/75">
            {acceptance.remainingDefects.slice(0, 5).map((defect, i) => <li key={i}>· {defect.detail}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

export const SurveyorsEyePanel: React.FC<{ showTitle?: boolean }> = ({ showTitle = false }) => {
  const snapshot = useSyncExternalStore(
    gimbalVisionStore.subscribe,
    gimbalVisionStore.getSnapshot,
    gimbalVisionStore.getSnapshot,
  );
  const [section, setSection] = useState<Section>('frames');

  const survey = snapshot.survey;
  const inspectionSurvey = snapshot.inspectionSurvey;
  const totalFrames = (survey?.frames.length ?? 0) + (inspectionSurvey?.frames.length ?? 0);
  const acceptance = snapshot.acceptance;
  const roadCount = [snapshot.roadReview, snapshot.mathModel, snapshot.gimbalInspection].filter(Boolean).length;
  const gateCount = acceptance?.verdict.gates.length ?? 0;
  const state = snapshot.isScanning ? 'Scanning' : snapshot.isInspecting ? 'Pass 2' : survey ? 'Ready' : 'Idle';

  const tabs: Array<{ id: Section; label: string; tone: Tone; count?: number }> = [
    { id: 'frames', label: 'Frames', tone: 'cyan', count: totalFrames },
    { id: 'road', label: 'Road', tone: 'violet', count: roadCount || undefined },
    { id: 'qa', label: 'QA', tone: 'emerald', count: snapshot.qa && snapshot.qa.status !== 'unverified' ? 1 : undefined },
    { id: 'gates', label: 'Gates', tone: 'amber', count: gateCount || undefined },
  ];

  return (
    <div data-testid="a2ui-gimbal-vision" className="flex h-full min-h-0 flex-col overflow-hidden bg-[#080e18] text-slate-100">
      <header className="shrink-0 border-b border-white/[0.07] bg-[linear-gradient(105deg,rgba(11,24,36,0.96),rgba(7,14,23,0.90))] px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-400/[0.07] text-cyan-300 shadow-[inset_0_0_18px_rgba(34,211,238,0.07)]">
              <Eye className="h-4 w-4" aria-hidden="true" />
              {snapshot.isScanning && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
              )}
            </span>
            <div className="min-w-0">
              {showTitle && (
                <p className="mb-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                  Surveyors Eye
                </p>
              )}
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${snapshot.isScanning ? 'animate-pulse bg-amber-300' : 'bg-emerald-400'}`} />
                <span data-testid="vision-state" className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-slate-100">{state}</span>
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">/</span>
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">Visual QA</span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.1em] text-slate-500">
                {gateCount > 0 ? `${gateCount} acceptance gate${gateCount === 1 ? '' : 's'}` : 'Awaiting acceptance gates'} · AOI scoped
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Chip tone="cyan">{totalFrames} frame{totalFrames === 1 ? '' : 's'}</Chip>
            {acceptance && <Chip tone={acceptance.verified ? 'emerald' : 'rose'}>{acceptance.verified ? 'Gates pass' : 'Review'}</Chip>}
            {snapshot.isInspecting && <Chip tone="teal">Pass 2</Chip>}
          </div>
        </div>
      </header>

      <nav aria-label="Surveyors Eye sections" className="shrink-0 border-b border-white/[0.06] bg-black/[0.12] px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">View</span>
          {tabs.map(tab => (
            <Chip
              key={tab.id}
              tone={tab.tone}
              active={section === tab.id}
              onClick={() => setSection(tab.id)}
              title={`Open ${tab.label}`}
            >
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className="rounded-full bg-black/25 px-1 text-[8px]">{tab.count}</span>
              )}
            </Chip>
          ))}
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <FrameViewer
          survey={survey}
          inspectionSurvey={inspectionSurvey}
          isScanning={snapshot.isScanning}
          isInspecting={snapshot.isInspecting}
        />
        <div className="space-y-2 p-2.5">
          {section === 'frames' && <FramesSection survey={survey} inspectionSurvey={inspectionSurvey} />}
          {section === 'road' && <RoadSection snapshot={snapshot} />}
          {section === 'qa' && <QaSection snapshot={snapshot} />}
          {section === 'gates' && <GatesSection acceptance={acceptance} />}
        </div>
      </div>
    </div>
  );
};

export default SurveyorsEyePanel;
