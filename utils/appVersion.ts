/**
 * Single source of truth for the app version string.
 *
 * Bump this constant on every release. The value is consumed by:
 *   - App.tsx (header + SessionState.version on save)
 *   - utils/lsvzSchema.ts → renderExampleManifest() for the docs example
 *   - components/LsvzDocumentationContent.tsx for the "Structure (Version …)"
 *     heading
 *
 * Format: YY.MM.DD.patch  (e.g. "26.05.17.20")
 */
export const APP_VERSION = "26.10.01.01";

