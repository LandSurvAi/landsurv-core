import React, { useEffect, useId, useRef, useState } from 'react';
import { mountHolidayEffects, type HolidayEffectsHandle, type HolidayEffectsTheme } from '../utils/holidayEffects.ts';
import { WEBGPU_PREF_EVENT } from '../utils/webgpuBasemap.ts';

interface HolidayEffectsProps {
  theme: HolidayEffectsTheme;
}

const TREE_LIGHT_COLORS = ['#fcd34d', '#f9a8d4', '#67e8f9', '#fef3c7', '#86efac'] as const;

const TREE_LIGHTS: Array<{ x: number; y: number; color: string; delay: string }> = [
  { x: 72, y: 72, color: TREE_LIGHT_COLORS[0], delay: '0s' },
  { x: 90, y: 88, color: TREE_LIGHT_COLORS[1], delay: '-1.1s' },
  { x: 60, y: 122, color: TREE_LIGHT_COLORS[2], delay: '-2.2s' },
  { x: 100, y: 132, color: TREE_LIGHT_COLORS[3], delay: '-0.6s' },
  { x: 76, y: 148, color: TREE_LIGHT_COLORS[4], delay: '-1.7s' },
  { x: 48, y: 178, color: TREE_LIGHT_COLORS[0], delay: '-2.6s' },
  { x: 112, y: 186, color: TREE_LIGHT_COLORS[1], delay: '-0.9s' },
  { x: 82, y: 204, color: TREE_LIGHT_COLORS[2], delay: '-1.9s' },
  { x: 128, y: 208, color: TREE_LIGHT_COLORS[3], delay: '-3.1s' },
];

const ChristmasTree: React.FC<{ mirrored?: boolean }> = ({ mirrored = false }) => {
  const uid = useId().replace(/:/g, '');
  const treeFill = `url(#${uid}-tree)`;
  const groundGlow = `url(#${uid}-ground)`;
  const starGlow = `url(#${uid}-star)`;

  return (
    <svg
      viewBox="0 0 160 260"
      className="block h-auto w-full"
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-tree`} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="38%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>
        <radialGradient id={`${uid}-ground`}>
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-star`}>
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="80" cy="244" rx="78" ry="18" fill={groundGlow} />
      <rect x="74" y="214" width="12" height="36" rx="3" fill="#4a3728" />

      <path
        d="M80 100 L146 220 Q80 207 14 220 Z"
        fill={treeFill}
        stroke="#a7f3d0"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      <path
        d="M80 58 L128 158 Q80 146 32 158 Z"
        fill={treeFill}
        stroke="#a7f3d0"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      <path
        d="M80 18 L108 100 Q80 91 52 100 Z"
        fill={treeFill}
        stroke="#a7f3d0"
        strokeOpacity="0.22"
        strokeWidth="1"
      />

      {TREE_LIGHTS.map((light, index) => (
        <g key={index} className="holiday-tree-light" style={{ animationDelay: light.delay }}>
          <circle cx={light.x} cy={light.y} r="4.5" fill={light.color} opacity="0.16" />
          <circle cx={light.x} cy={light.y} r="1.8" fill={light.color} />
        </g>
      ))}

      <circle cx="80" cy="12" r="18" fill={starGlow} />
      <path
        d="M80 0 L84.4 7.3 L92.7 8.4 L86.7 14.2 L88.2 22.4 L80 18.5 L71.8 22.4 L73.3 14.2 L67.3 8.4 L75.6 7.3 Z"
        fill="#fde68a"
      />
    </svg>
  );
};

/**
 * Replaces the old DOM snowfall/star/firework layers with a single GPU-drawn
 * particle canvas. The trees are static SVG, so they cost nothing per frame.
 */
const HolidayEffects: React.FC<HolidayEffectsProps> = ({ theme }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [preferenceVersion, setPreferenceVersion] = useState(0);

  useEffect(() => {
    const onPreferenceChange = () => setPreferenceVersion(version => version + 1);
    window.addEventListener(WEBGPU_PREF_EVENT, onPreferenceChange);
    return () => window.removeEventListener(WEBGPU_PREF_EVENT, onPreferenceChange);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let handle: HolidayEffectsHandle | null = null;

    void mountHolidayEffects(host, theme).then(effects => {
      if (disposed) effects.destroy();
      else handle = effects;
    });

    return () => {
      disposed = true;
      handle?.destroy();
    };
  }, [theme, preferenceVersion]);

  return (
    <>
      <div
        ref={hostRef}
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: 5 }}
        aria-hidden="true"
      />

      {theme === 'christmas' && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[4] flex items-end justify-between px-1 sm:px-4 lg:px-8"
          aria-hidden="true"
        >
          <div className="w-[92px] opacity-70 sm:w-[132px] sm:opacity-80 lg:w-[164px]">
            <ChristmasTree />
          </div>
          <div className="w-[92px] opacity-70 sm:w-[132px] sm:opacity-80 lg:w-[164px]">
            <ChristmasTree mirrored />
          </div>
        </div>
      )}

      <style>{`
        @keyframes holidayTreeTwinkle {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .holiday-tree-light {
          animation: holidayTreeTwinkle 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
};

export default HolidayEffects;
