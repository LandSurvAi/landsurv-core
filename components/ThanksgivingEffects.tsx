import React from 'react';

// Harvest scene for the homepage: wheat and corn growing from the bottom edge,
// pumpkins on the ground, the survey crew's total station and prism pole set up
// in the stubble, low grass and the sky above. Everything is static CSS art
// except for a gentle sway, and it all sits behind the cards.
//
// The same scene serves both autumn themes. Thanksgiving adds a blue daytime sky
// with fluffy clouds, green wooded hills and a little farmland on the horizon.
// Halloween keeps the homepage's dark backdrop
// and the full moon, shows the harvest art at full brightness, swaps in large
// carved jack-o'-lanterns and keeps its own fast bat swarm (rendered by the
// homepage).

export type HarvestTheme = 'halloween' | 'thanksgiving';

interface ThanksgivingEffectsProps {
  theme?: HarvestTheme;
}

const MOON_TOP = 'clamp(200px, 27vh, 280px)';
const MOON_SIZE = 'clamp(150px, 16vw, 252px)';

// The total station's placement in the ground layer.
const SURVEY_LEFT = '11.9vw';
const SURVEY_WIDTH = 'clamp(82px, 6.5vw, 120px)';

// The dawn sun sits up in the top-right corner, clear of the header's dark band.
const SUN_TOP = 'clamp(96px, 13vh, 164px)';
const SUN_RIGHT = 'clamp(20px, 4vw, 72px)';
const SUN_SIZE = 'clamp(112px, 10vw, 172px)';
const HORIZON_HEIGHT = 'clamp(170px, 22vh, 300px)';

