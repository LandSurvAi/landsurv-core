/**
 * Open-source / local-mode build detection.
 *
 * Set via the Vite mode flag (`vite --mode oss`, see package.json `dev:oss` /
 * `build:oss` scripts) rather than a dedicated env var, so no extra tooling
 * (e.g. cross-env) is needed for it to work the same on Windows/macOS/Linux.
 */
export function isOssBuild(): boolean {
  const mode = (import.meta as any)?.env?.MODE;
  return mode === 'oss' || String((import.meta as any)?.env?.VITE_OSS_BUILD || '').toLowerCase() === 'true';
}
