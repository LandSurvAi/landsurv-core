import React, { useEffect } from 'react';
import { APP_VERSION } from '../utils/appVersion.ts';

/**
 * tos.landsurv.ai — Terms of Service Landing Page
 *
 * Standalone full-page component served when the hostname is tos.landsurv.ai.
 * Also embedded inside the SPA under the same subdomain-routing config.
 *
 * Scope: the *full* binding contract between LandSurv.ai (the Pennsylvania-based
 * operator) and any user of the web application, agent landing pages, API
 * endpoints, Claw browser-automation service, Civil 3D connector, and any
 * other service published under landsurv.ai.
 *
 * The companion page at legal.landsurv.ai covers the narrower
 * professional-practice disclaimer and signature gate. This page is the
 * commercial/contract layer that sits on top of that.
 *
 * Styling mirrors the homepage and the Legal subdomain.
 */

const TOS_EFFECTIVE_DATE = 'June 6, 2026';
const TOS_VERSION = '1.0';

const Section: React.FC<{ id: string; title: string; children: React.ReactNode; accent?: string }> = ({
  id,
  title,
  children,
  accent = 'text-cyan-400',
}) => (
  <section id={id} className="mb-5 scroll-mt-24 rounded-2xl border border-white/[0.08] bg-slate-950/35 p-6 sm:p-7">
    <h2 className={`text-xl font-bold ${accent}`}>{title}</h2>
    <div className="text-gray-300 space-y-3 leading-relaxed text-[15px]">{children}</div>
  </section>
);

const tableOfContents: Array<{ id: string; label: string }> = [
  { id: 'agreement',          label: '1. The Agreement' },
  { id: 'eligibility',        label: '2. Eligibility & Accounts' },
  { id: 'tool-not-pro',       label: '3. Software Tool, Not Professional Service' },
  { id: 'license',            label: '4. License to Use LandSurv.ai' },
  { id: 'user-content',       label: '5. Your Content & Data' },
  { id: 'ai-output',          label: '6. AI Output & Verification' },
  { id: 'byok',               label: '7. Bring-Your-Own-Key (BYOK) & API Keys' },
  { id: 'billing',            label: '8. Plans, Day Passes, Billing & Refunds' },
  { id: 'claw',               label: '9. The LandSurv Claw & Permissive-Source Policy' },
  { id: 'acceptable-use',     label: '10. Acceptable Use' },
  { id: 'third-party',        label: '11. Third-Party Services' },
  { id: 'open-source',        label: '12. Open-Source Specifications (.lsvz, CACP)' },
  { id: 'ip',                 label: '13. Intellectual Property' },
  { id: 'privacy',            label: '14. Privacy & Telemetry' },
  { id: 'export-controls',    label: '15. Export Controls & Sanctions' },
  { id: 'warranty',           label: '16. Disclaimer of Warranties' },
  { id: 'liability',          label: '17. Limitation of Liability' },
  { id: 'indemnification',    label: '18. Indemnification' },
  { id: 'termination',        label: '19. Suspension & Termination' },
  { id: 'changes',            label: '20. Changes to the Service or Terms' },
  { id: 'governing-law',      label: '21. Governing Law & Venue' },
  { id: 'dispute',            label: '22. Dispute Resolution' },
  { id: 'misc',               label: '23. Miscellaneous' },
  { id: 'contact',            label: '24. Contact' },
];

