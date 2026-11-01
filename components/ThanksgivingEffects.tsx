import React from 'react';

// Simple harvest scene for the homepage: wheat and corn growing from the bottom
// edge, a few pumpkins on the ground, and a full moon. Everything is static CSS
// art except for a gentle sway, and it all sits behind the cards.

const WHEAT = [
  { side: 'left' as const, offset: '11vw', width: 'clamp(38px, 3vw, 58px)', height: 'clamp(140px, 11vw, 210px)', delay: 0.4, duration: 8.5 },
  { side: 'left' as const, offset: '14.5vw', width: 'clamp(32px, 2.6vw, 50px)', height: 'clamp(115px, 9vw, 175px)', delay: 1.6, duration: 7.2 },
  { side: 'left' as const, offset: '17.5vw', width: 'clamp(28px, 2.2vw, 42px)', height: 'clamp(95px, 7.4vw, 145px)', delay: 2.3, duration: 9.4 },
  { side: 'right' as const, offset: '8.5vw', width: 'clamp(38px, 3vw, 58px)', height: 'clamp(140px, 11vw, 210px)', delay: 0.9, duration: 8 },
  { side: 'right' as const, offset: '12vw', width: 'clamp(32px, 2.6vw, 50px)', height: 'clamp(115px, 9vw, 175px)', delay: 2, duration: 7.6 },
  { side: 'right' as const, offset: '15vw', width: 'clamp(28px, 2.2vw, 42px)', height: 'clamp(95px, 7.4vw, 145px)', delay: 0.2, duration: 9.1 },
];

const CORN = [
  { side: 'left' as const, offset: '1vw', width: 'clamp(120px, 9vw, 190px)', height: 'clamp(240px, 18vw, 340px)', delay: 0.2, duration: 10 },
  { side: 'right' as const, offset: '1vw', width: 'clamp(120px, 9vw, 190px)', height: 'clamp(240px, 18vw, 340px)', delay: 1.1, duration: 11 },
];

const PUMPKINS = [
  { side: 'right' as const, offset: '2.5vw', bottom: -12, size: 84, delay: 0.7, id: 0 },
  { side: 'right' as const, offset: '6vw', bottom: -7, size: 58, delay: 2.1, id: 1 },
];

// Deterministic straw texture for the hay bale, so it never re-randomizes on render.
const HAY_STRAWS = Array.from({ length: 46 }, (_, index) => ({
  x: 14 + ((index * 37) % 172),
  y: 34 + ((index * 53) % 68),
  length: 7 + ((index * 17) % 12),
  angle: -16 + ((index * 29) % 32),
  light: index % 3 === 0,
}));

const WheatStalk = () => (
  <svg viewBox="0 0 60 200" width="100%" height="100%" aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
    <path d="M 30 200 C 29 150 31 104 33 62" stroke="#a37a2c" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    {Array.from({ length: 7 }, (_, index) => {
      const y = 58 - index * 6.4;
      const rx = 5.4 - index * 0.4;
      return (
        <g key={index}>
          <ellipse cx={27} cy={y} rx={rx} ry={3.9} fill="#e0b352" transform={`rotate(-26 27 ${y})`} />
          <ellipse cx={35} cy={y - 2.6} rx={rx} ry={3.9} fill="#f0c96a" transform={`rotate(26 35 ${y - 2.6})`} />
        </g>
      );
    })}
    <g stroke="#d9b45f" strokeWidth="1.2" strokeLinecap="round" fill="none">
      <path d="M 33 16 C 28 10 24 5 19 2" />
      <path d="M 34 14 C 34 9 34 4 33 2" />
      <path d="M 35 16 C 40 10 44 5 49 2" />
    </g>
  </svg>
);

