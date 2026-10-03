import React, { useEffect, useState } from 'react';

interface PrivacyRotatorProps {
  /** Optional suffix text rendered after the rotating phrase. */
  suffix?: React.ReactNode;
  /** Tailwind size class for the pill (defaults to compact). */
  className?: string;
}

const PHRASES = ['No Sign-Ups', 'No Logins', 'No Persistent Cloud Storage'];

/**
 * Subtle, professional privacy pill that rotates through the local-first
 * promises. Matches the rest of the dark glassy UI — no green dot, no emoji.
 */
const PrivacyRotator: React.FC<PrivacyRotatorProps> = ({ suffix, className = '' }) => {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setFade(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % PHRASES.length);
        setFade(true);
      }, 220);
    }, 2400);
    return () => window.clearInterval(tick);
  }, []);

  return (
    <span
      className={
        'inline-flex items-center gap-2 px-3 py-1 rounded-full ' +
        'bg-gray-900/60 border border-gray-700/70 backdrop-blur-sm ' +
        'text-xs sm:text-sm font-medium text-gray-200 ' +
        'light-theme:bg-white/70 light-theme:border-gray-300 light-theme:text-gray-700 ' +
        className
      }
    >
      <span
        aria-hidden="true"
        className="inline-block min-w-[6.5rem] sm:min-w-[7.5rem] text-center text-cyan-300 light-theme:text-cyan-700 transition-opacity duration-200"
        style={{ opacity: fade ? 1 : 0 }}
      >
        {PHRASES[index]}
      </span>
      {suffix ? <span className="text-gray-400 light-theme:text-gray-600">{suffix}</span> : null}
    </span>
  );
};

export default PrivacyRotator;