const WHEAT = [
  { side: 'left' as const, offset: '11vw', width: 'clamp(38px, 3vw, 58px)', height: 'clamp(140px, 11vw, 210px)', delay: 0.4, duration: 8.5 },
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

// Low grass tufts along the ground, kept to the open margins either side of the cards.
const GRASS = [
  { side: 'left' as const, offset: '0.3vw', size: 32, delay: 0.4, duration: 6.9 },
  { side: 'left' as const, offset: '2.4vw', size: 26, delay: 1.6, duration: 7.8 },
  { side: 'left' as const, offset: '5.1vw', size: 40, delay: 0.8, duration: 6.3 },
  { side: 'left' as const, offset: '7.8vw', size: 28, delay: 2.2, duration: 8.4 },
  { side: 'left' as const, offset: '10.4vw', size: 36, delay: 1.1, duration: 7.2 },
  { side: 'left' as const, offset: '13vw', size: 24, delay: 2.6, duration: 6.7 },
  { side: 'left' as const, offset: '15.8vw', size: 42, delay: 0.2, duration: 8.1 },
  { side: 'left' as const, offset: '18.4vw', size: 30, delay: 1.9, duration: 7.5 },
  { side: 'right' as const, offset: '0.5vw', size: 34, delay: 1.2, duration: 7.6 },
  { side: 'right' as const, offset: '3.1vw', size: 26, delay: 0.6, duration: 6.5 },
  { side: 'right' as const, offset: '5.8vw', size: 38, delay: 2.3, duration: 8.2 },
  { side: 'right' as const, offset: '8.4vw', size: 28, delay: 1.4, duration: 6.8 },
  { side: 'right' as const, offset: '11vw', size: 36, delay: 0.3, duration: 7.9 },
  { side: 'right' as const, offset: '13.6vw', size: 24, delay: 2.0, duration: 6.4 },
  { side: 'right' as const, offset: '16.2vw', size: 40, delay: 1.0, duration: 8.6 },
  { side: 'right' as const, offset: '18.8vw', size: 30, delay: 2.5, duration: 7.1 },
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

const CornStalk = ({ earOnLeft = false }: { earOnLeft?: boolean }) => (
  <svg viewBox="0 0 130 260" width="100%" height="100%" aria-hidden="true" focusable="false">
    <path d="M 64 260 C 62 208 63 152 66 100 C 67 76 68 56 70 40" stroke="#5c7a1e" strokeWidth="5.5" strokeLinecap="round" fill="none" />
    <path d="M 64 214 C 46 200 26 200 10 210 C 26 214 44 226 60 244 Z" fill="#4f7a12" />
    <path d="M 65 168 C 45 154 26 146 10 150 C 26 162 44 176 63 188 Z" fill="#638c1c" />
    <path d="M 67 124 C 50 106 34 96 20 96 C 34 110 50 124 66 140 Z" fill="#6f9a24" />
    <path d="M 66 196 C 86 180 106 176 122 182 C 106 192 88 206 68 218 Z" fill="#5c7a1e" />
    <path d="M 68 150 C 88 134 106 128 122 132 C 106 144 88 158 69 170 Z" fill="#6f9a24" />
    <path d="M 69 106 C 84 88 98 78 112 76 C 100 92 86 106 68 120 Z" fill="#638c1c" />

    <g transform={earOnLeft ? 'translate(136 -44) scale(-1 1) rotate(24 78 160)' : 'rotate(24 78 160)'}>
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

const Pumpkin = ({ id, carved = false }: { id: number; carved?: boolean }) => {
  const bodyId = `thanksgiving-pumpkin-${id}`;
  const glowId = `thanksgiving-pumpkin-glow-${id}`;
  return (
    <svg viewBox="0 0 100 92" width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={bodyId} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="42%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
        <radialGradient id={glowId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.7" />
          <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="86" rx="33" ry="5" fill="#000000" opacity="0.28" />
      <ellipse cx="33" cy="56" rx="22" ry="28" fill="#c2410c" />
      <ellipse cx="67" cy="56" rx="22" ry="28" fill="#c2410c" />
      <ellipse cx="50" cy="56" rx="26" ry="30" fill={`url(#${bodyId})`} />
      <path d="M 50 27 C 41 38 41 73 50 85" stroke="#9a3412" strokeWidth="1.5" strokeOpacity="0.45" fill="none" />
      <path d="M 50 27 C 59 38 59 73 50 85" stroke="#9a3412" strokeWidth="1.5" strokeOpacity="0.45" fill="none" />

      {/* Jack-o'-lantern face: a warm halo inside the shell, then the cut-outs. */}
      {carved && (
        <g>
          <ellipse cx="50" cy="62" rx="24" ry="22" fill={`url(#${glowId})`} />
          <g fill="#fbbf24" stroke="#7c2d12" strokeWidth="0.9" strokeOpacity="0.5" strokeLinejoin="round">
            <path d="M 33 45 L 45 42 L 43 53 Z" />
            <path d="M 67 45 L 55 42 L 57 53 Z" />
            <path d="M 50 55 L 45 63 L 55 63 Z" />
            <path d="M 29 62 L 36 70 L 44 61 L 50 71 L 56 61 L 63 70 L 70 62 C 62 86 38 86 29 62 Z" />
          </g>
          <g fill="#fef3c7" opacity="0.6">
            <path d="M 36 46 L 43 44 L 42 50 Z" />
            <path d="M 64 46 L 57 44 L 58 50 Z" />
          </g>
        </g>
      )}

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

const GrassTuft = () => (
  <svg viewBox="0 0 60 60" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
    <g fill="#5d7a24">
      <path d="M20 60 C 18 46 12 34 8 26 C 13 38 17 48 24 60 Z" />
      <path d="M36 60 C 39 46 46 34 52 27 C 46 41 41 49 40 60 Z" />
    </g>
    <g fill="#7d9b33">
      <path d="M28 60 C 27 40 26 26 30 9 C 33 26 34 44 33 60 Z" />
      <path d="M25 60 C 22 48 18 42 14 36 C 20 44 23 52 28 60 Z" />
      <path d="M32 60 C 35 48 40 42 45 36 C 39 45 36 52 34 60 Z" />
    </g>
    <g fill="#94ac42">
      <path d="M12 60 C 9 50 5 44 2 39 C 7 48 10 54 16 60 Z" />
      <path d="M44 60 C 48 50 53 44 57 40 C 51 49 48 55 46 60 Z" />
    </g>
    <g fill="#b08a33" opacity="0.9">
      <path d="M23 60 C 21 51 17 46 12 43 C 18 47 21 53 27 60 Z" />
      <path d="M35 60 C 38 52 43 47 48 45 C 42 49 39 54 37 60 Z" />
    </g>
  </svg>
);

// Painterly horizon helpers. The hills are smooth rolling silhouettes, while the
// woodland is a soft deterministic scatter of low-contrast crowns along each
// crest: most of it reads as texture, with a handful of trees picked out.
const hillCrest = (x: number, baseY: number, height: number, length: number, phase: number) =>
  baseY - Math.sin(x / length + phase) * height - Math.sin(x / (length * 0.37) + phase * 2.3) * height * 0.26;

const buildRidge = (baseY: number, height: number, length: number, phase: number) => {
  const step = 90;
  let path = `M 0 300 L 0 ${hillCrest(0, baseY, height, length, phase).toFixed(1)}`;
  for (let x = 0; x < 1440; x += step) {
    const end = Math.min(x + step, 1440);
    const mid = x + step * 0.5;
    path += ` Q ${mid.toFixed(1)} ${(hillCrest(mid, baseY, height, length, phase) - 5).toFixed(1)} ${end.toFixed(1)} ${hillCrest(end, baseY, height, length, phase).toFixed(1)}`;
  }
  return `${path} L 1440 300 Z`;
};

interface ForestCrown {
  x: number;
  y: number;
  rx: number;
  ry: number;
  opacity: number;
}

const buildForest = (
  baseY: number,
  height: number,
  length: number,
  phase: number,
  seed: number,
  size: number,
  threshold: number,
): ForestCrown[] => {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const crowns: ForestCrown[] = [];
  let x = 0;
  while (x < 1440) {
    x += 6 + random() * 17;
    const clump = Math.sin(x / 97 + phase * 4) * 0.55 + Math.sin(x / 31 + phase) * 0.45;
    if (clump < threshold) continue;
    const big = random() > 0.9 ? 1.7 : 1;
    const ry = (3.2 + random() * 5) * big * size;
    crowns.push({
      x,
      y: hillCrest(x, baseY, height, length, phase) - ry * 0.45,
      rx: ry * (0.8 + random() * 0.55),
      ry,
      opacity: 0.14 + random() * 0.26,
    });
  }
  return crowns;
};

const FAR_RIDGE = buildRidge(106, 18, 380, 0.6);
const MID_RIDGE = buildRidge(150, 22, 290, 2.1);
const NEAR_RIDGE = buildRidge(228, 12, 250, 4.2);
const FAR_FOREST = buildForest(106, 18, 380, 0.6, 1201, 0.7, -0.35);
const MID_FOREST = buildForest(150, 22, 290, 2.1, 7727, 1, -0.2);
const NEAR_FOREST = buildForest(228, 12, 250, 4.2, 3313, 1.2, -0.3);
const STANDOUT_TREES = buildForest(150, 22, 290, 2.1, 5521, 1.9, 0.62);

const CLOUDS = [
  { side: 'left' as const, offset: '1%', top: '16%', width: '24vw', opacity: 0.95 },
  { side: 'left' as const, offset: '14%', top: '5%', width: '13vw', opacity: 0.55 },
  { side: 'left' as const, offset: '2%', top: '33%', width: '16vw', opacity: 0.8 },
  { side: 'right' as const, offset: '18%', top: '30%', width: '18vw', opacity: 0.85 },
  { side: 'right' as const, offset: '5%', top: '45%', width: '13vw', opacity: 0.65 },
];

// A soft cumulus made of overlapping lobes with a blue-grey underside.
const Cloud = () => (
  <svg viewBox="0 0 260 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <g fill="#ffffff">
      <ellipse cx="84" cy="72" rx="50" ry="29" />
      <ellipse cx="130" cy="54" rx="44" ry="34" />
      <ellipse cx="172" cy="68" rx="40" ry="27" />
      <ellipse cx="54" cy="84" rx="38" ry="21" />
      <ellipse cx="206" cy="84" rx="33" ry="19" />
      <rect x="20" y="78" width="212" height="22" rx="11" />
      <ellipse cx="112" cy="42" rx="24" ry="18" opacity="0.9" />
    </g>
    <g fill="#bcd6ea" opacity="0.5">
      <ellipse cx="78" cy="96" rx="44" ry="9" />
      <ellipse cx="148" cy="98" rx="54" ry="8" />
      <ellipse cx="204" cy="95" rx="27" ry="6" />
    </g>
  </svg>
);

// Thanksgiving daytime: a full-viewport blue sky behind the harvest, with the
// sun in the top-right and painterly green hills carrying the horizon.
const DaytimeSky = () => (
  <div
    className="pointer-events-none"
    style={{ position: 'fixed', inset: 0, zIndex: 4, overflow: 'hidden' }}
    aria-hidden="true"
  >
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'linear-gradient(to bottom, #0e3573 0%, #16498c 12%, #2367a8 27%, #3d86c2 43%, #63a8d6 58%, #90c6e6 72%, #bde0f2 85%, #e2f4fc 100%)',
      }}
    />

    {/* Fluffy cumulus over the blue. */}
    {CLOUDS.map((cloud, index) => (
      <div
        key={`cloud-${index}`}
        style={{
          position: 'absolute',
          [cloud.side]: cloud.offset,
          top: cloud.top,
          width: cloud.width,
          opacity: cloud.opacity,
          filter: 'blur(0.7px)',
        }}
      >
        <Cloud />
      </div>
    ))}

    {/* Sun: a warm halo, then the bright disc, up in the top-right corner. */}
    <div
      style={{
        position: 'absolute',
        top: SUN_TOP,
        right: SUN_RIGHT,
        width: SUN_SIZE,
        aspectRatio: '1 / 1',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '340%',
          aspectRatio: '1 / 1',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255, 232, 177, 0.85) 0%, rgba(255, 193, 118, 0.4) 24%, rgba(255, 150, 96, 0.16) 46%, rgba(255, 140, 90, 0) 68%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 42%, #fffdf4 0%, #fff2bf 34%, #ffd479 66%, #ffb45f 88%, #ff9a4d 100%)',
          boxShadow:
            '0 0 30px rgba(255, 214, 140, 0.8), 0 0 80px rgba(255, 172, 96, 0.5), 0 0 150px rgba(255, 146, 82, 0.3)',
        }}
      />
    </div>

    {/* Horizon: painterly green hills with soft woodland, fields, a lane and a farm. */}
    <svg
      viewBox="0 0 1440 300"
      preserveAspectRatio="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: HORIZON_HEIGHT, display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="day-hill-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#aac9ba" />
          <stop offset="100%" stopColor="#82aa9c" />
        </linearGradient>
        <linearGradient id="day-hill-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7aa96b" />
          <stop offset="100%" stopColor="#4f7d58" />
        </linearGradient>
        <linearGradient id="day-valley" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8bb370" />
          <stop offset="55%" stopColor="#6b985e" />
          <stop offset="100%" stopColor="#49724e" />
        </linearGradient>
        <linearGradient id="day-hill-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f6a4c" />
          <stop offset="100%" stopColor="#274533" />
        </linearGradient>
        <linearGradient id="day-foreground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b3324" />
          <stop offset="100%" stopColor="#0b1a12" />
        </linearGradient>
        <linearGradient id="day-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eaf7fc" stopOpacity="0" />
          <stop offset="55%" stopColor="#eaf7fc" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#eaf7fc" stopOpacity="0" />
        </linearGradient>
        <filter id="day-soft" x="-10%" y="-20%" width="120%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>

      {/* Distant hills, softened and hazed. */}
      <path d={FAR_RIDGE} fill="url(#day-hill-far)" />
      <g filter="url(#day-soft)">
        {FAR_FOREST.map((tree, index) => (
          <ellipse key={`far-tree-${index}`} cx={tree.x} cy={tree.y} rx={tree.rx} ry={tree.ry} fill="#6f9c8b" opacity={tree.opacity} />
        ))}
      </g>
      <rect x="0" y="108" width="1440" height="40" fill="url(#day-haze)" />

      {/* Mid hills, with most of the woodland blurred into one mass. */}
      <path d={MID_RIDGE} fill="url(#day-hill-mid)" />
      <g filter="url(#day-soft)">
        {MID_FOREST.map((tree, index) => (
          <ellipse key={`mid-tree-${index}`} cx={tree.x} cy={tree.y} rx={tree.rx} ry={tree.ry} fill="#3f6748" opacity={tree.opacity} />
        ))}
      </g>
      <g fill="#2f5539" opacity="0.75">
        {STANDOUT_TREES.map((tree, index) => (
          <g key={`standout-tree-${index}`}>
            <ellipse cx={tree.x} cy={tree.y} rx={tree.rx} ry={tree.ry} />
            <ellipse cx={tree.x + tree.rx * 0.6} cy={tree.y + tree.ry * 0.4} rx={tree.rx * 0.7} ry={tree.ry * 0.8} />
          </g>
        ))}
      </g>

      {/* Farmland in the valley. */}
      <path
        d="M0 158 C 240 150 420 164 640 158 C 860 152 1040 166 1240 158 C 1340 154 1400 160 1440 157 L1440 300 L0 300 Z"
        fill="url(#day-valley)"
      />

      {/* Field parcels. */}
      <g>
        <path d="M -20 184 L 210 172 L 300 198 L 40 208 Z" fill="#b3c67e" opacity="0.35" />
        <path d="M 300 172 L 520 164 L 596 192 L 336 200 Z" fill="#8bab62" opacity="0.4" />
        <path d="M 596 164 L 820 158 L 880 186 L 640 192 Z" fill="#c7d492" opacity="0.22" />
        <path d="M 880 158 L 1120 156 L 1170 184 L 930 188 Z" fill="#8bab62" opacity="0.38" />
        <path d="M 1170 156 L 1460 152 L 1460 198 L 1210 190 Z" fill="#b3c67e" opacity="0.3" />
      </g>

      {/* Hedgerows bounding the fields. */}
      <g fill="none" stroke="#33502f" strokeWidth="1.8" strokeOpacity="0.5">
        <path d="M -20 184 L 210 172 L 300 198 L 40 208 Z" />
        <path d="M 300 172 L 520 164 L 596 192 L 336 200 Z" />
        <path d="M 596 164 L 820 158 L 880 186 L 640 192 Z" />
        <path d="M 880 158 L 1120 156 L 1170 184 L 930 188 Z" />
        <path d="M 1170 156 L 1460 152 L 1460 198 L 1210 190 Z" />
      </g>

      {/* Country lane through the valley, with a branch dropping toward the viewer. */}
      <g fill="none" strokeLinecap="round">
        <path d="M -20 190 C 170 182 330 202 520 194 C 700 186 820 170 1000 172 C 1160 174 1280 194 1460 186" stroke="#7c6a44" strokeWidth="9" strokeOpacity="0.35" />
        <path d="M -20 190 C 170 182 330 202 520 194 C 700 186 820 170 1000 172 C 1160 174 1280 194 1460 186" stroke="#f6e6c0" strokeWidth="3.6" strokeOpacity="0.6" />
        <path d="M 560 193 C 520 212 486 236 452 280" stroke="#7c6a44" strokeWidth="7" strokeOpacity="0.3" />
        <path d="M 560 193 C 520 212 486 236 452 280" stroke="#f6e6c0" strokeWidth="2.8" strokeOpacity="0.5" />
      </g>

      {/* A little farmstead, copses and a pond. */}
      <g fill="#2c4230">
        <path d="M 1042 176 L 1042 162 L 1062 153 L 1082 162 L 1082 176 Z" />
        <rect x="1090" y="150" width="10" height="26" rx="2" />
        <path d="M 1090 150 Q 1095 141 1100 150 Z" />
        <path d="M 1006 178 L 1006 167 L 1020 161 L 1034 167 L 1034 178 Z" />
        <circle cx="994" cy="172" r="6" />
        <circle cx="1114" cy="168" r="7" />
        <circle cx="1126" cy="174" r="4.5" />
        <circle cx="258" cy="188" r="7" />
        <circle cx="272" cy="184" r="5" />
        <circle cx="906" cy="180" r="6" />
        <circle cx="1354" cy="176" r="7" />
      </g>
      <g stroke="#f7ecc4" strokeWidth="1" strokeOpacity="0.35" fill="none">
        <path d="M 1082 162 L 1082 176" />
        <path d="M 1100 152 L 1100 176" />
        <path d="M 1034 167 L 1034 178" />
      </g>
      <ellipse cx="470" cy="176" rx="40" ry="5.5" fill="#c9e9f4" opacity="0.5" />
      <ellipse cx="470" cy="176" rx="40" ry="5.5" fill="none" stroke="#eaf8fd" strokeOpacity="0.4" strokeWidth="1" />

      {/* Near hills with their own soft tree cover, then the dark foreground shelf. */}
      <path d={NEAR_RIDGE} fill="url(#day-hill-near)" />
      <g filter="url(#day-soft)">
        {NEAR_FOREST.map((tree, index) => (
          <ellipse key={`near-tree-${index}`} cx={tree.x} cy={tree.y} rx={tree.rx} ry={tree.ry} fill="#22412f" opacity={tree.opacity} />
        ))}
      </g>
      <path
        d="M0 276 C 180 266 360 274 540 280 C 720 286 900 276 1080 279 C 1260 282 1350 278 1440 274 L1440 300 L0 300 Z"
        fill="url(#day-foreground)"
      />
    </svg>
  </div>
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

// Halloween's moon passes: three bats cross the lit face on staggered loops, so
// the disc is never without a silhouette gliding in front of it for long.
const MOON_PASSES = [
  { top: '20%', duration: 7.5, delay: 0, size: 'clamp(16px, 1.4vw, 24px)' },
  { top: '44%', duration: 9, delay: -2.6, size: 'clamp(13px, 1.2vw, 21px)' },
  { top: '66%', duration: 8.2, delay: -5.1, size: 'clamp(14px, 1.25vw, 22px)' },
];

const HalloweenMoonBats = () => (
  <div
    className="pointer-events-none"
    style={{
      position: 'fixed',
      top: MOON_TOP,
      right: '3vw',
      width: MOON_SIZE,
      aspectRatio: '1 / 1',
      zIndex: 6,
    }}
    aria-hidden="true"
  >
    {MOON_PASSES.map((bat, index) => (
      <span
        key={`moon-pass-${index}`}
        className="halloween-moon-pass"
        style={{
          top: bat.top,
          fontSize: bat.size,
          animationDuration: `${bat.duration}s`,
          animationDelay: `${bat.delay}s`,
        }}
      >
        <span style={{ display: 'inline-block', animation: 'halloweenMoonFlap 0.8s ease-in-out infinite alternate' }}>🦇</span>
      </span>
    ))}
  </div>
);

// Total station (transit) on a yellow tripod, seen face-on like a real instrument.
const TotalStation = () => (
  <svg
    viewBox="0 0 120 244"
    width="100%"
    height="100%"
    preserveAspectRatio="xMidYMax meet"
    aria-hidden="true"
    focusable="false"
    style={{ overflow: 'visible' }}
  >
    <defs>
      <linearGradient id="thanksgiving-tripod-leg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#b45309" />
        <stop offset="20%" stopColor="#facc15" />
        <stop offset="58%" stopColor="#fde047" />
        <stop offset="100%" stopColor="#a16207" />
      </linearGradient>
      <linearGradient id="thanksgiving-transit-body" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5b6c80" />
        <stop offset="48%" stopColor="#36434f" />
        <stop offset="100%" stopColor="#1a2430" />
      </linearGradient>
      <radialGradient id="thanksgiving-transit-lens" cx="0.36" cy="0.3" r="0.8">
        <stop offset="0%" stopColor="#475569" />
        <stop offset="45%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#020617" />
      </radialGradient>
    </defs>

    <ellipse cx="60" cy="240" rx="48" ry="5.5" fill="#000000" opacity="0.42" />

    {/* Rear leg and its steel point. */}
    <path d="M57 110 L63 110 L69 232 L62 232 Z" fill="#ca8a04" stroke="#6b3f05" strokeWidth="1.2" />
    <path d="M62 226 L69 226 L70 234 L62 234 Z" fill="#3f3f46" />

    {/* Yellow wooden tripod legs, outlined and highlighted on the sunlit side. */}
    <path d="M45 104 L53 104 L20 232 L13 230 Z" fill="url(#thanksgiving-tripod-leg)" stroke="#6b3f05" strokeWidth="1.4" />
    <path d="M67 104 L75 104 L107 230 L100 232 Z" fill="url(#thanksgiving-tripod-leg)" stroke="#6b3f05" strokeWidth="1.4" />
    <path d="M75 105 L107 230" stroke="#fff3c4" strokeWidth="1.3" strokeLinecap="round" opacity="0.4" />
    <path d="M14 224 L21 226 L20 232 L13 231 Z" fill="#3f3f46" />
    <path d="M99 224 L106 226 L107 231 L100 232 Z" fill="#3f3f46" />
    {/* Leg extension clamps. */}
    <path d="M25 184 L32 181" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
    <path d="M88 181 L95 184" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />

    {/* Red tripod head with levelling screws. */}
    <rect x="34" y="94" width="52" height="8" rx="3" fill="#dc2626" stroke="#450a0a" strokeWidth="1.2" />
    <path d="M42 102 L78 102 L60 116 Z" fill="#b91c1c" stroke="#450a0a" strokeWidth="1.2" />
    <circle cx="38" cy="98" r="3" fill="#e2e8f0" />
    <circle cx="82" cy="98" r="3" fill="#e2e8f0" />
    <circle cx="60" cy="99" r="2.4" fill="#e2e8f0" />

    {/* Tribrach and instrument base. */}
    <rect x="45" y="86" width="30" height="9" rx="2.5" fill="#64748b" stroke="#0b1220" strokeWidth="1.1" />
    <rect x="45" y="83" width="30" height="5" rx="2" fill="#94a3b8" stroke="#0b1220" strokeWidth="1" />

    {/* Dark alloy shell with a survey-orange lower housing. */}
    <rect x="41" y="42" width="38" height="43" rx="4" fill="url(#thanksgiving-transit-body)" stroke="#0b1220" strokeWidth="1.8" />
    <path d="M41 72 L79 72 L79 81 Q79 85 75 85 L45 85 Q41 85 41 81 Z" fill="#ea580c" stroke="#7c2d12" strokeWidth="1.1" />
    <path d="M41.6 73.4 L78.4 73.4" stroke="#fdba74" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
    <rect x="46" y="75" width="13" height="6" rx="1.5" fill="#1f2937" />
    <rect x="48" y="76.5" width="5" height="3" rx="0.8" fill="#86efac" />
    {/* Sunlit right edge, so the body separates from the sky. */}
    <path d="M78.6 44 L78.6 83" stroke="#ffe7b0" strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />

    {/* Objective lens, ring and reflections — 15% smaller than the original. */}
    <circle cx="60" cy="58" r="12.8" fill="#e2e8f0" stroke="#0b1220" strokeWidth="1.5" />
    <circle cx="60" cy="58" r="10.4" fill="url(#thanksgiving-transit-lens)" stroke="#0f172a" strokeWidth="1.5" />
    <circle cx="60" cy="58" r="4.7" fill="#020617" />
    <path d="M54 52 A 7.7 7.7 0 0 1 62.6 49.9" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" fill="none" />
    <circle className="thanksgiving-glint" cx="55.8" cy="53.8" r="1.3" fill="#fde68a" />

    {/* Tangent knobs and the tapered carrying handle, spanning the body. */}
    <circle cx="81" cy="64" r="5.5" fill="#64748b" stroke="#0b1220" strokeWidth="1" />
    <circle cx="81" cy="64" r="2" fill="#e2e8f0" />
    <circle cx="39" cy="63" r="4.5" fill="#64748b" stroke="#0b1220" strokeWidth="1" />
    <path d="M42.5 42 L45.2 30.5 Q45.8 27 49.5 27 L70.5 27 Q74.2 27 74.8 30.5 L77.5 42" stroke="#0b1220" strokeWidth="6.4" strokeLinecap="round" fill="none" />
    <path d="M42.5 42 L45.2 30.5 Q45.8 27 49.5 27 L70.5 27 Q74.2 27 74.8 30.5 L77.5 42" stroke="#e2e8f0" strokeWidth="4.2" strokeLinecap="round" fill="none" />
    <path d="M42.5 42 L45.2 30.5 Q45.8 27 49.5 27 L70.5 27 Q74.2 27 74.8 30.5 L77.5 42" stroke="#64748b" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5" />
  </svg>
);

// Survey prism on an orange target board, held upright by a bipod.
const SurveyPole = () => (
  <svg
    viewBox="0 0 90 276"
    width="100%"
    height="100%"
    preserveAspectRatio="xMidYMax meet"
    aria-hidden="true"
    focusable="false"
    style={{ overflow: 'visible' }}
  >
    <defs>
      <linearGradient id="thanksgiving-pole-shaft" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#d9c9a8" />
        <stop offset="45%" stopColor="#fffaf0" />
        <stop offset="100%" stopColor="#c9b795" />
      </linearGradient>
      <linearGradient id="thanksgiving-pole-leg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#b45309" />
        <stop offset="20%" stopColor="#facc15" />
        <stop offset="58%" stopColor="#fde047" />
        <stop offset="100%" stopColor="#a16207" />
      </linearGradient>
      <radialGradient id="thanksgiving-prism-glass" cx="0.36" cy="0.3" r="0.85">
        <stop offset="0%" stopColor="#fca5a5" />
        <stop offset="38%" stopColor="#ef4444" />
        <stop offset="72%" stopColor="#991b1b" />
        <stop offset="100%" stopColor="#450a0a" />
      </radialGradient>
    </defs>

    <ellipse cx="45" cy="271" rx="31" ry="4.5" fill="#000000" opacity="0.3" />

    {/* Bipod legs, feet and the clamp on the pole, set at waist height. */}
    <path d="M31 164 L43 160 L18 268 L8 264 Z" fill="url(#thanksgiving-pole-leg)" />
    <path d="M59 164 L47 160 L72 264 L82 268 Z" fill="url(#thanksgiving-pole-leg)" />
    <path d="M6 258 L17 263 L15 269 L4 264 Z" fill="#2f3d4c" />
    <path d="M84 258 L73 263 L75 269 L86 264 Z" fill="#2f3d4c" />
    <rect x="33" y="148" width="24" height="14" rx="4" fill="#46586b" />
    <rect x="35" y="152" width="20" height="3.5" rx="1.5" fill="#ea580c" opacity="0.9" />

    {/* Pole shaft with survey banding and a steel point. */}
    <rect x="41.5" y="74" width="7" height="198" rx="3.5" fill="url(#thanksgiving-pole-shaft)" />
    {[96, 136, 176, 216].map((bandTop) => (
      <rect key={bandTop} x="41.5" y={bandTop} width="7" height="12" fill="#ea580c" opacity="0.92" />
    ))}
    <rect x="43.2" y="262" width="4.6" height="12" fill="#334155" />

    {/* Orange target board with retro-reflective chevrons. */}
    <rect x="18" y="14" width="54" height="54" rx="4" fill="#ea580c" stroke="#c2410c" strokeWidth="1.2" />
    <g fill="#fff7ed">
      <path d="M33 15 L57 15 L45 34 Z" />
      <path d="M33 67 L57 67 L45 48 Z" />
      <path d="M19 29 L19 53 L38 41 Z" />
      <path d="M71 29 L71 53 L52 41 Z" />
    </g>
    <g fill="#111827">
      <path d="M37 18 L53 18 L45 30 Z" />
      <path d="M37 64 L53 64 L45 52 Z" />
      <path d="M22 33 L22 49 L34 41 Z" />
      <path d="M68 33 L68 49 L56 41 Z" />
    </g>

    {/* Mounting bracket, then the prism itself. */}
    <path d="M38 54 L38 66 L52 66 L52 54" stroke="#334155" strokeWidth="4.5" fill="none" strokeLinejoin="round" />
    <rect x="41" y="64" width="8" height="10" rx="1.5" fill="#334155" />
    <circle cx="45" cy="41" r="14.5" fill="#3f3f46" />
    <circle cx="45" cy="41" r="12.8" fill="#b91c1c" />
    <circle cx="45" cy="41" r="11" fill="url(#thanksgiving-prism-glass)" />
    <g stroke="#fecaca" strokeWidth="0.9" opacity="0.5">
      <path d="M37 33 L53 49" />
      <path d="M53 33 L37 49" />
    </g>
    <circle cx="45" cy="41" r="2" fill="#7f1d1d" />
    <path d="M38 35 A 8 8 0 0 1 46 31" stroke="#fff1f2" strokeWidth="1.7" strokeLinecap="round" opacity="0.6" fill="none" />
    <circle className="thanksgiving-glint" cx="41" cy="36" r="1.6" fill="#fff7ed" />
  </svg>
);

const HarvestScene = ({ isHalloween }: { isHalloween: boolean }) => (
  <>
    {/* Thanksgiving gets the dawn sky; Halloween keeps the homepage's dark backdrop. */}
    {!isHalloween && <DaytimeSky />}

    {/* Halloween still rises under the full moon. */}
    {isHalloween && (
      <div
        className="thanksgiving-moon pointer-events-none"
        style={{
          position: 'fixed',
          top: MOON_TOP,
          right: '3vw',
          width: MOON_SIZE,
          aspectRatio: '1 / 1',
          zIndex: 5,
          filter: 'drop-shadow(0 0 26px rgba(253, 230, 138, 0.3))',
        }}
        aria-hidden="true"
      >
        <FullMoon />
      </div>
    )}

    {isHalloween && <HalloweenMoonBats />}

    <div
      className="pointer-events-none"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: '300px', zIndex: 15 }}
      aria-hidden="true"
    >
      {CORN.map((corn, index) => (
        <div
          key={`corn-${index}`}
          className={`thanksgiving-sway absolute`}
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
          <CornStalk earOnLeft={corn.side === 'left'} />
        </div>
      ))}

      {WHEAT.map((wheat, index) => (
        <div
          key={`wheat-${index}`}
          className={`thanksgiving-sway absolute`}
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

      {/* Survey crew: total station on a tripod and a prism pole on a bipod. */}
      <div
        className={`thanksgiving-survey absolute`}
        style={{
          left: SURVEY_LEFT,
          bottom: 0,
          width: SURVEY_WIDTH,
          height: 'clamp(187px, 14.5vw, 268px)',
          // A soft ground shadow lifts the rig off the bright sky and hills.
          filter: 'drop-shadow(0 10px 16px rgba(8, 20, 13, 0.5))',
        }}
      >
        <TotalStation />
      </div>
      <div
        className={`thanksgiving-survey absolute`}
        style={{
          right: '12.2vw',
          bottom: 0,
          width: 'clamp(52px, 4.4vw, 74px)',
          height: 'clamp(170px, 13.6vw, 232px)',
        }}
      >
        <SurveyPole />
      </div>

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
        <div className="absolute inset-0">
          <HayBale />
        </div>
        <div style={{ position: 'absolute', left: '20%', bottom: '72%', width: '24%', aspectRatio: '100 / 92' }}>
          <Pumpkin id={2} carved={isHalloween} />
        </div>
        <div style={{ position: 'absolute', left: '48%', bottom: '74%', width: '19%', aspectRatio: '100 / 92' }}>
          <Pumpkin id={3} carved={isHalloween} />
        </div>
      </div>

      {PUMPKINS.map((pumpkin) => {
        // Halloween carves them and grows the patch: the jack-o'-lanterns are the focal point.
        const size = isHalloween ? Math.round(pumpkin.size * 1.42) : pumpkin.size;
        return (
          <div
            key={`pumpkin-${pumpkin.id}`}
            className="thanksgiving-pumpkin absolute"
            style={{
              [pumpkin.side]: pumpkin.offset,
              bottom: `${pumpkin.bottom}px`,
              width: `${size}px`,
              height: `${size * 0.92}px`,
              filter: isHalloween
                ? 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 16px rgba(251, 191, 36, 0.3))'
                : 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.35))',
              animation: `thanksgivingPumpkinBob ${6 + pumpkin.id}s ease-in-out ${pumpkin.delay}s infinite`,
              '--pumpkin-lean': `${pumpkin.id % 2 === 0 ? -2 : 2}deg`,
            } as React.CSSProperties}
          >
            <Pumpkin id={pumpkin.id} carved={isHalloween} />
          </div>
        );
      })}

      {GRASS.map((grass, index) => (
        <div
          key={`grass-${index}`}
          className={`thanksgiving-grass thanksgiving-sway absolute`}
          style={{
            [grass.side]: grass.offset,
            bottom: 0,
            width: `${grass.size}px`,
            height: `${grass.size * 0.9}px`,
            transformOrigin: '50% 100%',
            animation: `thanksgivingSway ${grass.duration}s ease-in-out ${grass.delay}s infinite alternate`,
            '--sway-angle': '2.2deg',
          } as React.CSSProperties}
        >
          <GrassTuft />
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
      @keyframes thanksgivingGlint {
        0%, 100% {
          opacity: 0.25;
        }
        50% {
          opacity: 1;
        }
      }
      .thanksgiving-glint {
        animation: thanksgivingGlint 3.6s ease-in-out infinite;
      }
      @keyframes halloweenMoonFlap {
        from {
          transform: scaleY(1);
        }
        to {
          transform: scaleY(0.6);
        }
      }
      @keyframes halloweenMoonPass {
        0% {
          left: -24%;
          opacity: 0;
          transform: translateY(5%) scale(0.86);
        }
        10% {
          opacity: 1;
        }
        50% {
          transform: translateY(-5%) scale(1.02);
        }
        90% {
          opacity: 1;
        }
        100% {
          left: 124%;
          opacity: 0;
          transform: translateY(4%) scale(0.9);
        }
      }
      .halloween-moon-pass {
        position: absolute;
        animation-name: halloweenMoonPass;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
        line-height: 1;
        filter: brightness(0);
        will-change: left, opacity;
      }
      @keyframes thanksgivingPumpkinBob {
        0%, 100% {
          transform: translateY(0) rotate(var(--pumpkin-lean, 0deg));
        }
        50% {
          transform: translateY(-4px) rotate(var(--pumpkin-lean, 0deg));
        }
      }
      @media (max-width: 1099px) {
        .thanksgiving-survey {
          display: none;
        }
      }
      @media (max-width: 767px) {
        .thanksgiving-pumpkin,
        .thanksgiving-grass {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .thanksgiving-sway,
        .thanksgiving-pumpkin,
        .thanksgiving-glint {
          animation: none !important;
        }
        .halloween-moon-pass {
          display: none;
        }
      }
    `}</style>
  </>
);

const ThanksgivingEffects = ({ theme = 'thanksgiving' }: ThanksgivingEffectsProps) => (
  <HarvestScene isHalloween={theme === 'halloween'} />
);

export default ThanksgivingEffects;