const CornStalk = () => (
  <svg viewBox="0 0 130 260" width="100%" height="100%" aria-hidden="true" focusable="false">
    <path d="M 64 260 C 62 208 63 152 66 100 C 67 76 68 56 70 40" stroke="#5c7a1e" strokeWidth="5.5" strokeLinecap="round" fill="none" />
    <path d="M 64 214 C 46 200 26 200 10 210 C 26 214 44 226 60 244 Z" fill="#4f7a12" />
    <path d="M 65 168 C 45 154 26 146 10 150 C 26 162 44 176 63 188 Z" fill="#638c1c" />
    <path d="M 67 124 C 50 106 34 96 20 96 C 34 110 50 124 66 140 Z" fill="#6f9a24" />
    <path d="M 66 196 C 86 180 106 176 122 182 C 106 192 88 206 68 218 Z" fill="#5c7a1e" />
    <path d="M 68 150 C 88 134 106 128 122 132 C 106 144 88 158 69 170 Z" fill="#6f9a24" />
    <path d="M 69 106 C 84 88 98 78 112 76 C 100 92 86 106 68 120 Z" fill="#638c1c" />

    <g transform="rotate(24 78 160)">
      <ellipse cx="78" cy="160" rx="12" ry="28" fill="#f2c14e" />
      {Array.from({ length: 5 }, (_, index) => (
        <path
          key={index}
          d={`M 70 ${146 + index * 8} C 75 ${142 + index * 8} 82 ${142 + index * 8} 87 ${146 + index * 8}`}
          stroke="#d9a521"
          strokeWidth="1.3"
          opacity="0.55"
          fill="none"
        />
      ))}
      <path d="M 66 138 C 58 150 56 174 66 190 C 70 174 70 154 66 138 Z" fill="#4f7a12" />
      <path d="M 90 140 C 98 154 98 176 88 190 C 86 172 86 154 90 140 Z" fill="#5c7a1e" />
      <g stroke="#d9b45f" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M 78 134 C 74 126 76 120 80 116" />
        <path d="M 80 134 C 82 124 86 119 90 117" />
      </g>
    </g>

    <g stroke="#c2ab63" strokeWidth="1.5" strokeLinecap="round" fill="none">
      <path d="M 70 42 C 62 30 56 20 50 12" />
      <path d="M 70 40 C 68 28 66 18 64 8" />
      <path d="M 71 40 C 75 28 78 18 80 8" />
      <path d="M 72 42 C 80 30 86 22 94 16" />
    </g>
  </svg>
);

