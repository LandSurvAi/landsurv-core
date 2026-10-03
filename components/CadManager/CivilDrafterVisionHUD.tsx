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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  isScanning: boolean;
  survey: VisionSurvey | null;
  /** Called on the × button — parent hides the HUD */
  onDismiss?: () => void;
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
        width: 130, height: 98,
        border: '1px solid rgba(100,181,246,0.3)',
        borderRadius: 6,
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
        padding: '14px 4px 3px',
        fontSize: 9, fontFamily: 'monospace', color: '#64B5F6',
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

/** Full-screen lightbox for an enlarged frame */
function Lightbox({ frame, onClose }: { frame: VisionFrame; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: 24,
      }}
    >
      <img
        src={`data:image/png;base64,${frame.base64}`}
        alt={frame.label}
        style={{ maxWidth: '90vw', maxHeight: '78vh', borderRadius: 8, border: '1px solid rgba(100,181,246,0.4)' }}
        onClick={e => e.stopPropagation()}
      />
      <div style={{ color: '#64B5F6', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', maxWidth: 700 }}>
        {frame.description}
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop: 4, padding: '6px 20px',
          background: 'rgba(100,181,246,0.15)', border: '1px solid rgba(100,181,246,0.4)',
          borderRadius: 6, color: '#64B5F6', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
        }}
      >
        CLOSE  ✕
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const CivilDrafterVisionHUD: React.FC<Props> = ({ isScanning, survey, onDismiss }) => {
  ensureStyles();

  const [collapsed, setCollapsed]         = useState(false);
  const [lightboxFrame, setLightboxFrame] = useState<VisionFrame | null>(null);
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const [visibleFrameCount, setVisibleFrameCount] = useState(0);
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

  // ── Collapsed badge ─────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Open Vision HUD"
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 120,
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
      {lightboxFrame && (
        <Lightbox frame={lightboxFrame} onClose={() => setLightboxFrame(null)} />
      )}

      <div
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 110,
          width: isScanning ? 200 : 'min(98vw, 560px)',
          background: 'rgba(10,15,28,0.94)',
          border: '1px solid rgba(100,181,246,0.28)',
          borderRadius: 10,
          backdropFilter: 'blur(14px)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(100,181,246,0.08)',
          overflow: 'hidden',
          transition: 'width 0.35s ease',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px',
          borderBottom: '1px solid rgba(100,181,246,0.12)',
          background: 'rgba(100,181,246,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 13 }}>📡</span>
            <span style={{
              color: '#64B5F6', fontFamily: 'monospace', fontSize: 11,
              fontWeight: 700, letterSpacing: '0.07em',
            }}>
              {isScanning ? 'VISUAL SURVEY · SCANNING' : `GIMBAL VISION · ${survey?.frames.length ?? 0} FRAMES`}
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
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse HUD"
              style={{
                background: 'transparent', border: '1px solid rgba(100,181,246,0.2)',
                borderRadius: 4, padding: '1px 5px',
                color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 11,
              }}
            >−</button>
            {onDismiss && (
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

        {/* ── Ready state: film strip ─────────────────────────────────────────── */}
        {!isScanning && survey && survey.frames.length > 0 && (
          <>
            {/* Film strip */}
            <div
              ref={stripRef}
              style={{
                display: 'flex', gap: 8, padding: 10,
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
                  onClick={() => setLightboxFrame(frame)}
                />
              ))}
            </div>

            {/* Stats bar */}
            <div style={{
              display: 'flex', gap: 12, padding: '4px 10px 7px',
              borderTop: '1px solid rgba(100,181,246,0.10)',
            }}>
              {[
                { label: 'PTS',    value: survey.totalPoints },
                { label: 'LINES',  value: survey.totalLines },
                { label: 'SPAN E', value: `${survey.surveyExtentFt.width.toFixed(0)}ft` },
                { label: 'SPAN N', value: `${survey.surveyExtentFt.height.toFixed(0)}ft` },
              ].map(s => (
                <div key={s.label} style={{ fontFamily: 'monospace', fontSize: 10 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label} </span>
                  <span style={{ color: '#64B5F6', fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
                Click frame to enlarge
              </div>
            </div>

            {/* Spatial narrative (collapsible) */}
            {narrativeOpen && (
              <div style={{
                borderTop: '1px solid rgba(100,181,246,0.12)',
                padding: '8px 10px',
                maxHeight: 130, overflowY: 'auto',
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
        {!isScanning && (!survey || survey.frames.length === 0) && (
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
