import { useRef, useState } from 'react';
import type {
  AnnotationCallout,
  AnnotationDocument,
  AnnotationMask,
  AnnotationStroke,
} from '../../utils/recording/types';
import type { TimeMap } from '../../utils/recording/time';

export type AnnotationTool = 'select' | 'note' | 'pen' | 'line' | 'arrow' | 'rect' | 'mask';

interface AnnotationLayerProps {
  annotations: AnnotationDocument;
  /** Effective playback time (after trims/speed). */
  timeMs: number;
  /** Source recording time, used when authoring new annotations. */
  sourceTimeMs: number;
  timeMap: TimeMap;
  editable: boolean;
  tool: AnnotationTool;
  onAdd: (next: Partial<AnnotationDocument>) => void;
}

interface DragState {
  start: { x: number; y: number };
  current: { x: number; y: number };
  points: Array<{ x: number; y: number }>;
}

const isActive = (atMs: number, durationMs: number, timeMs: number): boolean =>
  timeMs >= atMs && timeMs <= atMs + Math.max(1000, durationMs);

const pointsToPath = (points: Array<{ x: number; y: number }>): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 1000} ${point.y * 1000}`).join(' ');

const annotationId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  annotations,
  timeMs,
  sourceTimeMs,
  timeMap,
  editable,
  tool,
  onAdd,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const pointFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
  };

  const commitNote = (point: { x: number; y: number }) => {
    const body = window.prompt('Callout text');
    if (!body?.trim()) return;
    const callout: AnnotationCallout = {
      id: annotationId('callout'),
      atMs: sourceTimeMs,
      durationMs: 6000,
      body: body.trim(),
      position: point,
      style: 'note',
      color: '#fbbf24',
    };
    onAdd({ callouts: [...annotations.callouts, callout] });
  };

  const commitStroke = (state: DragState) => {
    const width = Math.max(0.006, Math.hypot(state.current.x - state.start.x, state.current.y - state.start.y));
    if (tool === 'mask') {
      const mask: AnnotationMask = {
        id: annotationId('mask'),
        atMs: sourceTimeMs,
        durationMs: 8000,
        shape: 'rect',
        rect: {
          x: Math.min(state.start.x, state.current.x),
          y: Math.min(state.start.y, state.current.y),
          w: Math.abs(state.current.x - state.start.x),
          h: Math.abs(state.current.y - state.start.y),
        },
        mode: 'solid',
        color: '#020617',
      };
      if (mask.rect.w > 0.005 && mask.rect.h > 0.005) onAdd({ masks: [...annotations.masks, mask] });
      return;
    }

    const strokeTool: AnnotationStroke['tool'] =
      tool === 'pen' ? 'freehand'
        : tool === 'arrow' ? 'arrow'
          : tool === 'rect' ? 'rect'
            : 'line';
    const stroke: AnnotationStroke = {
      id: annotationId('stroke'),
      atMs: sourceTimeMs,
      durationMs: 6000,
      tool: strokeTool,
      points: strokeTool === 'freehand' ? state.points : [state.start, state.current],
      color: '#fbbf24',
      width,
      opacity: 0.95,
      coordinateSpace: 'viewport',
    };
    if (stroke.points.length >= 2) onAdd({ strokes: [...annotations.strokes, stroke] });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || tool === 'select' || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (tool === 'note') {
      commitNote(point);
      return;
    }
    setDrag({ start: point, current: point, points: [point] });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const point = pointFromEvent(event);
    setDrag(prev => prev ? {
      ...prev,
      current: point,
      points: tool === 'pen' ? [...prev.points, point] : prev.points,
    } : null);
  };

  const handlePointerUp = () => {
    if (!drag) return;
    commitStroke(drag);
    setDrag(null);
  };

  const effectiveWindow = (atMs: number, durationMs: number) => {
    const start = timeMap.sourceToEffective(atMs);
    const end = timeMap.sourceToEffective(atMs + durationMs);
    return { start, duration: Math.max(500, end - start) };
  };

  const activeCallouts = annotations.callouts.filter(callout => {
    const window = effectiveWindow(callout.atMs, callout.durationMs);
    return isActive(window.start, window.duration, timeMs);
  });
  const activeStrokes = annotations.strokes.filter(stroke => {
    const window = effectiveWindow(stroke.atMs, stroke.durationMs);
    return isActive(window.start, window.duration, timeMs);
  });
  const activeMasks = annotations.masks.filter(mask => {
    const window = effectiveWindow(mask.atMs, mask.durationMs);
    return isActive(window.start, window.duration, timeMs);
  });

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {activeMasks.map(mask => (
        <div
          key={mask.id}
          className="absolute rounded-sm"
          style={{
            left: `${mask.rect.x * 100}%`,
            top: `${mask.rect.y * 100}%`,
            width: `${mask.rect.w * 100}%`,
            height: `${mask.rect.h * 100}%`,
            background: mask.color ?? '#020617',
            opacity: 0.9,
            backdropFilter: mask.mode === 'blur' ? 'blur(10px)' : undefined,
          }}
        />
      ))}

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        {activeStrokes.map(stroke => {
          const first = stroke.points[0];
          const last = stroke.points[stroke.points.length - 1];
          if (!first || !last) return null;
          if (stroke.tool === 'rect') {
            const x = Math.min(first.x, last.x) * 1000;
            const y = Math.min(first.y, last.y) * 1000;
            const w = Math.abs(last.x - first.x) * 1000;
            const h = Math.abs(last.y - first.y) * 1000;
            return (
              <rect
                key={stroke.id}
                x={x}
                y={y}
                width={w}
                height={h}
                fill="none"
                stroke={stroke.color}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                opacity={stroke.opacity}
              />
            );
          }
          return (
            <path
              key={stroke.id}
              d={pointsToPath(stroke.points)}
              fill="none"
              stroke={stroke.color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={stroke.opacity}
            />
          );
        })}
        {drag && tool !== 'note' && (
          <path
            d={tool === 'mask' || tool === 'rect'
              ? `M ${Math.min(drag.start.x, drag.current.x) * 1000} ${Math.min(drag.start.y, drag.current.y) * 1000} h ${Math.abs(drag.current.x - drag.start.x) * 1000} v ${Math.abs(drag.current.y - drag.start.y) * 1000} h -${Math.abs(drag.current.x - drag.start.x) * 1000} Z`
              : pointsToPath(drag.points)}
            fill={tool === 'mask' ? 'rgba(2, 6, 23, 0.7)' : 'none'}
            stroke="#fbbf24"
            strokeWidth={2}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {activeCallouts.map(callout => (
        <div
          key={callout.id}
          className="absolute max-w-[260px] -translate-y-1/2 rounded-md border border-amber-300/50 bg-slate-900/95 px-3 py-2 text-xs text-amber-50 shadow-xl"
          style={{ left: `${callout.position.x * 100}%`, top: `${callout.position.y * 100}%` }}
        >
          {callout.title && <div className="mb-1 font-semibold text-amber-300">{callout.title}</div>}
          <div className="whitespace-pre-wrap leading-snug">{callout.body}</div>
        </div>
      ))}

      {editable && tool !== 'select' && (
        <div
          className={`pointer-events-auto absolute inset-0 touch-none ${tool === 'note' ? 'cursor-copy' : 'cursor-crosshair'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setDrag(null)}
        />
      )}
    </div>
  );
};