const Pumpkin = ({ id }: { id: number }) => {
  const bodyId = `thanksgiving-pumpkin-${id}`;
  return (
    <svg viewBox="0 0 100 92" width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={bodyId} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="42%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="86" rx="33" ry="5" fill="#000000" opacity="0.28" />
      <ellipse cx="33" cy="56" rx="22" ry="28" fill="#c2410c" />
      <ellipse cx="67" cy="56" rx="22" ry="28" fill="#c2410c" />
      <ellipse cx="50" cy="56" rx="26" ry="30" fill={`url(#${bodyId})`} />
      <path d="M 50 27 C 41 38 41 73 50 85" stroke="#9a3412" strokeWidth="1.5" strokeOpacity="0.45" fill="none" />
      <path d="M 50 27 C 59 38 59 73 50 85" stroke="#9a3412" strokeWidth="1.5" strokeOpacity="0.45" fill="none" />
      <path d="M 47 28 C 47 20 49 14 54 11" stroke="#65a30d" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M 53 12 C 58 10 61 12 62 15" stroke="#65a30d" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
};

const HayBale = () => (
  <svg viewBox="0 0 200 120" width="100%" height="100%" aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
    <defs>
      <linearGradient id="thanksgiving-hay-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e3b45e" />
        <stop offset="60%" stopColor="#cf9b3e" />
        <stop offset="100%" stopColor="#a9762a" />
      </linearGradient>
      <linearGradient id="thanksgiving-hay-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4a2d0a" stopOpacity="0" />
        <stop offset="100%" stopColor="#4a2d0a" stopOpacity="0.35" />
      </linearGradient>
    </defs>

    <rect x="4" y="24" width="192" height="92" rx="14" fill="url(#thanksgiving-hay-body)" />
    <rect x="16" y="30" width="168" height="12" rx="6" fill="#f2d48c" opacity="0.55" />

    <g strokeLinecap="round">
      {HAY_STRAWS.map((straw, index) => (
        <line
          key={index}
          x1={straw.x}
          y1={straw.y}
          x2={straw.x + straw.length}
          y2={straw.y}
          transform={`rotate(${straw.angle} ${straw.x} ${straw.y})`}
          stroke={straw.light ? '#f0cf7a' : '#a8781f'}
          strokeWidth="1.2"
          opacity={straw.light ? 0.7 : 0.5}
        />
      ))}
    </g>

    {/* Loose straws poking above the bale. */}
    <g stroke="#d9a441" strokeWidth="1.5" strokeLinecap="round" fill="none">
      <path d="M 30 26 C 28 20 26 16 23 12" />
      <path d="M 76 25 C 77 19 79 14 82 10" />
      <path d="M 122 26 C 121 20 119 15 116 11" />
      <path d="M 170 26 C 172 20 174 16 178 13" />
    </g>

    {/* Twine bindings. */}
    <g stroke="#7c5a24" strokeWidth="3" opacity="0.75">
      <line x1="62" y1="26" x2="62" y2="116" />
      <line x1="138" y1="26" x2="138" y2="116" />
    </g>
    <g fill="#5f4519" opacity="0.8">
      <circle cx="62" cy="64" r="2.5" />
      <circle cx="138" cy="64" r="2.5" />
    </g>

    <rect x="4" y="24" width="192" height="92" rx="14" fill="url(#thanksgiving-hay-shade)" />
  </svg>
);

const FullMoon = () => (
  <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="thanksgiving-moon-glow">
        <stop offset="0%" stopColor="#fff7d6" stopOpacity="0.45" />
        <stop offset="45%" stopColor="#fde68a" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="thanksgiving-moon-disc" cx="0.38" cy="0.34" r="0.72">
        <stop offset="0%" stopColor="#fffdf2" />
        <stop offset="55%" stopColor="#f8ecc4" />
        <stop offset="100%" stopColor="#e2c98d" />
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="96" fill="url(#thanksgiving-moon-glow)" />
    <circle cx="100" cy="100" r="54" fill="url(#thanksgiving-moon-disc)" />
    <g fill="#c9b077" opacity="0.35">
      <circle cx="82" cy="86" r="9" />
      <circle cx="112" cy="76" r="5.5" />
      <circle cx="118" cy="108" r="11" />
      <circle cx="90" cy="120" r="7" />
      <circle cx="104" cy="98" r="3.5" />
    </g>
    <circle cx="100" cy="100" r="54" fill="none" stroke="#fffbe8" strokeOpacity="0.25" />
  </svg>
);

const ThanksgivingEffects = () => (
  <>
    <div
      className="thanksgiving-moon pointer-events-none"
      style={{
        position: 'fixed',
        top: 'clamp(200px, 27vh, 280px)',
        right: '3vw',
        width: 'clamp(110px, 12.5vw, 188px)',
        aspectRatio: '1 / 1',
        zIndex: 5,
        opacity: 0.95,
      }}
      aria-hidden="true"
    >
      <FullMoon />
    </div>

    <div
      className="pointer-events-none"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: '300px', zIndex: 15 }}
      aria-hidden="true"
    >
      {CORN.map((corn, index) => (
        <div
          key={`corn-${index}`}
          className="thanksgiving-sway absolute"
          style={{
            [corn.side]: corn.offset,
            bottom: 0,
            width: corn.width,
            height: corn.height,
            transformOrigin: '50% 100%',
            animation: `thanksgivingSway ${corn.duration}s ease-in-out ${corn.delay}s infinite alternate`,
            '--sway-angle': `${1.6 + index * 0.3}deg`,
          } as React.CSSProperties}
        >
          <CornStalk />
        </div>
      ))}

      {WHEAT.map((wheat, index) => (
        <div
          key={`wheat-${index}`}
          className="thanksgiving-sway absolute"
          style={{
            [wheat.side]: wheat.offset,
            bottom: 0,
            width: wheat.width,
            height: wheat.height,
            transformOrigin: '50% 100%',
            animation: `thanksgivingSway ${wheat.duration}s ease-in-out ${wheat.delay}s infinite alternate`,
            '--sway-angle': '1.4deg',
          } as React.CSSProperties}
        >
          <WheatStalk />
        </div>
      ))}

      {/* Hay bale with a couple of small pumpkins resting on top. */}
      <div
        className="absolute"
        style={{
          left: '2.5vw',
          bottom: 0,
          width: 'clamp(150px, 10vw, 205px)',
          height: 'clamp(90px, 6vw, 123px)',
        }}
      >
        <HayBale />
        <div style={{ position: 'absolute', left: '20%', bottom: '72%', width: '24%', aspectRatio: '100 / 92' }}>
          <Pumpkin id={2} />
        </div>
        <div style={{ position: 'absolute', left: '48%', bottom: '74%', width: '19%', aspectRatio: '100 / 92' }}>
          <Pumpkin id={3} />
        </div>
      </div>

      {PUMPKINS.map((pumpkin) => (
        <div
          key={`pumpkin-${pumpkin.id}`}
          className="thanksgiving-pumpkin absolute"
          style={{
            [pumpkin.side]: pumpkin.offset,
            bottom: `${pumpkin.bottom}px`,
            width: `${pumpkin.size}px`,
            height: `${pumpkin.size * 0.92}px`,
            filter: 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.35))',
            animation: `thanksgivingPumpkinBob ${6 + pumpkin.id}s ease-in-out ${pumpkin.delay}s infinite`,
            '--pumpkin-lean': `${pumpkin.id % 2 === 0 ? -2 : 2}deg`,
          } as React.CSSProperties}
        >
          <Pumpkin id={pumpkin.id} />
        </div>
      ))}
    </div>

    <style>{`
      @keyframes thanksgivingSway {
        from {
          transform: rotate(calc(var(--sway-angle, 1.5deg) * -1));
        }
        to {
          transform: rotate(var(--sway-angle, 1.5deg));
        }
      }
      @keyframes thanksgivingPumpkinBob {
        0%, 100% {
          transform: translateY(0) rotate(var(--pumpkin-lean, 0deg));
        }
        50% {
          transform: translateY(-4px) rotate(var(--pumpkin-lean, 0deg));
        }
      }
      @media (max-width: 767px) {
        .thanksgiving-pumpkin {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .thanksgiving-sway,
        .thanksgiving-pumpkin {
          animation: none !important;
        }
      }
    `}</style>
  </>
);

export default ThanksgivingEffects;
