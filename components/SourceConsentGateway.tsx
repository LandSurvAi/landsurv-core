/**
 * @deprecated v1.2 — the consent-gateway flow has been removed.
 *
 * The app no longer routes TOS-restricted hosts through a per-fetch human
 * consent modal. Restricted hosts are now hard-blocked at the clawClient
 * layer (utils/clawCompliance.ts → RESTRICTED_HOST_SUFFIXES) and the user
 * is informed of any blocked attempt by the SourceBlockedNotice toast.
 *
 * This file re-exports the new toast component so any lingering import of
 * `SourceConsentGateway` continues to compile and render the correct UI.
 * Update call sites to import `SourceBlockedNotice` directly when convenient.
 */
export { default } from './SourceBlockedNotice';
