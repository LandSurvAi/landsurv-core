// UploadShell.tsx
// Shared frame + primitives for every agent intake ("upload") screen.
//
// Design language: "colorful and fun meets dark-mode CAD".
//   - Background: lifted slate-navy (#101b28 → #0a0f16) with an accent glow,
//     a cool secondary glow, and a faint technical grid.
//   - One centered column, max-w-3xl, with a compact identity header.
//   - Cards: #111c28 at 85% with brighter hairline borders and a colored edge.
//   - A single accent per agent, exposed as the CSS variable `--up-accent`
//     so Tailwind arbitrary values can theme any child.
//   - Navigation lives in the app sidebar, so there is no back button here.

import React, { createContext, useContext, useRef } from 'react';
import { UploadIcon } from './icons.tsx';

/**
 * Context indicating that an upload/intake component is being rendered
 * inline inside an agent chat message via A2UI rather than as a standalone
 * full-screen page.
 */
export const A2UIEmbeddedContext = createContext<boolean>(false);

const hexToRgba = (hex: string, alpha: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!result) return `rgba(56, 189, 248, ${alpha})`;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

interface UploadShellProps {
  /** Agent glyph rendered in the identity chip. */
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Accent color as a hex string, e.g. "#34d399". Threads through `--up-accent`. */
  accent: string;
  /** Primary title text (before the accented word). */
  title: string;
  /** Optional trailing word painted in the agent accent. */
  accentWord?: string;
  /** One-line description shown under the title. */
  description?: React.ReactNode;
  /** Kept for call sites that still pass it — navigation lives in the sidebar. */
  onGoBack?: () => void;
  backTitle?: string;
  /** Optional right-aligned header content (e.g. plan badge). */
  headerRight?: React.ReactNode;
  /** Column width. Defaults to a comfortable single-column 3xl. */
  widthClassName?: string;
  children: React.ReactNode;
}

