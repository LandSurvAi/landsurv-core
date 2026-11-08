import React from 'react';

interface ScoutHikerProps {
  /** Animate the walk cycle only while Scout is actively resolving sources. */
  running: boolean;
  /** Slightly shorter scene for the inline Quick Thought card. */
  compact?: boolean;
  className?: string;
}

/**
 * Scout's live avatar: a little surveyor in a bucket hat and tee, walking a
 * ridgeline with a prism pole while the public-GIS search is running.
 *
 * The far and near ridges are duplicated and translated by exactly one tile
 * width, so the landscape loops seamlessly. All motion is CSS-driven and is
 * disabled by the reduced-motion rules in index.css.
 */
export const ScoutHiker: React.FC<ScoutHikerProps> = ({
  running,
  compact = false,
  className = '',
}) => {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const skyId = `scout-sky-${uid}`;
  const moonGlowId = `scout-moon-glow-${uid}`;
  const farRidgeId = `scout-far-ridge-${uid}`;
  const nearRidgeId = `scout-near-ridge-${uid}`;
  const farFillId = `scout-far-fill-${uid}`;
  const nearFillId = `scout-near-fill-${uid}`;
  const shirtFillId = `scout-shirt-fill-${uid}`;
  const pantsFillId = `scout-pants-fill-${uid}`;

  return (
    <div
      data-testid="scout-hiker"
      data-running={running ? 'true' : 'false'}
      className={`scout-scene relative w-full overflow-hidden ${compact ? 'h-[76px]' : 'h-[96px]'} ${running ? 'scout-scene-running' : ''} ${className}`.trim()}
    >
      <svg
        viewBox="0 0 720 140"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={running
          ? 'Scout hiking up an endless mountain ridge while thinking'
          : 'Scout standing on a mountain ridge'}
        className="h-full w-full"
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020a14" />
            <stop offset="100%" stopColor="#0a2033" />
          </linearGradient>
          <radialGradient id={moonGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={farFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10314d" />
            <stop offset="100%" stopColor="#071728" />
          </linearGradient>
          <linearGradient id={nearFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b2238" />
            <stop offset="100%" stopColor="#040e19" />
          </linearGradient>
          <linearGradient id={shirtFillId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
          <linearGradient id={pantsFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
          <path
            id={farRidgeId}
            d="M0 112 L24 94 L48 105 L74 82 L100 102 L126 88 L152 108 L180 80 L206 100 L232 86 L258 106 L286 90 L312 104 L338 84 L364 102 L390 88 L416 106 L442 82 L468 100 L494 90 L520 108 L546 88 L572 104 L598 84 L624 102 L650 92 L676 108 L702 88 L720 112 L720 140 L0 140 Z"
          />
          <path
            id={nearRidgeId}
            d="M0 126 L18 122 L40 126 L62 118 L86 125 L110 120 L134 126 L158 117 L182 124 L206 119 L230 126 L254 118 L278 125 L302 120 L326 123 L350 120 L374 121 L398 119 L422 124 L446 117 L470 125 L494 120 L518 126 L542 118 L566 125 L590 120 L614 127 L638 121 L662 126 L686 119 L710 124 L720 126 L720 140 L0 140 Z"
          />
        </defs>

        <rect width="720" height="140" fill={`url(#${skyId})`} />
        <circle cx="610" cy="32" r="31" fill={`url(#${moonGlowId})`} />
        <circle cx="610" cy="32" r="10" fill="#bae6fd" opacity="0.92" />
        <circle cx="614" cy="29" r="8" fill="#0a2033" opacity="0.94" />

        <g fill="#a5f3fc">
          <circle className="scout-star" cx="86" cy="30" r="1.6" />
          <circle className="scout-star" cx="142" cy="52" r="1.1" style={{ animationDelay: '0.7s' }} />
          <circle className="scout-star" cx="224" cy="26" r="1.4" style={{ animationDelay: '1.4s' }} />
          <circle className="scout-star" cx="468" cy="42" r="1.2" style={{ animationDelay: '2.1s' }} />
          <circle className="scout-star" cx="536" cy="24" r="1.7" style={{ animationDelay: '1.1s' }} />
          <circle className="scout-star" cx="664" cy="48" r="1.3" style={{ animationDelay: '0.4s' }} />
          <path
            className="scout-star"
            d="M506 19 L507.2 22.8 L511 24 L507.2 25.2 L506 29 L504.8 25.2 L501 24 L504.8 22.8 Z"
            fill="#67e8f9"
            style={{ animationDelay: '1.8s' }}
          />
        </g>

        <g className="scout-terrain-far">
          <use href={`#${farRidgeId}`} fill={`url(#${farFillId})`} />
          <use href={`#${farRidgeId}`} x={720} fill={`url(#${farFillId})`} />
          <g fill="#bae6fd" opacity="0.2">
            <path d="M74 82 L83 93 L65 93 Z" />
            <path d="M180 80 L189 92 L171 92 Z" />
            <path d="M442 82 L451 94 L433 94 Z" />
            <path d="M598 84 L607 96 L589 96 Z" />
          </g>
          <g transform="translate(720 0)" fill="#bae6fd" opacity="0.2">
            <path d="M74 82 L83 93 L65 93 Z" />
            <path d="M180 80 L189 92 L171 92 Z" />
            <path d="M442 82 L451 94 L433 94 Z" />
            <path d="M598 84 L607 96 L589 96 Z" />
          </g>
        </g>

        <g className="scout-terrain-near">
          <use href={`#${nearRidgeId}`} fill={`url(#${nearFillId})`} />
          <use href={`#${nearRidgeId}`} x={720} fill={`url(#${nearFillId})`} />
        </g>

        <path
          className="scout-trail"
          d="M0 129 C40 124 80 130 120 125 C160 120 200 127 240 122 C280 117 320 123 360 120 C400 117 440 124 480 120 C520 116 560 125 600 121 C640 117 680 126 720 122"
          fill="none"
          stroke="#67e8f9"
          strokeWidth="1.5"
          strokeDasharray="5 9"
          strokeLinecap="round"
          opacity="0.42"
        />

        <g fill="none" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" opacity="0.55">
          <path className="scout-speed" d="M252 104 H300" />
          <path className="scout-speed" d="M266 111 H320" style={{ animationDelay: '0.35s' }} />
          <path className="scout-speed" d="M242 118 H284" style={{ animationDelay: '0.7s' }} />
        </g>

        <g transform="translate(360 0)">
          <ellipse cx="0" cy="121" rx="20" ry="3.2" fill="#020617" opacity="0.6" />

          <g className="scout-body">
            <g className="scout-leg scout-leg-back">
              <path
                d="M-3 84 L-10 101 L-15 117"
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M-20 116 H-9 L-7 121 H-22 Z"
                fill="#b45309"
                stroke="#7c2d12"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </g>

            <g className="scout-leg scout-leg-front">
              <path
                d="M3 84 L10 100 L15 116"
                fill="none"
                stroke="#2563eb"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 115 H21 L23 120 H8 Z"
                fill="#d97706"
                stroke="#7c2d12"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </g>

            <path
              d="M-14 80 Q0 77 14 80 L15 94 L3 97 L0 86 L-3 97 L-15 94 Z"
              fill={`url(#${pantsFillId})`}
              stroke="#1e3a8a"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <path
              d="M-14 80 Q0 77 14 80"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.7"
            />

            <g className="scout-arm scout-arm-back">
              <path
                d="M-12 62 L-23 77 L-29 90"
                fill="none"
                stroke="#f8d7a3"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="-29" cy="90" r="3" fill="#f8d7a3" />
            </g>

            <path
              d="M-15 56 Q0 49 15 56 L19 82 Q0 88 -19 82 Z"
              fill={`url(#${shirtFillId})`}
              stroke="#c2410c"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <path d="M-15 56 L-26 64 L-22 73 L-15 68 Z" fill="#ea580c" stroke="#c2410c" strokeWidth="1" />
            <path d="M15 56 L26 64 L22 73 L15 68 Z" fill="#f97316" stroke="#c2410c" strokeWidth="1" />
            <path
              d="M-6 54 Q0 58 6 54"
              fill="none"
              stroke="#ffedd5"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M-8 73 L-2 62 L3 70 L7 64 L12 75 Z" fill="#fff7ed" opacity="0.95" />
            <circle cx="9" cy="61" r="2.5" fill="#fde68a" />

            <line x1="0" y1="49" x2="0" y2="56" stroke="#f8d7a3" strokeWidth="4" strokeLinecap="round" />
            <circle cx="0" cy="40" r="9.5" fill="#f8d7a3" stroke="#0f172a" strokeWidth="1" />

            <path
              d="M-8 38 H-1 Q0 38 0 39.5 V40.5 Q0 43.5 -3 43.5 H-6 Q-8 43.5 -8 41 Z"
              fill="#020617"
            />
            <path
              d="M0 39.5 Q0 38 1 38 H8 V41 Q8 43.5 6 43.5 H3 Q0 43.5 0 40.5 Z"
              fill="#020617"
            />
            <path
              d="M-6.5 39.5 H-3.5"
              stroke="#67e8f9"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.8"
            />
            <path
              d="M-2 46 Q0 47.5 3 46"
              fill="none"
              stroke="#92400e"
              strokeWidth="1.2"
              strokeLinecap="round"
            />

            <path
              d="M-12 33 Q-11 20 0 19 Q11 20 12 33 Z"
              fill="#facc15"
              stroke="#a16207"
              strokeWidth="1"
            />
            <path
              d="M-19 33 Q0 39 19 33 Q18 29 14 29 H-14 Q-18 29 -19 33 Z"
              fill="#fde047"
              stroke="#a16207"
              strokeWidth="1"
            />
            <path d="M-12 30 H12" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
            <circle cx="0" cy="19" r="1.5" fill="#a16207" />

            <g className="scout-arm scout-arm-front">
              <path
                d="M12 62 L22 77 L30 90"
                fill="none"
                stroke="#f8d7a3"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            <g className="scout-pole">
              <line x1="33" y1="18" x2="33" y2="122" stroke="#e2e8f0" strokeWidth="3.4" strokeLinecap="round" />
              <line x1="33" y1="30" x2="33" y2="42" stroke="#fb7185" strokeWidth="3.4" />
              <line x1="33" y1="54" x2="33" y2="66" stroke="#fb7185" strokeWidth="3.4" />
              <line x1="33" y1="78" x2="33" y2="90" stroke="#fb7185" strokeWidth="3.4" />
              <line x1="33" y1="102" x2="33" y2="114" stroke="#fb7185" strokeWidth="3.4" />
              <rect
                x="27"
                y="10"
                width="12"
                height="8"
                rx="2"
                fill="#22d3ee"
                stroke="#a5f3fc"
                strokeWidth="1"
              />
              <line x1="33" y1="18" x2="33" y2="10" stroke="#94a3b8" strokeWidth="1.5" />
              <circle cx="33" cy="90" r="3.2" fill="#f8d7a3" />
              <circle cx="33" cy="122" r="2.2" fill="#fb7185" />
            </g>

            <g className="scout-thoughts">
              <path
                d="M-20 14 Q-20 10 -26 10 H-56 Q-62 10 -62 16 V25 Q-62 31 -56 31 H-34 Q-30 31 -27 28 L-17 37 L-22 27 Q-20 25 -20 22 Z"
                fill="#071522"
                stroke="#22d3ee"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <circle className="scout-thought-dot" cx="-49" cy="20.5" r="2" fill="#67e8f9" />
              <circle
                className="scout-thought-dot"
                cx="-41"
                cy="20.5"
                r="2"
                fill="#67e8f9"
                style={{ animationDelay: '0.18s' }}
              />
              <circle
                className="scout-thought-dot"
                cx="-33"
                cy="20.5"
                r="2"
                fill="#67e8f9"
                style={{ animationDelay: '0.36s' }}
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
};

export default ScoutHiker;
