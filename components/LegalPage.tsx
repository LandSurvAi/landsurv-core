import React, { useState } from 'react';
import { XMarkIcon } from './icons';

interface LegalPageProps {
  onClose: () => void;
}

const LegalPage: React.FC<LegalPageProps> = ({ onClose }) => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  return (
    <div
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[101] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-amber-700/60 rounded-lg shadow-2xl max-w-2xl w-full flex flex-col animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-gray-700 light-theme:border-gray-300 flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
            <h2 className="text-xl font-bold text-amber-400">Legal &amp; Compliance</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700 light-theme:hover:bg-gray-200"
            aria-label="Close Legal Page"
          >
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>

        {/* Body */}
        <main
          className="p-6 text-gray-300 space-y-5 max-h-[72vh] overflow-y-auto scrollbar-hide light-theme:text-gray-700 relative"
          onScroll={() => setShowScrollIndicator(false)}
        >
          {/* Key notice */}
          <div className="bg-amber-900/30 border border-amber-600/40 rounded-lg p-4">
            <p className="font-bold text-amber-300 mb-1 text-sm">Important Notice</p>
            <p className="text-amber-200/80 text-sm leading-relaxed">
              LandSurv.ai <strong>does not</strong> practice land surveying, civil engineering, or any
              other profession regulated by a state licensing board. It is a software tool designed
              to be used <em>by</em> licensed professionals — not a substitute for them.
            </p>
          </div>

          {/* Section: What LandSurv.ai is */}
          <div>
            <h3 className="font-semibold text-white mb-1">What LandSurv.ai Is</h3>
            <p className="text-sm leading-relaxed">
              LandSurv.ai is a web-based software application that uses artificial intelligence to
              assist licensed land surveyors, civil engineers, and related geospatial professionals.
              It is a <strong className="text-white">tool</strong> — in the same category as CAD
              software, spreadsheet applications, field calculators, and other productivity software
              used by professionals to work more efficiently.
            </p>
          </div>

          {/* Section: What it is NOT */}
          <div>
            <h3 className="font-semibold text-white mb-2">What LandSurv.ai Is Not</h3>
            <ul className="space-y-1.5">
              {[
                'A licensed land surveyor or professional land surveying firm.',
                'A licensed professional engineer or engineering firm.',
                'A provider of professional surveying or engineering services.',
                'An autonomous decision-making system.',
                'A replacement for licensed professional judgment.',
                'A source of legally binding survey plats, boundary determinations, or engineering certifications.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Section: Not Autonomous */}
          <div>
            <h3 className="font-semibold text-white mb-1">Not Autonomous — Human Oversight Required</h3>
            <p className="text-sm leading-relaxed">
              LandSurv.ai is not autonomous. Every feature requires a human operator to initiate
              tasks, interpret results, apply professional judgment, and take responsibility for any
              output used in practice. All AI-generated output must be independently reviewed and
              verified by a qualified, licensed professional before being relied upon for any legal,
              regulatory, design, boundary, or construction purpose.
            </p>
          </div>

          {/* Section: State Licensing */}
          <div>
            <h3 className="font-semibold text-white mb-1">State Professional Licensing Compliance</h3>
            <p className="text-sm leading-relaxed">
              The practice of land surveying and civil engineering is regulated at the state level.
              LandSurv.ai does not offer professional surveying or engineering services — it provides
              software functionality. Users are solely responsible for ensuring their use of
              LandSurv.ai complies with the professional practice laws of their jurisdiction,
              including Pennsylvania's State Registration Board for Professional Engineers, Land
              Surveyors and Geologists (63 Pa. C.S. § 501 et seq.) and all other applicable
              state and federal statutes.
            </p>
          </div>

          {/* Section: RICS */}
          <div>
            <h3 className="font-semibold text-white mb-1">International Professional Standards — RICS</h3>
            <p className="text-sm leading-relaxed">
              The Royal Institution of Chartered Surveyors (RICS) is a globally recognized
              professional body that regulates and promotes international standards for land, real
              estate, construction, and infrastructure professionals. LandSurv.ai is{' '}
              <strong className="text-white">not a RICS-regulated entity</strong> and is not
              affiliated with, endorsed by, or accredited by RICS. RICS-designated professionals
              (MRICS, FRICS, AssocRICS) who use LandSurv.ai remain solely responsible for ensuring
              compliance with the RICS Rules of Conduct, applicable RICS professional statements
              and guidance notes, and RICS Valuation – Global Standards (Red Book) where relevant.
              No output from LandSurv.ai constitutes a RICS-compliant professional opinion,
              valuation, survey, or report.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-1">Security &amp; Compliance Trust Center (SOC 2 + GDPR + SAIF)</h3>
            <p className="text-sm leading-relaxed">
              LandSurv.ai maintains a compliance program aligned with SOC 2 Trust Services Criteria,
              GDPR principles, and Google Secure AI Framework (SAIF) model-consumer controls.
              This alignment includes safeguards for prompt injection, sensitive-data disclosure,
              insecure integrations, and high-risk autonomous action control.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              SAIF alignment is an operational framework reference and is not a certification or
              third-party attestation claim.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-1">Core Technical Controls</h3>
            <ul className="space-y-1.5">
              {[
                'Authentication and role-restricted admin workflows.',
                'Audit logging on critical administrative and security-sensitive operations.',
                'Rate limiting and abuse controls on public and privileged endpoints.',
                'Transport and browser hardening controls, including HSTS in production.',
                'No-store caching policy on sensitive API surfaces.',
                'Google Model Armor screening on enabled Vertex AI traffic at the backend boundary.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <span className="text-teal-400 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-1">AI Governance &amp; Model Provider Compliance</h3>
            <p className="text-sm leading-relaxed">
              LandSurv.ai serves large language model workflows through Google Cloud Vertex AI,
              including Anthropic Claude models. Usage is governed by Google Cloud terms and
              Anthropic usage-policy requirements.
            </p>
            <ul className="space-y-1.5 mt-2">
              {[
                'Google Model Armor is enabled for Vertex AI traffic where configured, with prompt and response screening handled at the backend before content reaches or leaves the model.',
                'Claude requests require explicit Anthropic Usage Policy acknowledgement; non-acknowledged requests are rejected (HTTP 412).',
                'Claude Fable 5 additionally requires acceptance of the Advanced AI Safety Addendum; non-acknowledged requests are rejected (HTTP 412).',
                'Policy acceptance version and timestamp are recorded for auditability.',
                'High-risk and prohibited-use categories are surfaced for operator controls and review expectations.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <span className="text-orange-400 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-1">Privacy, DPA &amp; Subprocessors</h3>
            <p className="text-sm leading-relaxed">
              We collect and process account, operational-security, and support/contact data needed
              to provide and secure the service. For customer data processed on behalf of a customer,
              LandSurv.ai acts as a processor under documented instructions and applies security and
              incident-response obligations consistent with applicable law and contract scope.
            </p>
            <p className="text-sm leading-relaxed mt-2">
              Authoritative documents and subprocessor disclosures are maintained on dedicated pages:
            </p>
            <ul className="space-y-1.5 mt-2">
              {[
                { label: 'Security & Compliance Trust Center', href: 'https://compliance.landsurv.ai' },
                { label: 'Privacy Policy', href: 'https://privacy.landsurv.ai' },
                { label: 'Data Processing Addendum', href: 'https://dpa.landsurv.ai' },
                { label: 'Subprocessors', href: 'https://subprocessors.landsurv.ai' },
                { label: 'Terms of Service', href: 'https://tos.landsurv.ai' },
              ].map((item) => (
                <li key={item.href} className="text-sm">
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Section: Analogy */}
          <div className="bg-gray-700/40 rounded-lg p-4 text-sm leading-relaxed">
            <p className="font-semibold text-cyan-300 mb-1">The Software Tool Analogy</p>
            <p>
              A licensed surveyor using Autodesk Civil 3D is practicing surveying — not the software.
              Civil 3D is a tool used by a licensed professional, not a licensed professional itself.
              LandSurv.ai occupies the same legal category. The licensed professional using the tool
              remains the responsible party for all work product.
            </p>
          </div>

          {/* Disclaimer */}
          <div>
            <h3 className="font-semibold text-gray-400 mb-1 text-sm">Disclaimer of Warranties</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              LandSurv.ai is provided "as is" without warranty of any kind, express or implied,
              including merchantability, fitness for a particular purpose, or non-infringement.
              The platform operators shall not be liable for any claim or damages arising from the
              use or inability to use the platform or its outputs.
            </p>
          </div>

          <p className="text-xs text-gray-600 text-center">
            Full legal documentation at{' '}
            <a
              href="https://legal.landsurv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-500 hover:text-amber-400 underline underline-offset-2"
            >
              legal.landsurv.ai
            </a>
            {' '}·{' '}
            <a href="https://compliance.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">compliance</a>
            {' '}·{' '}
            <a href="https://privacy.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">privacy</a>
            {' '}·{' '}
            <a href="https://dpa.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">dpa</a>
            {' '}·{' '}
            <a href="https://subprocessors.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">subprocessors</a>
            {' '}·{' '}
            <a href="https://tos.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">tos</a>
          </p>

          {/* Scroll Indicator */}
          {showScrollIndicator && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 animate-bounce opacity-60 pointer-events-none">
              <svg className="w-14 h-14 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default LegalPage;
