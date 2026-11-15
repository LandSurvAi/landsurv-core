import { TOS_SECTIONS, type TosSectionData } from './tosContent.ts';

/**
 * Free CAD Trial Terms
 *
 * A short trial-specific layer built on the authoritative TOS. The selected
 * sections are rendered verbatim so the trial and the full agreement cannot
 * drift. Counsel should review the selected set, the intro, and the bullets.
 */

export const TRIAL_TERMS_VERSION = '1.1';
export const TRIAL_TERMS_EFFECTIVE_DATE = 'November 14, 2026';

export const TRIAL_TERMS_INTRO =
  'Free CAD is a limited trial for evaluation. It is not a professional service and does not create a signed agreement. Draw, use the full workspace, and save your work. The trial includes 20 assistant prompts on this device; up to 5 can process deeds. When the prompts are used, drawing, editing, saving, and exports still work; only the assistant pauses until you add a key or move to Business CAD.';

export const TRIAL_TERMS_BULLETS = [
  'Draw, edit, and use the CAD workspace, including surfaces, print-ready sheets, project copy-out, and files for other drafting programs.',
  'Save and reopen project files, use local autosave, and export point lists.',
  '20 assistant prompts per device, shared across general chat and text agents. Up to 5 of those prompts can be used for deed processing.',
  'When the 20 prompts are used, drawing, editing, saving, and exports still work. Inference pauses until you add a key or use Business CAD.',
  'Assistant output is probabilistic and must be verified by a qualified professional.',
];

/**
 * These sections carry the risk-critical statements the trial relies on:
 * software-tool status, limited license, AI verification, keys/allowances,
 * acceptable use, privacy, warranty, liability, indemnity, venue, and disputes.
 */
export const TRIAL_TERMS_EXCERPT_NUMBERS = [
  '3',
  '4',
  '6',
  '7',
  '10',
  '14',
  '16',
  '17',
  '18',
  '21',
  '22',
] as const;

export interface TrialTermsExcerpt {
  number: string;
  title: string;
  paragraphs: string[];
  bullets?: TosSectionData['bullets'];
  footerParagraphs?: string[];
}

export function getTrialTermsExcerpts(): TrialTermsExcerpt[] {
  const wanted = new Set<string>(TRIAL_TERMS_EXCERPT_NUMBERS);
  return TOS_SECTIONS
    .filter((section) => wanted.has(section.number))
    .map((section) => ({
      number: section.number,
      title: section.title.replace(/^\d+\.\s*/, ''),
      paragraphs: section.paragraphs,
      bullets: section.bullets,
      footerParagraphs: section.footerParagraphs,
    }));
}
