/**
 * RoadWidthConflictDialog.tsx
 *
 * The selectable width question from GIMBAL-ROAD-ACCEPTANCE §9.4. The road
 * loop is paused while this is open; no drafting turn is consumed. Dismissing
 * it resolves to the narrower cluster, which the loop audits as
 * `assumed_narrow`.
 */

import React, { useState } from 'react';
import type { RoadWidthConflict, RoadWidthResolution } from '../../utils/roadAcceptanceGates';

interface Props {
  conflict: RoadWidthConflict;
  onResolve: (resolution: RoadWidthResolution | null) => void;
}

const buttonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '7px 10px',
  textAlign: 'left',
  background: 'rgba(100,181,246,0.08)',
  border: '1px solid rgba(100,181,246,0.32)',
  borderRadius: 6,
  color: '#DBEAFE',
  fontFamily: 'monospace',
  fontSize: 11,
  cursor: 'pointer',
};

const RoadWidthConflictDialog: React.FC<Props> = ({ conflict, onResolve }) => {
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitCustom = (event: React.FormEvent) => {
    event.preventDefault();
    const width = Number.parseFloat(custom);
    if (!Number.isFinite(width) || width < 1 || width > 300) {
      setError('Enter a width between 1 and 300 ft.');
      return;
    }
    onResolve({ corridorId: conflict.corridorId, decision: 'custom', widthFt: width });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Road width conflict"
      data-testid="road-width-conflict"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(2,6,23,0.72)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          width: 'min(94vw, 440px)',
          padding: '16px 18px 14px',
          background: '#0B1220',
          border: '1px solid rgba(100,181,246,0.38)',
          borderRadius: 10,
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
          color: '#E2E8F0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ color: '#64B5F6', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
            CORRIDOR WIDTH CONFLICT
          </div>
          <button
            type="button"
            aria-label="Dismiss width question"
            title="Dismiss and hold the narrower width"
            onClick={() => onResolve(null)}
            style={{ background: 'transparent', border: 0, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '10px 0 4px', fontSize: 12, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)' }}>
          {conflict.question}
        </p>
        <div style={{ fontFamily: 'monospace', fontSize: 9.5, color: 'rgba(255,255,255,0.42)', marginBottom: 10 }}>
          PASS-1 TOLERANCE ±{conflict.widthTolFt.toFixed(1)} FT · THE DRAW IS PAUSED, NOT A TURN
        </div>

        <button type="button" style={buttonStyle} onClick={() => onResolve({ corridorId: conflict.corridorId, decision: 'narrow' })}>
          Hold {conflict.narrowWidthFt.toFixed(1)} ft <span style={{ opacity: 0.55 }}>· narrower median</span>
        </button>
        <button type="button" style={buttonStyle} onClick={() => onResolve({ corridorId: conflict.corridorId, decision: 'wide' })}>
          Hold {conflict.wideWidthFt.toFixed(1)} ft <span style={{ opacity: 0.55 }}>· wider median</span>
        </button>
        <button type="button" style={buttonStyle} onClick={() => onResolve({ corridorId: conflict.corridorId, decision: 'transition' })}>
          Transition <span style={{ opacity: 0.55 }}>· taper between the two station ranges</span>
        </button>

        <form onSubmit={submitCustom} style={{ marginTop: 9, display: 'flex', gap: 6 }}>
          <input
            aria-label="Custom road width in feet"
            inputMode="decimal"
            value={custom}
            onChange={event => {
              setCustom(event.target.value);
              setError(null);
            }}
            placeholder="Custom width, ft"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '7px 9px',
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid rgba(100,181,246,0.26)',
              borderRadius: 6,
              color: '#E2E8F0',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          />
          <button
            type="submit"
            style={{
              padding: '7px 12px',
              background: 'rgba(100,181,246,0.18)',
              border: '1px solid rgba(100,181,246,0.45)',
              borderRadius: 6,
              color: '#93C5FD',
              fontFamily: 'monospace',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Enter width
          </button>
        </form>
        {error && <div style={{ marginTop: 4, color: '#FB7185', fontFamily: 'monospace', fontSize: 9.5 }}>{error}</div>}

        <button
          type="button"
          onClick={() => onResolve(null)}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '5px 8px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'monospace',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          Dismiss · hold {conflict.narrowWidthFt.toFixed(1)} ft and record assumed_narrow
        </button>
      </div>
    </div>
  );
};

export default RoadWidthConflictDialog;