export const UploadShell: React.FC<UploadShellProps> = ({
  icon: Icon,
  accent,
  title,
  accentWord,
  description,
  headerRight,
  widthClassName = 'max-w-3xl',
  children,
}) => {
  const isEmbedded = useContext(A2UIEmbeddedContext);

  if (isEmbedded) {
    return (
      <div
        data-a2ui-shell="embedded"
        className="relative flex w-full flex-col rounded-xl border border-white/[0.12] bg-[#0b131e]/95 p-3 text-slate-200 shadow-lg"
        style={{
          '--up-accent': accent,
          '--up-accent-soft': hexToRgba(accent, 0.16),
          '--up-accent-line': hexToRgba(accent, 0.34),
        } as React.CSSProperties}
      >
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border"
              style={{ borderColor: hexToRgba(accent, 0.4), backgroundColor: hexToRgba(accent, 0.14) }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
            </span>
            <span className="truncate text-[12px] font-semibold text-slate-100">
              {title}
              {accentWord && <span style={{ color: accent }}>{accentWord}</span>}
            </span>
            <span
              className="rounded border px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.14em]"
              style={{
                borderColor: hexToRgba(accent, 0.38),
                backgroundColor: hexToRgba(accent, 0.12),
                color: accent,
              }}
            >
              AI
            </span>
          </div>
          {headerRight}
        </div>
        <div className="flex flex-col gap-2.5">{children}</div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-y-auto bg-gradient-to-b from-[#111c29] via-[#0d1721] to-[#0a0f16] text-slate-200"
      style={{
        '--up-accent': accent,
        '--up-accent-soft': hexToRgba(accent, 0.16),
        '--up-accent-line': hexToRgba(accent, 0.34),
      } as React.CSSProperties}
    >
      {/* Ambient color: two soft glows + a technical grid for depth. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-52 left-1/2 h-[440px] w-[880px] -translate-x-1/2 rounded-full opacity-40 blur-[120px]"
          style={{ backgroundColor: accent }}
        />
        <div className="absolute -bottom-40 -right-24 h-[380px] w-[520px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute -left-24 top-1/3 h-[260px] w-[320px] rounded-full bg-indigo-500/15 blur-[110px]" />
        <div
          className="absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(ellipse at 50% 0%, black 18%, transparent 76%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 18%, transparent 76%)',
          }}
        />
      </div>

      <main className="relative z-10 flex flex-1 justify-center px-5 pb-12 pt-1 sm:pt-4">
        <div className={`flex w-full flex-col ${widthClassName}`}>
          <div className="mb-4 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: accent, boxShadow: `0 0 10px ${hexToRgba(accent, 0.85)}` }}
            />
            <span className="text-[9px] font-bold uppercase tracking-[0.26em] text-slate-400/80">Agent Workspace</span>
            <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-white/[0.12] to-transparent" />
            {headerRight}
          </div>
          <div className="flex items-start gap-3.5">
            <span
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              style={{ borderColor: hexToRgba(accent, 0.4), backgroundColor: hexToRgba(accent, 0.12) }}
            >
              <Icon className="h-[22px] w-[22px]" style={{ color: accent }} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-50 sm:text-[30px]">
                {title}
                {accentWord && <span style={{ color: accent }}>{accentWord}</span>}
              </h1>
              {description && (
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-300/80">{description}</p>
              )}
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3.5">{children}</div>
        </div>
      </main>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

interface UploadPanelProps {
  title?: string;
  /** Small caps label shown above the panel title. */
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const UploadPanel: React.FC<UploadPanelProps> = ({ title, eyebrow, action, className = '', children }) => {
  const isEmbedded = useContext(A2UIEmbeddedContext);
  return (
    <section
      className={`relative overflow-hidden rounded-xl border border-white/[0.11] bg-[#111c28]/85 shadow-[0_22px_60px_-34px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, var(--up-accent-line), transparent)' }}
      />
      {(title || eyebrow || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-3.5 py-2">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[color:var(--up-accent)]/80">{eyebrow}</p>
            )}
            {title && <h2 className="truncate text-[13px] font-semibold text-slate-100">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className={isEmbedded ? 'p-3' : 'p-4'}>{children}</div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Dropzone                                                            */
/* ------------------------------------------------------------------ */

interface UploadDropzoneProps {
  id?: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnter?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  isDragging?: boolean;
  title: string;
  hint?: React.ReactNode;
  /** Custom glyph; defaults to the upload arrow. */
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Extra controls rendered under the hint (folder pickers etc.). */
  children?: React.ReactNode;
  disabled?: boolean;
  /** Optional click override when the caller owns its own file input ref. */
  onClick?: () => void;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  id,
  accept,
  multiple,
  onFiles,
  onDrop,
  onDragEnter,
  onDragLeave,
  isDragging = false,
  title,
  hint,
  icon: Icon = UploadIcon,
  children,
  disabled = false,
  onClick,
}) => {
  const isEmbedded = useContext(A2UIEmbeddedContext);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openPicker = () => {
    if (disabled) return;
    if (onClick) {
      onClick();
      return;
    }
    if (inputRef.current) {
      inputRef.current.click();
      return;
    }
    if (id) document.getElementById(id)?.click();
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={onDrop}
      onClick={openPicker}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={title}
      className={`group relative flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed ${
        isEmbedded ? 'px-4 py-4' : 'px-6 py-9'
      } text-center transition-colors duration-150 ${
        disabled
          ? 'cursor-not-allowed border-white/[0.07] bg-white/[0.02] opacity-60'
          : isDragging
            ? 'border-[color:var(--up-accent)] bg-[var(--up-accent-soft)]'
            : 'border-white/[0.16] bg-white/[0.03] hover:border-[color:var(--up-accent)] hover:bg-white/[0.055]'
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, var(--up-accent-soft), transparent 70%)' }}
      />
      {id && (
        <input ref={inputRef} id={id} type="file" className="hidden" accept={accept} multiple={multiple} onClick={(e) => e.stopPropagation()} onChange={(e) => onFiles(e.target.files)} />
      )}
      <span
        className={`relative ${isEmbedded ? 'mb-2 h-8 w-8' : 'mb-3 h-11 w-11'} flex items-center justify-center rounded-lg border transition-colors group-hover:border-[color:var(--up-accent)]`}
        style={{ borderColor: 'var(--up-accent-line)', backgroundColor: 'var(--up-accent-soft)' }}
        aria-hidden="true"
      >
        <Icon className={isEmbedded ? 'h-4 w-4 text-[color:var(--up-accent)]' : 'h-5 w-5 text-[color:var(--up-accent)]'} />
      </span>
      <p className="relative text-[13.5px] font-semibold text-slate-100">{title}</p>
      {hint && <p className="relative mt-1 text-[11.5px] leading-relaxed text-slate-400">{hint}</p>}
      <div className="relative">{children}</div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

interface UploadButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const UploadPrimaryButton: React.FC<UploadButtonProps> = ({ children, className = '', ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-[12.5px] font-bold text-[#06101a] shadow-[0_12px_26px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    style={{ backgroundColor: 'var(--up-accent)' }}
  >
    {children}
  </button>
);

export const UploadGhostButton: React.FC<UploadButtonProps> = ({ children, className = '', ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.14] bg-white/[0.04] px-3.5 text-[12px] font-medium text-slate-200 transition-colors hover:border-[color:var(--up-accent)] hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
  >
    {children}
  </button>
);

/** Bottom action row: optional left-side note plus right-aligned actions. */
export const UploadActionBar: React.FC<{ note?: React.ReactNode; children: React.ReactNode }> = ({ note, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
    <div className="min-w-0 text-[11.5px] text-slate-400">{note}</div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Mode switch                                                         */
/* ------------------------------------------------------------------ */

export const UploadModeSwitch = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) => (
  <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.10] bg-black/25 p-0.5">
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-[6px] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
            isActive
              ? 'text-[color:var(--up-accent)] ring-1 ring-inset ring-[color:var(--up-accent)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          style={isActive ? { backgroundColor: 'var(--up-accent-soft)' } : undefined}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

/* ------------------------------------------------------------------ */
/* Selected-file list                                                  */
/* ------------------------------------------------------------------ */

export interface UploadFileRow {
  key: string | number;
  name: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}

export const UploadFileList: React.FC<{ files: UploadFileRow[]; title?: string }> = ({ files, title = 'Selected files' }) => {
  if (files.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/[0.10] bg-[#0c1520]">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{title}</span>
        <span className="font-mono text-[10px] text-[color:var(--up-accent)]">{files.length}</span>
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {files.map((file) => (
          <li key={file.key} className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.03]">
            <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{file.name}</span>
            {file.meta && <span className="flex-shrink-0 text-[11px] text-slate-400">{file.meta}</span>}
            {file.action}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UploadShell;
