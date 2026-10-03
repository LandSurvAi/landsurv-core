import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SignatureForm, SignatureRecord } from './SignatureForm.tsx';

/**
 * LegalAgreementGate — first-time user agreement modal.
 *
 * Shown the FIRST time a user clicks an agent (after splash + API key screen).
 * Blocks all app use until the user acknowledges the conditions (step 1) and then
 * enters name + email and draws a signature (step 2). After signing,
 * hasSignedLegalAgreement() returns true and this gate never appears again on this device.
 *
 * The legal copy here mirrors the highlights from legal.landsurv.ai but is
 * condensed for in-app review. Users can visit legal.landsurv.ai for the full
 * document.
 */

interface LegalAgreementGateProps {
  onSigned: (record: SignatureRecord) => void;
}

export const LegalAgreementGate: React.FC<LegalAgreementGateProps> = ({ onSigned }) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const checkScrolledToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 8) setHasScrolledToEnd(true);
  }, []);

  // Covers the case where the content fits without scrolling.
  useEffect(() => {
    if (acknowledged) return;
    checkScrolledToEnd();
    window.addEventListener('resize', checkScrolledToEnd);
    return () => window.removeEventListener('resize', checkScrolledToEnd);
  }, [acknowledged, checkScrolledToEnd]);

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-gray-800 border border-cyan-500/30 rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header — uses official LandSurv.ai branding */}
        <div className="px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h1 className="text-3xl font-extrabold tracking-tighter text-gray-100">
            Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span>
          </h1>
          <p className="text-sm text-gray-300 mt-1">
            {acknowledged
              ? 'Conditions acknowledged. Add your signature to continue. This is a one-time step on this device.'
              : 'One more thing before we begin. Please review the conditions below. This is a one-time step on this device.'}
          </p>
        </div>

        {acknowledged ? (
          <SignatureForm onSigned={onSigned} onBack={() => setAcknowledged(false)} compact />
        ) : (
          <>
            {/* Scrollable body */}
            <div ref={scrollRef} onScroll={checkScrolledToEnd} className="px-6 py-5 overflow-y-auto flex-1 min-h-0 space-y-5">
              <div className="bg-cyan-900/20 border border-cyan-500/40 rounded-lg p-4">
                <h2 className="font-bold text-cyan-300 mb-1">Terms of Use — Summary</h2>
                <p className="text-sm text-cyan-100/90 leading-relaxed">
                  LandSurv.ai is a <strong>software tool</strong>, not a licensed surveyor or engineer. Anyone
                  may use it — no professional license is required. You are responsible for verifying any output
                  before relying on it for regulated, legal, or boundary purposes.
                </p>
              </div>

              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex gap-2"><span className="text-green-400 font-bold">✓</span><span>LandSurv.ai is a productivity tool — comparable to Civil 3D, AutoCAD, or a TI calculator — available to professionals, students, and the general public alike. <strong>No license is required to use it.</strong></span></li>
                <li className="flex gap-2"><span className="text-red-400 font-bold">✗</span><span>LandSurv.ai does <strong>not</strong> practice land surveying or civil engineering, and does <strong>not</strong> produce legally binding surveys or certifications.</span></li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">✓</span><span>Any output relied upon for <strong>legal, regulatory, boundary, design, or construction</strong> purposes must be independently verified — typically by a qualified licensed professional in the relevant jurisdiction. You are solely responsible for verifying any results you rely on.</span></li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">✓</span><span>As a <strong>Pennsylvania-based business</strong>, LandSurv.ai is committed to complying with all applicable rules, regulations, and professional practice statutes (63 Pa. C.S. § 501 et seq.) governing the responsible delivery of geospatial software.</span></li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">✓</span><span>LandSurv.ai maintains a security/privacy program aligned with <strong>SOC 2</strong> and <strong>GDPR</strong> principles, including access controls, audit logging, and data-rights workflows (access/export/delete where applicable).</span></li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">✓</span><span>Advanced model features such as <strong>Claude Fable 5</strong> on Vertex AI may require additional platform safety terms, including temporary prompt/output retention and safety review by the cloud provider for abuse/policy enforcement as documented in provider terms. You agree to use these features in compliance with applicable acceptable-use and generative-AI use policies.</span></li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">✓</span><span>Claude model use is subject to <strong>Anthropic Usage Policy</strong> restrictions. Prohibited use cases are not allowed, and high-risk use cases require qualified human review and AI-use disclosure where applicable.</span></li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">✓</span><span>You are at least <strong>18 years old</strong>.</span></li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">✓</span><span>You agree to receive occasional <strong>LandSurv.ai product update emails</strong> at the address you provide. You can unsubscribe at any time using the link in any email.</span></li>
                <li className="flex gap-2"><span className="text-gray-400 font-bold">›</span><span>Provided &quot;as is&quot; without warranties. The full legal terms are available at <a href="https://legal.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">legal.landsurv.ai</a>.</span></li>
              </ul>

              <p className="text-xs text-amber-200/80">
                <strong className="text-amber-300">One-time agreement.</strong> Your signature, name, and email will be stored on this device as proof of agreement.
              </p>
            </div>

            {/* Fixed footer — always visible */}
            <div className="px-6 py-4 border-t border-gray-700 bg-gray-800 flex-shrink-0">
              <button
                type="button"
                disabled={!hasScrolledToEnd}
                onClick={() => setAcknowledged(true)}
                className="w-full py-3 px-6 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-lg disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-600"
              >
                {hasScrolledToEnd ? 'I acknowledge all of the conditions above' : 'Scroll to the bottom to continue'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LegalAgreementGate;
