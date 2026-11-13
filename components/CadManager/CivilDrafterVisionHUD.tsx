/**
 * CivilDrafterVisionHUD.tsx
 *
 * The "Gimbal Eyes" HUD for the Civil Drafter.
 *
 * Visual states:
 *   SCANNING  – Animated crosshair sweeps over the survey while frames are
 *               captured. Frames appear one by one as thumbnails.
 *   READY     – Full thumbnail film strip with the spatial narrative panel.
 *               Clicking a thumbnail enlarges it in a lightbox.
 *   COLLAPSED – Just a tiny camera badge showing frame count / scan status.
 */

import React, { useState, useEffect, useRef } from 'react';
import type { VisionSurvey, VisionFrame } from '../../utils/civilDrafterVision';
import type { SynthesisQaReport } from '../../utils/synthesisVerification';
import type { RoadTakeReport } from '../../utils/roadTakeReview';
import { formatStation, type GimbalRoadInspection, type RoadMathModel } from '../../utils/gimbalRoadModel';
import type { RoadAcceptanceResult } from '../../utils/roadRetakeLoop';
import type { SurveyLine } from '../../types';

// Warning accents stay cool and distinct from the amber CAD layer palette.
const HUD_WARN = '#FB7185';
const HUD_WARN_SOFT = '#FDA4AF';
const HUD_WARN_BORDER = 'rgba(251,113,133,0.28)';
const HUD_WARN_BG = 'rgba(251,113,133,0.07)';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  isScanning: boolean;
  survey: VisionSurvey | null;
  /** Latest synthesis verification report (Gimbal Vision pass 2). */
  qa?: SynthesisQaReport | null;
  /** Latest imagery-free multi-take road review. */
  roadReview?: RoadTakeReport | null;
  /** First-pass mathematical corridor handed to the redraw. */
  mathModel?: RoadMathModel | null;
  /** Second-gimbal inspection of the redraw against that model. */
  gimbalInspection?: GimbalRoadInspection | null;
  /** Pass-2 frames of the drafted road over the field shots. */
  inspectionSurvey?: VisionSurvey | null;
  /** Pass-1 road draft frames, used as the target side of the diff. */
  targetSurvey?: VisionSurvey | null;
  /** True while the pass-2 draft frames are being captured. */
  isInspecting?: boolean;
  /** Latest full road acceptance run (turn scorecard + defect pins). */
  acceptance?: RoadAcceptanceResult<SurveyLine> | null;
  /** Called on the × button — parent hides the HUD */
  onDismiss?: () => void;
  /** Render inside an A2UI window instead of as a canvas overlay. */
  embedded?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styled keyframes (injected once as a <style> tag)
// ─────────────────────────────────────────────────────────────────────────────

const STYLES = `
@keyframes cdv-pulse {
  0%,100% { opacity:0.55; transform:scale(1);   }
  50%      { opacity:1.00; transform:scale(1.08); }
}
@keyframes cdv-sweep {
  from { transform:rotate(0deg);   }
  to   { transform:rotate(360deg); }
}
@keyframes cdv-fade-in {
  from { opacity:0; transform:translateY(4px); }
  to   { opacity:1; transform:translateY(0);   }
}
@keyframes cdv-scan-line {
  0%   { top:0%;   opacity:0.8; }
  100% { top:100%; opacity:0; }
}
.cdv-pulse    { animation: cdv-pulse  1.8s ease-in-out infinite; }
.cdv-sweep    { animation: cdv-sweep  3.5s linear infinite; transform-origin:center; }
.cdv-fade-in  { animation: cdv-fade-in 0.35s ease-out forwards; }
.cdv-scan-bar { animation: cdv-scan-line 2.2s linear infinite; }
`;

let _stylesInjected = false;
function ensureStyles() {
  if (_stylesInjected) return;
  const el = document.createElement('style');
  el.textContent = STYLES;
  document.head.appendChild(el);
  _stylesInjected = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Animated scanning viewport shown while frames are being captured */
function ScanningView({ frameIndex, totalEstimate }: { frameIndex: number; totalEstimate: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {/* Gimbal lens */}
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        {/* Outer pulsing ring */}
        <div
          className="cdv-pulse"
          style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            border: '2px solid rgba(100,181,246,0.4)',
          }}
        />
        {/* Inner solid circle */}
        <div style={{
          position: 'absolute', inset: 8,
          borderRadius: '50%',
          background: 'rgba(13,17,23,0.95)',
          border: '1.5px solid rgba(100,181,246,0.7)',
          overflow: 'hidden',
        }}>
          {/* Scan bar */}
          <div
            className="cdv-scan-bar"
            style={{
              position: 'absolute', left: 0, right: 0, height: 2,
              background: 'linear-gradient(90deg, transparent, #64B5F6, transparent)',
              pointerEvents: 'none',
            }}
          />
          {/* Crosshair */}
          <svg width="100%" height="100%" viewBox="0 0 104 104" style={{ position: 'absolute', inset: 0 }}>
            <g className="cdv-sweep" style={{ transformOrigin: '52px 52px' }}>
              <line x1="52" y1="10" x2="52" y2="42" stroke="rgba(100,181,246,0.8)" strokeWidth="1.5" />
              <line x1="52" y1="62" x2="52" y2="94" stroke="rgba(100,181,246,0.8)" strokeWidth="1.5" />
              <line x1="10" y1="52" x2="42" y2="52" stroke="rgba(100,181,246,0.8)" strokeWidth="1.5" />
              <line x1="62" y1="52" x2="94" y2="52" stroke="rgba(100,181,246,0.8)" strokeWidth="1.5" />
            </g>
            {/* Centre dot */}
            <circle cx="52" cy="52" r="3" fill="#64B5F6" opacity="0.9" />
            {/* Corner brackets */}
            <path d="M16,16 L16,28 M16,16 L28,16" stroke="#64B5F6" strokeWidth="1.5" fill="none" opacity="0.6" />
            <path d="M88,16 L88,28 M88,16 L76,16" stroke="#64B5F6" strokeWidth="1.5" fill="none" opacity="0.6" />
            <path d="M16,88 L16,76 M16,88 L28,88" stroke="#64B5F6" strokeWidth="1.5" fill="none" opacity="0.6" />
            <path d="M88,88 L88,76 M88,88 L76,88" stroke="#64B5F6" strokeWidth="1.5" fill="none" opacity="0.6" />
          </svg>
        </div>
        {/* Camera icon label */}
        <div style={{
          position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
          fontSize: 14,
        }}>📡</div>
      </div>

      {/* Status text */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#64B5F6', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.06em' }}>
          VISUAL SURVEY
        </div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontFamily: 'monospace', marginTop: 3 }}>
          Frame {frameIndex} / ~{totalEstimate}
        </div>
      </div>

      {/* Scanning dots */}
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: totalEstimate }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i < frameIndex ? '#64B5F6' : 'rgba(100,181,246,0.22)',
              transition: 'background 0.3s',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Single thumbnail card in the film strip */