export function TosSubdomainPage() {
  // Inject TermsOfService schema for SEO + a BreadcrumbList for the sitemap path.
  useEffect(() => {
    const tosSchema = {
      '@context': 'https://schema.org',
      '@type': 'TermsOfService',
      name: 'LandSurv.ai Terms of Service',
      url: 'https://tos.landsurv.ai',
      datePublished: '2026-06-06',
      version: TOS_VERSION,
      inLanguage: 'en-US',
      publisher: {
        '@type': 'Organization',
        name: 'LandSurv.ai',
        url: 'https://landsurv.ai',
      },
    };
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
        { '@type': 'ListItem', position: 2, name: 'Terms of Service', item: 'https://tos.landsurv.ai' },
      ],
    };
    const tosScript = document.createElement('script');
    tosScript.type = 'application/ld+json';
    tosScript.textContent = JSON.stringify(tosSchema);
    document.head.appendChild(tosScript);

    const crumbScript = document.createElement('script');
    crumbScript.type = 'application/ld+json';
    crumbScript.textContent = JSON.stringify(breadcrumbSchema);
    document.head.appendChild(crumbScript);

    const originalTitle = document.title;
    document.title = 'Terms of Service — LandSurv.ai';

    return () => {
      if (tosScript.parentNode) tosScript.parentNode.removeChild(tosScript);
      if (crumbScript.parentNode) crumbScript.parentNode.removeChild(crumbScript);
      document.title = originalTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-200">
      {/* Header — mirrors the official homepage / legal-page branding */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-extrabold tracking-tighter text-gray-100">
                Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span>
              </h1>
              <h2 className="text-xl font-bold text-cyan-400 mt-1">Terms of Service</h2>
            </div>
            <a
              href="https://landsurv.ai"
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              Launch Main App &raquo;
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-gray-900/80 to-emerald-950/35 px-6 py-8 shadow-2xl shadow-cyan-950/20 sm:mt-12 sm:px-10 sm:py-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1">
          <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm text-cyan-300 font-semibold">
            Version {TOS_VERSION} &nbsp;·&nbsp; Effective {TOS_EFFECTIVE_DATE}
          </span>
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-3 leading-tight">
          The contract between you and{' '}
          <span className="text-cyan-400">LandSurv</span>
          <span className="text-green-400">.ai</span>.
        </h2>
        <p className="text-base text-gray-400 max-w-3xl">
          A plain-language but binding agreement covering use of the LandSurv.ai web application,
          its AI agents, the LandSurv Claw browser-automation service, the Civil 3D Cloud connector,
          and every other service published under <span className="font-mono text-gray-300">landsurv.ai</span>.
        </p>
        <p className="text-sm text-gray-500 mt-3">
          App build {APP_VERSION} &nbsp;·&nbsp; Pennsylvania-based business
        </p>
      </section>

      {/* Key notice */}
      <div className="mx-auto max-w-6xl px-4 pb-2 pt-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-950/15 p-6">
          <div className="flex gap-3">
            <svg className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-bold text-amber-200 mb-1">Read me first</p>
              <p className="text-amber-100/85 text-sm leading-relaxed">
                LandSurv.ai is a <strong>software tool</strong>, not a licensed surveyor or engineer.
                AI output can be wrong and must be independently verified by a qualified professional
                before being used for any boundary, design, regulatory, or construction purpose. These
                Terms include a binding arbitration clause and a class-action waiver in
                Section&nbsp;22 — please read them carefully.
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* Table of contents */}
        <nav className="mb-5 rounded-2xl border border-white/[0.08] bg-slate-950/50 p-5">
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Contents</h3>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {tableOfContents.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="agreement" title="1. The Agreement">
          <p>
            These Terms of Service (the "<strong className="text-white">Terms</strong>") form a binding
            legal agreement between <strong className="text-white">you</strong> (whether an individual,
            a sole-practitioner firm, or a legal entity, collectively "<strong className="text-white">you</strong>"
            or "<strong className="text-white">User</strong>") and{' '}
            <strong className="text-white">LandSurv.ai</strong> ("<strong className="text-white">we</strong>",
            "<strong className="text-white">us</strong>", "<strong className="text-white">our</strong>",
            or the "<strong className="text-white">Service</strong>"), a Pennsylvania-based software
            provider operating the website at <span className="font-mono text-gray-100">landsurv.ai</span>{' '}
            and all of its subdomains, APIs, downloadable connectors, and associated services
            (collectively, the "<strong className="text-white">Platform</strong>").
          </p>
          <p>
            By creating an account, signing the in-app first-use agreement, clicking "I agree", entering
            an API key, purchasing a Day Pass or subscription, downloading the LandsurvConnector, or
            otherwise accessing or using any part of the Platform, you agree to be bound by these Terms,
            our <a href="https://legal.landsurv.ai" className="text-cyan-400 hover:underline">Legal &amp; Compliance disclosures</a>,
            and any product-specific terms incorporated by reference. If you do not agree, do not use
            the Platform.
          </p>
          <p>
            If you are accepting these Terms on behalf of an employer or other entity, you represent
            that you have the authority to bind that entity, and "you" includes that entity.
          </p>
        </Section>

        <Section id="eligibility" title="2. Eligibility & Accounts">
          <p>
            You must be at least <strong className="text-white">16 years old</strong> (or the age of
            digital consent in your jurisdiction, whichever is higher) to use the Platform, and at
            least <strong className="text-white">18 years old</strong> to purchase a paid plan or Day Pass.
          </p>
          <p>
            Some Platform features work without an account (anonymous local-storage use). When you do
            create an account, you agree to: (a) provide accurate, current information; (b) keep your
            credentials confidential; (c) be responsible for every action taken under your account; and
            (d) notify us promptly at <a href="mailto:security@landsurv.ai" className="text-cyan-400 hover:underline">security@landsurv.ai</a>{' '}
            of any unauthorized access.
          </p>
          <p>
            You may not (i) share a single account between multiple humans, (ii) resell or sub-license
            your account, or (iii) use the Platform from a country subject to U.S. embargo (see
            Section 15).
          </p>
        </Section>

        <Section id="tool-not-pro" title="3. Software Tool, Not Professional Service">
          <p>
            LandSurv.ai is a productivity tool in the same legal category as Autodesk Civil&nbsp;3D,
            Trimble Business Center, a TI scientific calculator, or a spreadsheet. It does{' '}
            <strong className="text-white">not</strong> practice land surveying, civil engineering,
            real-estate valuation, legal services, or any other regulated profession.
          </p>
          <p>
            Use of the Platform does not establish a professional, agency, fiduciary, or
            client-relationship between you and LandSurv.ai. No output of the Platform is a
            certified survey plat, sealed engineering drawing, formal valuation, title opinion, or
            legal advice.
          </p>
          <p>
            The full professional-practice disclaimer — including the Pennsylvania, multi-state, and
            international (RICS) compliance language and the first-time signature gate — lives at{' '}
            <a href="https://legal.landsurv.ai" className="text-cyan-400 hover:underline">legal.landsurv.ai</a>{' '}
            and is incorporated into these Terms by reference.
          </p>
        </Section>

        <Section id="license" title="4. License to Use LandSurv.ai">
          <p>
            Subject to your compliance with these Terms, we grant you a limited, non-exclusive,
            non-transferable, non-sublicensable, revocable license to access and use the Platform for
            your internal business or personal-research purposes.
          </p>
          <p>
            We retain all right, title, and interest in and to the Platform, including the LandSurv.ai
            name and logo, the web application code, the AI agent prompt-engineering, the auto-draft
            orchestrator, the CAD Manager rule engine, the LandSurv Claw browser-automation server,
            the LandsurvConnector for Civil&nbsp;3D, all server-side infrastructure, and every
            improvement, derivative work, and aggregate dataset generated from operating the Platform.
          </p>
          <p>
            The license <strong className="text-white">does not</strong> grant you the right to:
            (a) copy, redistribute, or host the Platform; (b) reverse engineer, decompile, or extract
            source code or AI system prompts (except to the extent applicable law forbids that
            restriction); (c) train a competing AI model on Platform outputs or scraped UI; (d) use
            the Platform to build or improve a directly competing product; or (e) remove or alter any
            proprietary notice or branding.
          </p>
        </Section>

        <Section id="user-content" title="5. Your Content & Data">
          <p>
            "<strong className="text-white">User Content</strong>" means everything you upload, paste,
            type, draw, capture, or otherwise submit to the Platform — deed text, PDF plans, DXF
            files, GeoJSON, RINEX observations, GPX tracks, point lists, photographs, chat messages,
            saved <span className="font-mono text-gray-100">.lsvz</span> project archives, and the
            outputs the AI agents generate from any of the above.
          </p>
          <p>
            <strong className="text-white">You retain ownership</strong> of your User Content. By
            submitting User Content, you grant LandSurv.ai a worldwide, royalty-free, non-exclusive
            license to host, process, transmit, display, transform, and create derivative works of
            that content <em>solely</em> as needed to operate, secure, debug, and improve the
            Platform for you, and to comply with law.
          </p>
          <p>
            We do <strong className="text-white">not</strong> use your User Content to train
            general-purpose third-party AI models. Where the Platform calls a third-party model
            (e.g., Google Gemini), your content is governed by that provider's terms — see
            Section&nbsp;11. If you use your own API key (BYOK, Section&nbsp;7), the third-party
            relationship is between you and that provider directly.
          </p>
          <p>
            You represent and warrant that you own or have all rights necessary to submit your User
            Content, and that submitting and processing it through the Platform does not infringe
            any third party's rights, breach any confidentiality obligation, or violate any law.
          </p>
        </Section>

        <Section id="ai-output" title="6. AI Output & Verification">
          <p>
            The Platform uses large language models and other AI techniques to assist with deed
            interpretation, GIS reasoning, plan extraction, coordinate geometry, drafting, and
            similar tasks. AI output is{' '}
            <strong className="text-white">probabilistic, not deterministic</strong>. It can:
            (i) hallucinate facts that do not exist in the source; (ii) miss curves, lines, or
            features that do exist; (iii) misread distances, bearings, or coordinates; and
            (iv) produce confident-sounding errors.
          </p>
          <p>
            Every AI output — every coordinate, every parcel plot, every stationing value, every
            zoning citation, every auto-drafted DXF — must be independently verified by a qualified
            user, against authoritative source data, before it is used for any boundary,
            engineering, regulatory, construction, real-estate, or legal purpose.
          </p>
          <p>
            <strong className="text-white">You are the responsible party</strong> for any decision
            you make based on Platform output. LandSurv.ai disclaims responsibility for harm caused
            by reliance on unverified AI output (subject to Section&nbsp;17).
          </p>
        </Section>

        <Section id="byok" title="7. Bring-Your-Own-Key (BYOK) & API Keys">
          <p>
            The Platform supports user-provided API keys for upstream AI providers
            (e.g., Google Gemini / Vertex AI). When you enter a BYOK credential:
          </p>
          <ul className="list-disc list-inside text-sm space-y-1 marker:text-cyan-400">
            <li>The key is stored client-side in your browser's local storage and sent to the relevant provider for the specific request you make.</li>
            <li>You are solely responsible for the cost, rate limits, abuse-detection consequences, and content-policy compliance of every call made with your key.</li>
            <li>You must not enter a key you are not authorized to use, nor a key that violates the upstream provider's terms.</li>
            <li>The Platform may record minimal telemetry (key fingerprint, model id, byte count, cost estimate) so the in-app DevOps console and your own account dashboard can report usage. We do not log the key value or the prompt content tied to it.</li>
          </ul>
          <p>
            Day Pass and other paid demo modes use a server-side key managed by us; in those modes
            you are not exposed to upstream provider billing, but Acceptable Use rules (Section&nbsp;10)
            apply.
          </p>
        </Section>

        <Section id="billing" title="8. Plans, Day Passes, Billing & Refunds">
          <p>
            The Platform offers a free tier (BYOK or local-only use), one-off{' '}
            <strong className="text-white">Day Passes</strong> (24-hour access to server-side AI), and
            subscription plans. Specific pricing, included quotas, and feature matrices are presented
            at purchase time and are incorporated into these Terms.
          </p>
          <ul className="list-disc list-inside text-sm space-y-1 marker:text-cyan-400">
            <li><strong className="text-white">Payment processors.</strong> Card and crypto payments are handled by third-party processors (e.g., Stripe). You agree to that processor's terms when you submit a payment instrument.</li>
            <li><strong className="text-white">Auto-renewal.</strong> Subscriptions renew at the end of each billing period unless cancelled before the renewal date. You can cancel anytime from the in-app billing page; access continues through the end of the paid period.</li>
            <li><strong className="text-white">Taxes.</strong> Listed prices exclude taxes; you are responsible for any sales, use, VAT, or withholding tax due in your jurisdiction.</li>
            <li><strong className="text-white">Day Passes.</strong> Day Passes are single-use, non-transferable, and non-refundable once activated.</li>
            <li><strong className="text-white">Refunds.</strong> Subscription fees are non-refundable except where required by law. We may, at our sole discretion, issue a pro-rata refund for the unused portion of a current billing period if you cancel within 7 days of a renewal you did not intend.</li>
            <li><strong className="text-white">Chargebacks.</strong> A chargeback or payment dispute filed without first contacting <a href="mailto:billing@landsurv.ai" className="text-cyan-400 hover:underline">billing@landsurv.ai</a> may result in immediate account suspension.</li>
          </ul>
        </Section>

        <Section id="claw" title="9. The LandSurv Claw & Permissive-Source Policy">
          <p>
            The Platform includes the <strong className="text-white">LandSurv Claw</strong>, a
            server-side headless-Chromium browser used by certain agents (notably the Zoning Agent)
            to retrieve publicly available content from third-party websites on your behalf.
          </p>
          <p>
            The Claw operates under a strict <strong className="text-white">permissive-source policy</strong>:
            commercial codification platforms whose terms of use prohibit automated retrieval
            (e.g., eCode360, Municode, qcode.us, generalCode, codePublishing, amLegal,
            sterlingCodifiers, lf-pubs) are hard-blocked at the client layer. The Claw will not
            issue requests to those hosts, and no facts derived from them enter the Platform's
            knowledge cache. The full policy and the case-law rationale are documented in the in-app{' '}
            <span className="font-mono text-gray-100">PermissiveSourcesExplainer</span> modal.
          </p>
          <p>
            When you open a blocked source manually in your own browser (the Platform offers a
            convenience link), that request leaves your machine under your own Terms-of-Use
            relationship with the destination site, not ours.
          </p>
          <p>
            You agree (a) not to attempt to bypass the permissive-source blocklist; (b) not to use
            the Claw, directly or indirectly, to scrape sites that prohibit automation; and (c) to
            comply with all applicable robots-exclusion, rate-limit, and licensing rules of any
            source you instruct an agent to retrieve.
          </p>
        </Section>

        <Section id="acceptable-use" title="10. Acceptable Use">
          <p>You agree not to use the Platform to:</p>
          <ul className="list-disc list-inside text-sm space-y-1 marker:text-red-400">
            <li>Violate any law, regulation, professional-practice statute, or third party's rights.</li>
            <li>Hold yourself out as a licensed surveyor, engineer, valuer, or attorney if you are not one.</li>
            <li>Generate or distribute a survey plat, design drawing, valuation, or legal opinion that purports to be a sealed or certified professional work product.</li>
            <li>Upload content you do not have the right to upload, including third-party confidential, privileged, or trade-secret material.</li>
            <li>Submit personal data of others in violation of GDPR, CCPA, or other privacy law.</li>
            <li>Attempt to reverse-engineer, decompile, or extract Platform code or AI system prompts.</li>
            <li>Train, fine-tune, or evaluate a competing AI model on Platform outputs or scraped UI.</li>
            <li>Probe, scan, or test the Platform's security without our prior written permission.</li>
            <li>Send spam, malware, or any content designed to disrupt the Platform or harm other users.</li>
            <li>Interfere with rate-limits, queues, or abuse-protection systems, or circumvent the LandSurv Claw permissive-source policy.</li>
            <li>Use the Platform to develop weapons, surveil individuals without consent, or generate disinformation.</li>
          </ul>
          <p>
            We may, at our sole discretion, throttle, suspend, or terminate accounts that violate
            this section.
          </p>
        </Section>

        <Section id="third-party" title="11. Third-Party Services">
          <p>
            The Platform integrates third-party services that are essential to its operation,
            including but not limited to: Google Gemini / Vertex AI, Google Maps, Google Document AI,
            Google Vision, Firebase, Cloud Run, Stripe, and PDF/CAD libraries. A current inventory
            and the license category of each component is published at{' '}
            <a href="https://technologies.landsurv.ai" className="text-cyan-400 hover:underline">technologies.landsurv.ai</a>.
          </p>
          <p>
            Your use of any third-party service through the Platform is also governed by that
            provider's terms. Where you supply your own API key (BYOK), you are the direct party to
            that contract.
          </p>
          <p>
            Third-party trademarks and product names are the property of their respective owners and
            are used solely for identification.
          </p>
        </Section>

        <Section id="open-source" title="12. Open-Source Specifications (.lsvz, CACP)">
          <p>
            LandSurv.ai publishes two open-source specifications under{' '}
            <strong className="text-white">Creative Commons Attribution 4.0 (CC&nbsp;BY&nbsp;4.0)</strong>:
          </p>
          <ul className="list-disc list-inside text-sm space-y-1 marker:text-amber-400">
            <li><strong className="text-white">.lsvz</strong> — the AI-native survey project archive format. Live at <a href="https://lsvz.landsurv.ai" className="text-amber-400 hover:underline">lsvz.landsurv.ai</a>.</li>
            <li><strong className="text-white">CACP</strong> — the Cross-Agent Communications Protocol used by the Platform's agents to collaborate. Live at <a href="https://cacp.landsurv.ai" className="text-amber-400 hover:underline">cacp.landsurv.ai</a>.</li>
          </ul>
          <p>
            You may freely use, adapt, and build on either specification with attribution. These
            Terms govern the <em>hosted Platform</em>, not the standalone specifications.
          </p>
        </Section>

        <Section id="ip" title="13. Intellectual Property">
          <p>
            All Platform code, branding, UI design, prompt engineering, default rule libraries,
            documentation, and aggregate analytics are protected by U.S. and international
            intellectual property laws and remain the property of LandSurv.ai or its licensors.
          </p>
          <p>
            <strong className="text-white">Feedback.</strong> If you send us suggestions, bug
            reports, feature requests, or other feedback, you grant us a perpetual, irrevocable,
            royalty-free, worldwide license to use, modify, and incorporate that feedback without
            obligation to you.
          </p>
          <p>
            <strong className="text-white">Copyright claims.</strong> If you believe content on the
            Platform infringes your copyright, send a notice that complies with 17 U.S.C.
            §&nbsp;512(c)(3) to{' '}
            <a href="mailto:dmca@landsurv.ai" className="text-cyan-400 hover:underline">dmca@landsurv.ai</a>.
            Repeat infringers will be terminated.
          </p>
        </Section>

        <Section id="privacy" title="14. Privacy & Telemetry">
          <p>
            The Platform stores most user state in your browser's local storage. Server-side
            persistence is limited to (a) account, billing, and authentication records; (b) BYOK
            session check-ins and aggregate usage metrics; (c) opt-in saved <span className="font-mono text-gray-100">.lsvz</span> project archives;
            and (d) request/error logs retained for security and debugging.
          </p>
          <p>
            We do not sell your personal data. We do not use your User Content to train
            general-purpose third-party AI models. Anonymous, aggregated usage statistics may be used
            to improve the Platform. Detailed practices, cookies, and your CCPA/GDPR rights will be
            published in a dedicated Privacy Policy at{' '}
            <span className="font-mono text-gray-300">privacy.landsurv.ai</span>; until that page is
            live, the practices summarized here govern.
          </p>
        </Section>

        <Section id="export-controls" title="15. Export Controls & Sanctions">
          <p>
            The Platform is operated from the United States. You may not access or use it from, nor
            export, re-export, or transfer Platform content to, any country, person, or entity
            subject to U.S. embargoes or trade sanctions (currently including Cuba, Iran, North
            Korea, Syria, the Crimea/Donetsk/Luhansk regions of Ukraine, and any party on the
            U.S. Treasury OFAC SDN list).
          </p>
          <p>
            You represent that you are not on, and are not owned or controlled by a party on, any
            restricted-party list maintained by the U.S., U.K., E.U., or U.N.
          </p>
        </Section>

        <Section id="warranty" title="16. Disclaimer of Warranties" accent="text-gray-300">
          <p className="uppercase text-xs tracking-wider text-gray-400">
            The following disclaimer is required by law to be conspicuous.
          </p>
          <p>
            THE PLATFORM, INCLUDING ALL AI OUTPUTS AND THE LANDSURV CLAW, IS PROVIDED ON AN
            "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
            INCLUDING WITHOUT LIMITATION THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, AND ANY WARRANTY ARISING FROM
            COURSE OF DEALING OR USAGE OF TRADE.
          </p>
          <p>
            WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE
            OF HARMFUL COMPONENTS, OR THAT ANY AI-GENERATED OUTPUT WILL BE ACCURATE, COMPLETE,
            CURRENT, RELIABLE, OR SUITABLE FOR YOUR INTENDED USE.
          </p>
        </Section>

        <Section id="liability" title="17. Limitation of Liability" accent="text-gray-300">
          <p className="uppercase text-xs tracking-wider text-gray-400">
            Please read this section carefully — it limits the money you can recover.
          </p>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL LANDSURV.AI, ITS
            AFFILIATES, OFFICERS, EMPLOYEES, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE,
            DATA, GOODWILL, BUSINESS OPPORTUNITY, OR PROFESSIONAL REPUTATION, ARISING OUT OF OR
            RELATED TO YOUR USE OF — OR INABILITY TO USE — THE PLATFORM, EVEN IF WE HAVE BEEN
            ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p>
            OUR TOTAL CUMULATIVE LIABILITY FOR ALL CLAIMS RELATED TO THE PLATFORM SHALL NOT EXCEED
            THE GREATER OF (A) THE AMOUNT YOU PAID TO LANDSURV.AI IN THE TWELVE (12) MONTHS
            IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED U.S.
            DOLLARS (US$100).
          </p>
          <p>
            Some jurisdictions do not allow the exclusion of certain warranties or the limitation of
            liability for incidental or consequential damages; in those jurisdictions, our liability
            is limited to the maximum extent permitted by law.
          </p>
        </Section>

        <Section id="indemnification" title="18. Indemnification">
          <p>
            You agree to defend, indemnify, and hold harmless LandSurv.ai and its affiliates,
            officers, employees, contractors, and licensors from and against any third-party claim,
            loss, liability, damage, cost, or expense (including reasonable attorneys' fees) arising
            out of or related to: (a) your User Content; (b) your use of Platform output without
            independent professional verification; (c) your breach of these Terms or any law;
            (d) your violation of any third party's rights; or (e) your use of the LandSurv Claw to
            retrieve content from a source outside the permissive-source policy.
          </p>
        </Section>

        <Section id="termination" title="19. Suspension & Termination">
          <p>
            You may stop using the Platform at any time. You may cancel a paid plan from the in-app
            billing page; access continues through the end of the paid period.
          </p>
          <p>
            We may suspend or terminate your access — with or without notice — if we reasonably
            believe you have violated these Terms, exposed the Platform or its users to risk, or
            failed to pay amounts due. Upon termination, sections that by their nature should
            survive (including 4 last paragraph, 5, 6, 13, 14, 16, 17, 18, 21, 22, 23) will survive.
          </p>
          <p>
            On termination we will, on request and where technically feasible, give you 30 days to
            export your saved <span className="font-mono text-gray-100">.lsvz</span> project archives
            before they are deleted from server storage.
          </p>
        </Section>

        <Section id="changes" title="20. Changes to the Service or Terms">
          <p>
            We are an actively developed Platform. Features may be added, removed, restyled,
            renamed, deprecated, or repriced. We will use reasonable efforts to provide notice of
            material changes through the in-app release log, an email to your account address, or a
            banner on landsurv.ai.
          </p>
          <p>
            We may revise these Terms by posting an updated version at{' '}
            <a href="https://tos.landsurv.ai" className="text-cyan-400 hover:underline">tos.landsurv.ai</a>{' '}
            and updating the "Effective" date at the top of this page. Material changes take effect
            no sooner than 14 days after posting (immediate for changes required by law or to
            address a security risk). Continued use of the Platform after the effective date
            constitutes acceptance.
          </p>
        </Section>

        <Section id="governing-law" title="21. Governing Law & Venue">
          <p>
            These Terms are governed by the laws of the{' '}
            <strong className="text-white">Commonwealth of Pennsylvania, United States</strong>,
            without regard to its conflict-of-laws rules, and (where applicable) by U.S. federal
            law.
          </p>
          <p>
            Subject to Section&nbsp;22, the exclusive venue for any claim not subject to
            arbitration lies in the state or federal courts located in Pennsylvania, and you consent
            to the personal jurisdiction of those courts.
          </p>
        </Section>

        <Section id="dispute" title="22. Dispute Resolution — Arbitration & Class Waiver">
          <p>
            <strong className="text-white">Please read this section carefully — it affects your legal rights.</strong>
          </p>
          <p>
            Most concerns can be resolved quickly by emailing{' '}
            <a href="mailto:legal@landsurv.ai" className="text-cyan-400 hover:underline">legal@landsurv.ai</a>.
            If we cannot resolve a dispute informally within 60 days of your written notice, you and
            LandSurv.ai agree that any dispute, claim, or controversy arising out of or related to
            these Terms or the Platform (a "<strong className="text-white">Dispute</strong>") will be
            resolved by <strong className="text-white">binding individual arbitration</strong>
            administered by the American Arbitration Association (AAA) under its Consumer Arbitration
            Rules, by a single arbitrator, conducted in English in Pennsylvania (or remotely with your
            consent).
          </p>
          <p>
            <strong className="text-white">Class-action waiver.</strong> You and LandSurv.ai each
            waive any right to bring or participate in a class, collective, mass, or representative
            action. Disputes must be brought in your individual capacity only.
          </p>
          <p>
            <strong className="text-white">Carve-outs.</strong> Either party may bring (a) an
            individual action in small-claims court, or (b) an action in any court of competent
            jurisdiction for injunctive or equitable relief to protect intellectual property,
            confidentiality, or security.
          </p>
          <p>
            <strong className="text-white">Opt-out.</strong> You may opt out of this arbitration
            agreement by emailing <a href="mailto:legal@landsurv.ai" className="text-cyan-400 hover:underline">legal@landsurv.ai</a>{' '}
            with the subject line "Arbitration Opt-Out", your account email, and your full name,
            within 30 days of first accepting these Terms.
          </p>
        </Section>

        <Section id="misc" title="23. Miscellaneous">
          <ul className="list-disc list-inside text-sm space-y-1 marker:text-cyan-400">
            <li><strong className="text-white">Entire agreement.</strong> These Terms (with the Legal disclosures, billing plan, and any product-specific terms referenced) are the entire agreement between you and LandSurv.ai and supersede prior agreements on the same subject.</li>
            <li><strong className="text-white">Severability.</strong> If any provision is held unenforceable, the rest remains in effect, and the unenforceable provision will be modified to the minimum extent necessary to make it enforceable.</li>
            <li><strong className="text-white">No waiver.</strong> Our failure to enforce a right is not a waiver of that right.</li>
            <li><strong className="text-white">Assignment.</strong> You may not assign these Terms without our prior written consent. We may assign them in connection with a merger, acquisition, financing, or sale of assets.</li>
            <li><strong className="text-white">Force majeure.</strong> Neither party is liable for delay or failure caused by events beyond its reasonable control (including upstream cloud or AI-provider outages).</li>
            <li><strong className="text-white">Notices.</strong> Notices to LandSurv.ai must be sent to <a href="mailto:legal@landsurv.ai" className="text-cyan-400 hover:underline">legal@landsurv.ai</a>. Notices to you may be sent to the email on file or posted in-app.</li>
            <li><strong className="text-white">Headings.</strong> Section headings are for convenience only and have no legal effect.</li>
            <li><strong className="text-white">Language.</strong> The English version of these Terms controls; translations are provided for convenience.</li>
          </ul>
        </Section>

        <Section id="contact" title="24. Contact">
          <p>
            Questions about these Terms?
          </p>
          <ul className="text-sm space-y-1">
            <li>General &amp; legal: <a href="mailto:legal@landsurv.ai" className="text-cyan-400 hover:underline">legal@landsurv.ai</a></li>
            <li>Billing &amp; refunds: <a href="mailto:billing@landsurv.ai" className="text-cyan-400 hover:underline">billing@landsurv.ai</a></li>
            <li>Security &amp; abuse: <a href="mailto:security@landsurv.ai" className="text-cyan-400 hover:underline">security@landsurv.ai</a></li>
            <li>DMCA: <a href="mailto:dmca@landsurv.ai" className="text-cyan-400 hover:underline">dmca@landsurv.ai</a></li>
          </ul>
        </Section>

        {/* Related pages */}
        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-slate-950/40 p-6">
          <h3 className="text-base font-bold text-gray-200 mb-3">Related Pages</h3>
          <ul className="grid sm:grid-cols-2 gap-2 text-sm">
            <li>
              <a href="https://legal.landsurv.ai" className="text-cyan-400 hover:underline">
                legal.landsurv.ai
              </a>{' '}
              <span className="text-gray-500">— Professional-practice disclaimer &amp; signature gate</span>
            </li>
            <li>
              <a href="https://technologies.landsurv.ai" className="text-cyan-400 hover:underline">
                technologies.landsurv.ai
              </a>{' '}
              <span className="text-gray-500">— Third-party components &amp; license inventory</span>
            </li>
            <li>
              <a href="https://lsvz.landsurv.ai" className="text-amber-400 hover:underline">
                lsvz.landsurv.ai
              </a>{' '}
              <span className="text-gray-500">— Open .lsvz file-format spec (CC BY 4.0)</span>
            </li>
            <li>
              <a href="https://cacp.landsurv.ai" className="text-amber-400 hover:underline">
                cacp.landsurv.ai
              </a>{' '}
              <span className="text-gray-500">— Open CACP protocol spec (CC BY 4.0)</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-gray-600 text-xs">
            &copy; {new Date().getFullYear()} LandSurv.ai. All rights reserved.
            &nbsp;·&nbsp; Terms v{TOS_VERSION} &nbsp;·&nbsp; App build {APP_VERSION}
          </p>
        </div>
      </main>
    </div>
  );
}