function ThumbCard({ frame, index, onClick }: { frame: VisionFrame; index: number; onClick: () => void }) {
  return (
    <button
      className="cdv-fade-in"
      onClick={onClick}
      title={frame.description}
      style={{
        flexShrink: 0,
        width: 104, height: 78,
        border: '1px solid rgba(100,181,246,0.3)',
        borderRadius: 5,
        overflow: 'hidden',
        background: '#0d1117',
        cursor: 'pointer',
        padding: 0,
        position: 'relative',
        animationDelay: `${index * 0.06}s`,
        transition: 'border-color 0.2s, transform 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(100,181,246,0.8)';
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(100,181,246,0.3)';
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
      }}
    >
      <img
        src={`data:image/png;base64,${frame.base64}`}
        alt={frame.label}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {/* Label overlay */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.80))',
        padding: '12px 4px 2px',
        fontSize: 8, fontFamily: 'monospace', color: '#64B5F6',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {frame.label.split('|')[1]?.trim() ?? frame.label}
      </div>
      {/* Zoom badge */}
      {frame.zoomLevel > 1.5 && (
        <div style={{
          position: 'absolute', top: 3, right: 3,
          background: 'rgba(100,181,246,0.8)',
          color: '#0d1117', borderRadius: 3,
          fontSize: 8, fontWeight: 700, fontFamily: 'monospace',
          padding: '1px 3px',
        }}>
          {frame.zoomLevel.toFixed(0)}×
        </div>
      )}
    </button>
  );
}

interface CarouselState {
  frames: VisionFrame[];
  index: number;
}

/**
 * Three-up frame carousel. The frames stay flat and equally sized; the active
 * frame is highlighted and the arrows slide the window one frame at a time.
 */
function FrameCarousel({ frames, initialIndex, onClose }: {
  frames: VisionFrame[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(0, frames.length - 1)));
  const [triple, setTriple] = useState(false);

  const step = (delta: number) => {
    setIndex(current => Math.max(0, Math.min(frames.length - 1, current + delta)));
    setTriple(true);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frames.length, onClose]);

  if (frames.length === 0) return null;
  const visibleCount = Math.min(3, frames.length);
  const start = Math.max(0, Math.min(index - 1, frames.length - visibleCount));
  const current = frames[index];
  const visible = triple
    ? frames.slice(start, start + visibleCount).map((frame, offset) => ({ frame, frameIndex: start + offset }))
    : [{ frame: current, frameIndex: index }];

  return (
    <div
      data-testid="vision-carousel"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        background: 'rgba(2,6,15,0.90)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12, overflow: 'hidden',
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(96vw, 1180px)',
          maxHeight: 'calc(100dvh - 24px)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', borderRadius: 10,
          border: '1px solid rgba(56,189,248,0.42)',
          background: 'rgba(6,13,24,0.98)',
          boxShadow: '0 0 0 1px rgba(56,189,248,0.12), 0 0 42px rgba(56,189,248,0.22), 0 30px 90px rgba(0,0,0,0.70)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '7px 10px', borderBottom: '1px solid rgba(56,189,248,0.16)',
          background: 'rgba(56,189,248,0.06)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#7DD3FC', fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em' }}>
              SURVEYORS EYE · FRAME CAROUSEL
            </div>
            <div style={{ marginTop: 2, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {current.label}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close frame carousel"
            style={{
              flexShrink: 0, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 5, color: 'rgba(255,255,255,0.65)', cursor: 'pointer', padding: '3px 8px',
              fontFamily: 'monospace', fontSize: 10,
            }}
          >
            CLOSE ✕
          </button>
        </div>

        <div
          data-testid="vision-carousel-track"
          data-view={triple ? 'triple' : 'single'}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
            gap: 8, padding: 10, minHeight: 0,
          }}
        >
          {visible.map(({ frame, frameIndex }) => {
            const active = frameIndex === index;
            return (
              <button
                key={`${frameIndex}-${frame.label}`}
                type="button"
                onClick={() => {
                  setIndex(frameIndex);
                  setTriple(false);
                }}
                aria-label={`Select frame ${frameIndex + 1}`}
                aria-current={active ? 'true' : undefined}
                title={frame.description}
                style={{
                  padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
                  borderRadius: 6,
                  border: active ? '1px solid rgba(125,211,252,0.90)' : '1px solid rgba(100,181,246,0.22)',
                  background: '#050b14',
                  boxShadow: active ? '0 0 20px rgba(56,189,248,0.22)' : 'none',
                }}
              >
                <img
                  src={`data:image/png;base64,${frame.base64}`}
                  alt={frame.label}
                  style={{
                    display: 'block', width: '100%',
                    height: triple ? 'min(54vh, 520px)' : 'min(72vh, 760px)',
                    objectFit: 'contain', background: '#050b14', opacity: active ? 1 : 0.72,
                  }}
                />
                <div style={{
                  padding: '4px 6px 5px', fontFamily: 'monospace', fontSize: 8.5,
                  color: active ? '#BAE6FD' : 'rgba(255,255,255,0.45)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {frameIndex + 1}. {frame.label.split('|')[1]?.trim() ?? frame.label}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '0 10px 9px',
        }}>
          <button
            type="button"
            data-testid="vision-carousel-prev"
            disabled={index === 0}
            onClick={() => step(-1)}
            style={{
              padding: '4px 12px', borderRadius: 5, border: '1px solid rgba(56,189,248,0.35)',
              background: 'rgba(56,189,248,0.08)', color: index === 0 ? 'rgba(255,255,255,0.25)' : '#7DD3FC',
              cursor: index === 0 ? 'default' : 'pointer', fontFamily: 'monospace', fontSize: 10,
            }}
          >
            ← PREV
          </button>
          <span style={{ color: triple ? '#7DD3FC' : 'rgba(255,255,255,0.38)', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.05em' }}>
            {triple ? 'TRIPLE' : 'FULL SIZE'}
          </span>
          <span style={{ minWidth: 120, textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontSize: 10 }}>
            FRAME {index + 1} / {frames.length}
          </span>
          <button
            type="button"
            data-testid="vision-carousel-next"
            disabled={index === frames.length - 1}
            onClick={() => step(1)}
            style={{
              padding: '4px 12px', borderRadius: 5, border: '1px solid rgba(56,189,248,0.35)',
              background: 'rgba(56,189,248,0.08)', color: index === frames.length - 1 ? 'rgba(255,255,255,0.25)' : '#7DD3FC',
              cursor: index === frames.length - 1 ? 'default' : 'pointer', fontFamily: 'monospace', fontSize: 10,
            }}
          >
            NEXT →
          </button>
        </div>

        <div style={{
          borderTop: '1px solid rgba(56,189,248,0.12)', padding: '6px 10px 8px',
          color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontSize: 9,
          lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {current.description}
          <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.30)' }}>
            {triple ? 'Select a frame to return to full size · ← / → to scroll' : 'Use PREV / NEXT to open the three-up strip'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const CivilDrafterVisionHUD: React.FC<Props> = ({ isScanning, survey, qa, roadReview, mathModel, gimbalInspection, inspectionSurvey, targetSurvey, isInspecting = false, acceptance, onDismiss, embedded = false }) => {
  ensureStyles();

  const [collapsed, setCollapsed]         = useState(false);
  const [carousel, setCarousel]           = useState<CarouselState | null>(null);
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const [visibleFrameCount, setVisibleFrameCount] = useState(0);
  const [selectedGateKey, setSelectedGateKey] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  // Animate frames appearing one by one after scan completes
  useEffect(() => {
    if (!survey) { setVisibleFrameCount(0); return; }
    setVisibleFrameCount(0);
    const total = survey.frames.length;
    let i = 0;
    const tick = () => {
      i++;
      setVisibleFrameCount(i);
      if (i < total) setTimeout(tick, 70);
    };
    setTimeout(tick, 100);
  }, [survey]);

  // Auto-scroll film strip to right as frames appear
  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollLeft = stripRef.current.scrollWidth;
    }
  }, [visibleFrameCount]);

  const totalEstimate = survey ? survey.frames.length : 8;

  const acceptanceGates = acceptance?.verdict.gates ?? [];
  const failedAcceptanceGates = acceptanceGates.filter(gate => gate.applicable && !gate.passed);
  const pinnedGates = failedAcceptanceGates.filter(gate => Boolean(gate.at));
  const pinBounds = pinnedGates.length > 0
    ? {
        minE: Math.min(...pinnedGates.map(gate => gate.at!.easting)),
        maxE: Math.max(...pinnedGates.map(gate => gate.at!.easting)),
        minN: Math.min(...pinnedGates.map(gate => gate.at!.northing)),
        maxN: Math.max(...pinnedGates.map(gate => gate.at!.northing)),
      }
    : null;
  const selectedGate = acceptanceGates.find((gate, index) => `${gate.id}-${index}` === selectedGateKey) ?? null;
  const diffTargetFrame = targetSurvey?.frames[0] ?? survey?.frames[0] ?? null;
  const diffCurrentFrame = inspectionSurvey?.frames[0] ?? null;
  const canDiff = Boolean(diffTargetFrame && diffCurrentFrame);

  // ── Collapsed badge ─────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Open Vision HUD"
        style={{
          position: embedded ? 'relative' : 'absolute', top: embedded ? undefined : 10, right: embedded ? undefined : 10, zIndex: embedded ? undefined : 120,
          width: embedded ? '100%' : undefined,
          background: 'rgba(13,17,23,0.92)',
          border: '1px solid rgba(100,181,246,0.4)',
          borderRadius: 20,
          padding: '5px 10px',
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer', color: '#64B5F6',
          fontFamily: 'monospace', fontSize: 11,
          backdropFilter: 'blur(8px)',
        }}
      >
        <span style={{ fontSize: 14 }}>📡</span>
        {isScanning
          ? <span className="cdv-pulse" style={{ display: 'inline-block' }}>SCANNING…</span>
          : <span>{survey?.frames.length ?? 0} frames</span>
        }
      </button>
    );
  }

  // ── Expanded panel ──────────────────────────────────────────────────────────
  return (
    <>
      {carousel && (
        <FrameCarousel
          frames={carousel.frames}
          initialIndex={carousel.index}
          onClose={() => setCarousel(null)}
        />
      )}

      <div
        data-testid="surveyors-eye-panel"
        style={{
          position: embedded ? 'relative' : 'absolute', top: embedded ? undefined : 8, right: embedded ? undefined : 8, zIndex: embedded ? undefined : 110,
          width: embedded ? '100%' : isScanning ? 200 : 'min(98vw, 560px)',
          minHeight: 0,
          maxHeight: embedded ? '100%' : 'calc(100dvh - 24px)',
          background: embedded ? 'transparent' : 'rgba(10,15,28,0.94)',
          border: embedded ? 'none' : '1px solid rgba(100,181,246,0.28)',
          borderRadius: embedded ? 0 : 10,
          backdropFilter: embedded ? undefined : 'blur(14px)',
          boxShadow: embedded
            ? 'inset 0 0 30px rgba(56,189,248,0.055), inset 0 1px 0 rgba(125,211,252,0.12)'
            : '0 4px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(100,181,246,0.08)',
          overflow: 'hidden',
          transition: 'width 0.35s ease',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: embedded ? '4px 8px' : '7px 10px',
          borderBottom: '1px solid rgba(100,181,246,0.12)',
          background: 'rgba(100,181,246,0.045)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 11 }}>📡</span>
            <span style={{
              color: '#64B5F6', fontFamily: 'monospace', fontSize: embedded ? 10 : 11,
              fontWeight: 700, letterSpacing: '0.07em',
            }}>
              {isScanning ? 'VISUAL SURVEY · SCANNING' : `SURVEYORS EYE · ${(survey?.frames.length ?? 0) + (inspectionSurvey?.frames.length ?? 0)} FRAMES`}
            </span>
            {isScanning && (
              <div
                className="cdv-pulse"
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#64B5F6', display: 'inline-block',
                }}
              />
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {!isScanning && survey && (
              <button
                onClick={() => setNarrativeOpen(o => !o)}
                title="Toggle spatial narrative"
                style={{
                  background: 'transparent', border: '1px solid rgba(100,181,246,0.3)',
                  borderRadius: 4, padding: '1px 6px',
                  color: '#64B5F6', fontFamily: 'monospace', fontSize: 10, cursor: 'pointer',
                }}
              >
                {narrativeOpen ? '▲ NARRATIVE' : '▼ NARRATIVE'}
              </button>
            )}
            {!embedded && (
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse HUD"
                style={{
                  background: 'transparent', border: '1px solid rgba(100,181,246,0.2)',
                  borderRadius: 4, padding: '1px 5px',
                  color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 11,
                }}
              >−</button>
            )}
            {!embedded && onDismiss && (
              <button
                onClick={onDismiss}
                title="Dismiss Vision HUD"
                style={{
                  background: 'transparent', border: '1px solid rgba(255,100,100,0.25)',
                  borderRadius: 4, padding: '1px 5px',
                  color: 'rgba(255,120,120,0.7)', cursor: 'pointer', fontSize: 11,
                }}
              >✕</button>
            )}
          </div>
        </div>

        {/* ── Scanning state ──────────────────────────────────────────────────── */}
        {isScanning && (
          <div style={{ padding: '16px 8px', display: 'flex', justifyContent: 'center' }}>
            <ScanningView frameIndex={visibleFrameCount} totalEstimate={totalEstimate} />
          </div>
        )}

        {/* ── Road acceptance scorecard + defect pins ─────────────────────── */}
        {!isScanning && acceptance && (
          <div
            data-testid="road-acceptance"
            style={{
              borderTop: acceptance.verified
                ? '1px solid rgba(52,211,153,0.22)'
                : `1px solid ${HUD_WARN_BORDER}`,
              background: acceptance.verified ? 'rgba(52,211,153,0.055)' : HUD_WARN_BG,
              padding: '8px 10px 9px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#A78BFA', fontFamily: 'monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
                ROAD ACCEPTANCE
              </span>
              <span style={{
                color: acceptance.verified ? '#34D399' : HUD_WARN,
                fontFamily: 'monospace', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em',
              }}>
                {acceptance.verified ? 'ACCEPTED · GATES PASS' : 'COMMITTED · UNVERIFIED'}
              </span>
            </div>
            <div style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 9.5, color: 'rgba(255,255,255,0.60)' }}>
              TURN {acceptance.turnsUsed}/8 · {acceptance.verdict.passedCount}/{acceptance.verdict.applicableCount} GATES · BEST {acceptance.verdict.score}%
            </div>
            <div style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
              {acceptance.verdict.coveragePct.toFixed(0)}% coverage ·{' '}
              {acceptance.verdict.widthDriftFt !== null ? `${acceptance.verdict.widthDriftFt.toFixed(1)} ft width drift` : 'width unchanged'} ·{' '}
              {acceptance.verdict.shotRecallPct.toFixed(0)}% shot grounding
              {acceptance.widthDecision && ` · width ${acceptance.widthDecision.replace('_', ' ')}`}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                data-testid="road-acceptance-diff-toggle"
                disabled={!canDiff}
                onClick={() => setShowDiff(value => !value)}
                title={canDiff ? 'Compare the pass-1 target with the current drafted frame' : 'Diff needs both a pass-1 and a current frame'}
                style={{
                  background: showDiff ? 'rgba(100,181,246,0.20)' : 'transparent',
                  border: '1px solid rgba(100,181,246,0.36)',
                  borderRadius: 3,
                  padding: '2px 6px',
                  color: canDiff ? '#93C5FD' : 'rgba(255,255,255,0.25)',
                  fontFamily: 'monospace',
                  fontSize: 8.5,
                  cursor: canDiff ? 'pointer' : 'default',
                }}
              >
                {showDiff ? 'HIDE TARGET / CURRENT' : 'TARGET / CURRENT DIFF'}
              </button>
            </div>

            {showDiff && diffTargetFrame && diffCurrentFrame && (
              <div
                data-testid="road-acceptance-diff"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 5 }}
              >
                <figure style={{ margin: 0 }}>
                  <img
                    src={`data:image/png;base64,${diffTargetFrame.base64}`}
                    alt="Pass-1 target frame"
                    onClick={() => setCarousel({ frames: [diffTargetFrame, diffCurrentFrame], index: 0 })}
                    style={{ width: '100%', height: 82, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(167,139,250,0.35)', cursor: 'zoom-in' }}
                  />
                  <figcaption style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 8, color: '#A78BFA' }}>
                    PASS 1 · TARGET
                  </figcaption>
                </figure>
                <figure style={{ margin: 0 }}>
                  <img
                    src={`data:image/png;base64,${diffCurrentFrame.base64}`}
                    alt="Current drafted frame"
                    onClick={() => setCarousel({ frames: [diffTargetFrame, diffCurrentFrame], index: 1 })}
                    style={{ width: '100%', height: 82, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(251,113,133,0.35)', cursor: 'zoom-in' }}
                  />
                  <figcaption style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 8, color: HUD_WARN_SOFT }}>
                    CURRENT · dashed magenta = target
                  </figcaption>
                </figure>
              </div>
            )}

            <table style={{ width: '100%', marginTop: 6, borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 8.5 }}>
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.38)', textAlign: 'left' }}>
                  <th style={{ fontWeight: 500, padding: '1px 3px' }}>TURN</th>
                  <th style={{ fontWeight: 500, padding: '1px 3px' }}>SOURCE</th>
                  <th style={{ fontWeight: 500, padding: '1px 3px' }}>GATES</th>
                  <th style={{ fontWeight: 500, padding: '1px 3px' }}>SCORE</th>
                  <th style={{ fontWeight: 500, padding: '1px 3px' }}>COV</th>
                  <th style={{ fontWeight: 500, padding: '1px 3px' }}>WIDTH</th>
                  <th style={{ fontWeight: 500, padding: '1px 3px' }}>VERDICT</th>
                </tr>
              </thead>
              <tbody>
                {acceptance.turns.map(turn => (
                  <tr key={turn.turn} style={{ color: 'rgba(255,255,255,0.60)' }}>
                    <td style={{ padding: '1px 3px' }}>{turn.turn}</td>
                    <td style={{ padding: '1px 3px' }}>{turn.source === 'confirmation' ? 'CONFIRM' : turn.source.toUpperCase()}</td>
                    <td style={{ padding: '1px 3px' }}>{turn.gatesPassed}/{turn.gatesApplicable}</td>
                    <td style={{ padding: '1px 3px' }}>{turn.score}</td>
                    <td style={{ padding: '1px 3px' }}>{turn.coveragePct.toFixed(0)}%</td>
                    <td style={{ padding: '1px 3px' }}>{turn.widthDriftFt !== null ? `${turn.widthDriftFt.toFixed(1)}` : '—'}</td>
                    <td style={{
                      padding: '1px 3px',
                      color: turn.verdict === 'pass' ? '#34D399' : turn.verdict === 'no_geometry' ? 'rgba(255,255,255,0.30)' : HUD_WARN_SOFT,
                    }}>
                      {turn.verdict === 'pass' ? 'PASS' : turn.verdict === 'no_geometry' ? 'NO GEOMETRY' : 'REJECT'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {acceptanceGates.map((gate, index) => {
                const key = `${gate.id}-${index}`;
                const color = !gate.applicable
                  ? 'rgba(255,255,255,0.25)'
                  : gate.passed ? '#34D399' : gate.severity === 'red' ? HUD_WARN : '#FBBF24';
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedGateKey(selectedGateKey === key ? null : key)}
                    title={gate.detail}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${color}`,
                      borderRadius: 3,
                      padding: '1px 4px',
                      color,
                      fontFamily: 'monospace',
                      fontSize: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {gate.applicable ? (gate.passed ? '✓' : '✕') : '–'} {gate.id}
                  </button>
                );
              })}
            </div>

            {pinnedGates.length > 0 && pinBounds && (
              <svg
                viewBox="0 0 100 78"
                role="img"
                aria-label="Road acceptance defect pins"
                style={{ display: 'block', width: '100%', height: 92, marginTop: 6, background: 'rgba(3,7,18,0.55)', borderRadius: 5, border: '1px solid rgba(167,139,250,0.20)' }}
              >
                {[20, 40, 60, 80].map(x => (
                  <line key={`v${x}`} x1={x} y1={6} x2={x} y2={72} stroke="rgba(167,139,250,0.10)" strokeWidth={0.3} />
                ))}
                {[20, 40, 60].map(y => (
                  <line key={`h${y}`} x1={6} y1={y} x2={94} y2={y} stroke="rgba(167,139,250,0.10)" strokeWidth={0.3} />
                ))}
                {pinnedGates.map((gate, index) => {
                  const eSpan = Math.max(1, pinBounds.maxE - pinBounds.minE);
                  const nSpan = Math.max(1, pinBounds.maxN - pinBounds.minN);
                  const px = 6 + ((gate.at!.easting - pinBounds.minE) / eSpan) * 88;
                  const py = 72 - ((gate.at!.northing - pinBounds.minN) / nSpan) * 60;
                  const color = gate.severity === 'red' ? HUD_WARN : '#FBBF24';
                  const key = `${gate.id}-${acceptanceGates.indexOf(gate)}`;
                  return (
                    <g key={key} onClick={() => setSelectedGateKey(key)} style={{ cursor: 'pointer' }}>
                      <circle cx={px} cy={py} r={4.2} fill="rgba(3,7,18,0.9)" stroke={color} strokeWidth={1.2} />
                      <circle cx={px} cy={py} r={1.4} fill={color} />
                      <text x={px + 5.2} y={py + 2} fontSize={4.6} fill={color} fontFamily="monospace">
                        {gate.id}{index + 1}
                      </text>
                      <title>{`${gate.id}${gate.stationFt !== null ? ` at ${formatStation(gate.stationFt)}` : ''}: ${gate.detail}`}</title>
                    </g>
                  );
                })}
              </svg>
            )}

            {selectedGate && (
              <div style={{
                marginTop: 6, paddingTop: 5,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'monospace', fontSize: 9, lineHeight: 1.5,
                color: selectedGate.passed ? 'rgba(255,255,255,0.55)' : HUD_WARN_SOFT,
              }}>
                {selectedGate.id.toUpperCase()}{selectedGate.stationFt !== null ? ` · ${formatStation(selectedGate.stationFt)}` : ''}
                {selectedGate.measured !== null ? ` · measured ${selectedGate.measured.toFixed(1)}` : ''}
                {selectedGate.allowed !== null ? ` / allowed ${selectedGate.allowed.toFixed(1)}` : ''}
                <div style={{ marginTop: 2 }}>{selectedGate.detail}</div>
              </div>
            )}

            {!acceptance.verified && acceptance.remainingDefects.length > 0 && (
              <ul style={{
                margin: '6px 0 0', padding: '0 0 0 14px',
                fontFamily: 'monospace', fontSize: 9, color: HUD_WARN_SOFT, lineHeight: 1.5,
              }}>
                {acceptance.remainingDefects.slice(0, 3).map((defect, index) => (
                  <li key={index}>{defect.detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Ready state: film strip ─────────────────────────────────────────── */}
        {/* ── Synthesis QA (Gimbal Vision pass 2) ─────────────────────────── */}
        {!isScanning && qa && qa.status !== 'unverified' && (
          <div style={{
            borderTop: '1px solid rgba(52,211,153,0.20)',
            background: 'rgba(52,211,153,0.06)',
            padding: '8px 10px 9px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'monospace', fontSize: 10,
            }}>
              <span style={{ color: '#34D399', fontWeight: 700, letterSpacing: '0.06em' }}>
                SYNTHESIS QA
              </span>
              <span style={{ color: qa.status === 'corrected' ? '#34D399' : 'rgba(255,255,255,0.55)' }}>
                {qa.scoreBefore}% → {qa.scoreAfter}%
              </span>
            </div>
            <div style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 9.5, color: 'rgba(255,255,255,0.60)' }}>
              {qa.status === 'corrected'
                ? `${qa.defectsCorrected} of ${qa.defectsFound} defect${qa.defectsFound === 1 ? '' : 's'} corrected on image evidence`
                : `Image-truth verified · ${qa.featuresAudited} feature${qa.featuresAudited === 1 ? '' : 's'}`}
            </div>
            {qa.repairs.length > 0 && (
              <ul style={{
                margin: '5px 0 0', padding: '0 0 0 14px',
                fontFamily: 'monospace', fontSize: 9,
                color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
              }}>
                {qa.repairs.slice(0, 3).map((repair, i) => <li key={i}>{repair}</li>)}
              </ul>
            )}
            {qa.overlayDataUrl && (
              <img
                src={qa.overlayDataUrl}
                alt="Synthesis QA — red drafted, green corrected"
                style={{
                  display: 'block', width: '100%', marginTop: 7,
                  borderRadius: 5, border: '1px solid rgba(52,211,153,0.25)',
                }}
              />
            )}
          </div>
        )}

        {/* ── Road take review (imagery-free civil-sense pass) ──────────── */}
        {!isScanning && roadReview && roadReview.featuresAudited > 0 && (
          <div style={{
            borderTop: roadReview.status === 'needs_retake'
              ? `1px solid ${HUD_WARN_BORDER}`
              : '1px solid rgba(100,181,246,0.20)',
            background: roadReview.status === 'needs_retake'
              ? HUD_WARN_BG
              : 'rgba(100,181,246,0.05)',
            padding: '8px 10px 9px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'monospace', fontSize: 10,
            }}>
              <span style={{
                color: roadReview.status === 'needs_retake' ? HUD_WARN : '#64B5F6',
                fontWeight: 700, letterSpacing: '0.06em',
              }}>
                ROAD TAKE REVIEW
              </span>
              <span style={{ color: roadReview.status === 'needs_retake' ? HUD_WARN_SOFT : 'rgba(255,255,255,0.60)' }}>
                {roadReview.scoreBefore}% → {roadReview.scoreAfter}%
              </span>
            </div>
            <div style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 9.5, color: 'rgba(255,255,255,0.60)' }}>
              {roadReview.takes} take{roadReview.takes === 1 ? '' : 's'} · {roadReview.featuresAudited} corridor line{roadReview.featuresAudited === 1 ? '' : 's'} ·{' '}
              {roadReview.status === 'clean'
                ? 'clean take'
                : roadReview.status === 'corrected'
                  ? `${roadReview.repairs.length} repair${roadReview.repairs.length === 1 ? '' : 's'} accepted`
                  : 'another take required'}
            </div>
            <div style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.38)' }}>
              Grounded on {roadReview.grounding.osmWays} OSM way{roadReview.grounding.osmWays === 1 ? '' : 's'} ·{' '}
              {roadReview.grounding.parcelSegments} parcel line{roadReview.grounding.parcelSegments === 1 ? '' : 's'}
              {roadReview.inferredFromGeometry ? ' · layer inferred from geometry' : ''}
            </div>
            {roadReview.repairs.length > 0 && (
              <ul style={{
                margin: '5px 0 0', padding: '0 0 0 14px',
                fontFamily: 'monospace', fontSize: 9,
                color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
              }}>
                {roadReview.repairs.slice(0, 3).map((repair, i) => <li key={i}>{repair}</li>)}
              </ul>
            )}
            {roadReview.remaining.length > 0 && (
              <ul style={{
                margin: '5px 0 0', padding: '0 0 0 14px',
                fontFamily: 'monospace', fontSize: 9,
                color: HUD_WARN_SOFT, lineHeight: 1.5,
              }}>
                {roadReview.remaining.slice(0, 3).map((defect, i) => <li key={i}>{defect}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* ── Gimbal math model + second inspection ─────────────────────── */}
        {!isScanning && mathModel && mathModel.corridors.length > 0 && (
          <div style={{
            borderTop: '1px solid rgba(167,139,250,0.22)',
            background: 'rgba(167,139,250,0.055)',
            padding: '8px 10px 9px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'monospace', fontSize: 10,
            }}>
              <span style={{ color: '#A78BFA', fontWeight: 700, letterSpacing: '0.06em' }}>
                SURVEYORS EYE MATH MODEL
              </span>
              <span style={{ color: 'rgba(255,255,255,0.60)' }}>
                {mathModel.corridors.length} corridor{mathModel.corridors.length === 1 ? '' : 's'} · {mathModel.sections} sections
              </span>
            </div>
            <div style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 9.5, color: 'rgba(255,255,255,0.60)' }}>
              Pass-1 target: {mathModel.totalLengthFt.toFixed(0)} ft ·{' '}
              {mathModel.widthFt !== null ? `${mathModel.widthFt.toFixed(1)} ft typical width` : 'width not measurable'}
              {mathModel.parcelGapRoads ? ` · ${mathModel.parcelGapRoads} parcel-gap corridor${mathModel.parcelGapRoads === 1 ? '' : 's'}` : ''}
              {mathModel.intersections?.length ? ` · ${mathModel.intersections.length} intersection${mathModel.intersections.length === 1 ? '' : 's'}` : ''}
              {mathModel.corridors.map(corridor =>
                ` · ${corridor.id} ${corridor.source === 'parcel_gap' ? 'GAP ' : ''}${formatStation(corridor.stationStartFt)}→${formatStation(corridor.stationEndFt)}`,
              ).join('')}
            </div>
            {(mathModel.intersections?.length ?? 0) > 0 && (
              <div style={{ marginTop: 6, borderTop: '1px solid rgba(167,139,250,0.16)', paddingTop: 6 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#C4B5FD', fontWeight: 700, letterSpacing: '0.05em' }}>
                  INTERSECTION TARGETS
                </div>
                {mathModel.intersections!.slice(0, 6).map(node => (
                  <div key={node.id} style={{
                    marginTop: 3, fontFamily: 'monospace', fontSize: 9,
                    color: 'rgba(255,255,255,0.60)', lineHeight: 1.45,
                  }}>
                    <span style={{ color: '#F0ABFC' }}>{node.id}</span>{' '}
                    {node.kind.toUpperCase()} · {node.angleDeg.toFixed(0)}° · {node.arms.length} arms ·{' '}
                    E {node.at.easting.toFixed(1)} / N {node.at.northing.toFixed(1)}
                  </div>
                ))}
                {(mathModel.intersections?.length ?? 0) > 6 && (
                  <div style={{ fontFamily: 'monospace', fontSize: 8.5, color: 'rgba(255,255,255,0.35)' }}>
                    +{mathModel.intersections!.length - 6} more in the math brief
                  </div>
                )}
              </div>
            )}
            {gimbalInspection && (
              <div style={{ marginTop: 6, borderTop: '1px solid rgba(167,139,250,0.16)', paddingTop: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: 'monospace', fontSize: 9.5,
                }}>
                  <span style={{
                    color: gimbalInspection.acceptable ? '#34D399' : HUD_WARN,
                    fontWeight: 700, letterSpacing: '0.05em',
                  }}>
                    {gimbalInspection.acceptable ? 'SECOND INSPECTION · PASS' : 'SECOND INSPECTION · ISSUES'}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{gimbalInspection.score}%</span>
                </div>
                <div style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
                  {gimbalInspection.coveragePct.toFixed(0)}% station coverage ·{' '}
                  {gimbalInspection.widthDriftFt !== null ? `${gimbalInspection.widthDriftFt.toFixed(1)} ft width drift` : 'width unchanged'}
                </div>
                {gimbalInspection.defects.length > 0 && (
                  <ul style={{
                    margin: '5px 0 0', padding: '0 0 0 14px',
                    fontFamily: 'monospace', fontSize: 9,
                    color: HUD_WARN_SOFT, lineHeight: 1.5,
                  }}>
                    {gimbalInspection.defects.slice(0, 3).map((defect, i) => <li key={i}>{defect}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Pass 2: the drawn road, over the field shots ─────────────── */}
        {!isScanning && (isInspecting || (inspectionSurvey?.frames.length ?? 0) > 0) && (
          <div style={{
            borderTop: '1px solid rgba(34,211,238,0.22)',
            background: 'rgba(34,211,238,0.05)',
            padding: '8px 10px 9px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'monospace', fontSize: 10,
            }}>
              <span style={{ color: '#22D3EE', fontWeight: 700, letterSpacing: '0.06em' }}>
                PASS 2 · DRAFT INSPECTION
              </span>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                {isInspecting ? 'CAPTURING…' : `${inspectionSurvey?.frames.length ?? 0} frames`}
              </span>
            </div>
            <div style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 9.5, color: 'rgba(255,255,255,0.55)' }}>
              {isInspecting && !inspectionSurvey
                ? 'Capturing the drawn road over the field shots…'
                : 'The drawn road over the field shots — click a frame to enlarge.'}
            </div>
            {inspectionSurvey && inspectionSurvey.frames.length > 0 && (
              <div style={{
                display: 'flex', gap: 8, marginTop: 7,
                overflowX: 'auto', overflowY: 'hidden',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(34,211,238,0.3) transparent',
              }}>
                {inspectionSurvey.frames.map((frame, i) => (
                  <ThumbCard
                    key={i}
                    frame={frame}
                    index={i}
                    onClick={() => setCarousel({ frames: inspectionSurvey.frames, index: i })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!isScanning && survey && survey.frames.length > 0 && (
          <>
            {/* Film strip */}
            <div
              ref={stripRef}
              style={{
                display: 'flex', gap: 6, padding: 7,
                overflowX: 'auto', overflowY: 'hidden',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(100,181,246,0.3) transparent',
              }}
            >
              {survey.frames.slice(0, visibleFrameCount).map((frame, i) => (
                <ThumbCard
                  key={i}
                  frame={frame}
                  index={i}
                  onClick={() => setCarousel({ frames: survey.frames, index: i })}
                />
              ))}
            </div>

            {/* Stats bar */}
            <div style={{
              display: 'flex', gap: 9, padding: '3px 8px 5px',
              borderTop: '1px solid rgba(100,181,246,0.10)', flexWrap: 'wrap',
            }}>
              {[
                { label: 'PTS',    value: survey.totalPoints },
                { label: 'LINES',  value: survey.totalLines },
                { label: 'SPAN E', value: `${survey.surveyExtentFt.width.toFixed(0)}ft` },
                { label: 'SPAN N', value: `${survey.surveyExtentFt.height.toFixed(0)}ft` },
              ].map(s => (
                <div key={s.label} style={{ fontFamily: 'monospace', fontSize: 9 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label} </span>
                  <span style={{ color: '#64B5F6', fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
                3-up carousel · click any frame
              </div>
            </div>

            {/* Spatial narrative (collapsible) */}
            {narrativeOpen && (
              <div style={{
                borderTop: '1px solid rgba(100,181,246,0.12)',
                padding: '6px 8px',
                maxHeight: 112, overflowY: 'auto',
                scrollbarWidth: 'thin',
              }}>
                <pre style={{
                  margin: 0, fontFamily: 'monospace', fontSize: 9.5,
                  color: 'rgba(255,255,255,0.65)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55,
                }}>
                  {survey.spatialNarrative}
                </pre>
              </div>
            )}
          </>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────────── */}
        {!isScanning && (!survey || survey.frames.length === 0) && !isInspecting && (inspectionSurvey?.frames.length ?? 0) === 0 && (
          <div style={{
            padding: '14px 10px', textAlign: 'center',
            color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: 11,
          }}>
            Vision survey runs automatically on your next draw request.
          </div>
        )}
      </div>
    </>
  );
};

export default CivilDrafterVisionHUD;
