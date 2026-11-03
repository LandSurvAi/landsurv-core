/**
 * Shared authoritative Terms of Service content for LandSurv.ai.
 *
 * Consumed by:
 *   1. `components/TosSubdomainPage.tsx` (tos.landsurv.ai)
 *   2. `components/LegalAgreementGate.tsx` (in-app mandatory scroll-to-bottom TOS gate)
 *
 * Keeping the full contract structured here guarantees zero drift between the
 * standalone Terms of Service page and the agreement users scroll through and sign
 * before launching their first agent.
 */

export const TOS_EFFECTIVE_DATE = 'November 3, 2026';
export const TOS_PUBLISHED_ISO = '2026-11-03';
export const TOS_VERSION = '2.0';

export interface TosTakeaway {
  badge: string;
  title: string;
  summary: string;
  accent: 'cyan' | 'emerald' | 'amber' | 'violet';
}

export interface TosSectionData {
  id: string;
  number: string;
  title: string;
  accent?: string;
  conspicuous?: boolean;
  conspicuousNote?: string;
  paragraphs: string[];
  bullets?: Array<{
    lead?: string;
    text: string;
  }>;
  footerParagraphs?: string[];
}

export const TOS_AT_A_GLANCE: TosTakeaway[] = [
  {
    badge: '01 · Nature of Service',
    title: 'Software Tool, Not a Licensed Firm',
    summary:
      'LandSurv.ai is a computational and drafting software instrument—comparable to Civil 3D, Trimble Business Center, or a scientific calculator. It does not practice land surveying, civil engineering, or law.',
    accent: 'cyan',
  },
  {
    badge: '02 · Human Oversight',
    title: 'Independent Professional Verification',
    summary:
      'AI and algorithmic outputs are probabilistic and may contain errors. A qualified professional must verify every closure, coordinate, contour, and citation against authoritative sources before reliance.',
    accent: 'amber',
  },
  {
    badge: '03 · Data & Ownership',
    title: 'You Own Your Project Files & Content',
    summary:
      'You retain full ownership of your uploaded deeds, plans, point clouds, DXFs, and .lsvz archives. We never sell your personal data or train general-purpose third-party foundation models on your private project files.',
    accent: 'emerald',
  },
  {
    badge: '04 · Open Standards & Governance',
    title: 'Apache-2.0 Core, SAIF & Permissive Sources',
    summary:
      'Our open-source core (landsurv-core) is Apache-2.0 licensed, .lsvz and CACP are CC BY 4.0, our Claw engine strictly honors codifier blocklists, and Vertex AI / Claude workflows enforce Model Armor and usage policies.',
    accent: 'violet',
  },
];

export const TOS_SECTIONS: TosSectionData[] = [
  {
    id: 'agreement',
    number: '1',
    title: '1. The Agreement & Binding Acceptance',
    paragraphs: [
      'These Terms of Service (the "Terms") form a legally binding contract between you (whether an individual user, a sole-practitioner surveyor or engineer, or a corporate entity, collectively "you" or "User") and LandSurv.ai ("we", "us", "our", or the "Service"), a Pennsylvania-based software provider operating the web platform at landsurv.ai and all of its subdomains, APIs, downloadable CAD connectors, and associated services (collectively, the "Platform").',
      'By creating an account, executing the in-app first-use electronic signature gate, clicking "I Acknowledge" or "Sign & Continue", entering an API key, redeeming free deed allowances, purchasing a Day Pass or subscription, downloading the LandsurvConnector for Civil 3D / IntelliCAD, or otherwise accessing or using any part of the Platform, you agree to be bound by these Terms, our Legal & Compliance Disclosures (legal.landsurv.ai), our Privacy Policy (privacy.landsurv.ai), and our Data Processing Addendum (dpa.landsurv.ai) where applicable. If you do not agree to every provision of these Terms, do not access or use the Platform.',
      'If you accept these Terms on behalf of a surveying firm, engineering consultancy, government agency, employer, or other legal entity, you represent and warrant that you have full legal authority to bind that entity, and "you" refers to both you individually and that entity.',
    ],
  },
  {
    id: 'eligibility',
    number: '2',
    title: '2. Eligibility, Age Requirement & Account Security',
    paragraphs: [
      'You must be at least 18 years of age (or the age of legal majority in your jurisdiction, whichever is higher) and legally capable of entering into a binding contract to access or use the Platform, execute the first-time legal agreement, or purchase any paid plan or Day Pass.',
      'Certain Platform features operate client-side or with local browser storage without requiring a persistent cloud account. Where you register an account, sign the electronic agreement gate, or configure cloud synchronization, you agree to: (a) provide truthful, accurate, and complete identity and contact information; (b) maintain the confidentiality of your credentials, session tokens, and QR pairing codes; (c) accept full responsibility for all activity conducted under your account or device; and (d) notify us immediately at security@landsurv.ai upon discovering any unauthorized access or security breach.',
      'Individual user accounts and Day Passes are for a single human operator. You may not share login credentials across multiple individuals, resell or sublicense access, or access the Platform from any embargoed jurisdiction (see Section 15).',
    ],
  },
  {
    id: 'tool-not-pro',
    number: '3',
    title: '3. Software Tool — Not a Licensed Professional Service',
    paragraphs: [
      'LandSurv.ai is a technical software tool in the same legal and regulatory category as Autodesk Civil 3D, Carlson Survey, Trimble Business Center, QGIS, a scientific calculator, or a spreadsheet. LandSurv.ai is NOT a licensed land surveyor, professional surveying firm, professional engineer (PE), engineering firm, title abstractor, real-estate appraiser, or law firm, and does NOT offer or practice any regulated profession.',
      'Your use of the Platform does not create a surveyor-client, engineer-client, attorney-client, fiduciary, or advisory relationship between you and LandSurv.ai. No output generated, plotted, drafted, or summarized by the Platform constitutes a certified survey plat, sealed engineering drawing, official boundary determination, title opinion, FEMA elevation certificate, RICS Red Book valuation, or legal advice.',
      'As a Pennsylvania-based software provider, LandSurv.ai operates in strict observance of Pennsylvania’s Engineer, Land Surveyor and Geologist Registration Law (63 Pa. C.S. § 501 et seq.), analogous state licensing statutes across all 50 U.S. jurisdictions, and international frameworks including the Royal Institution of Chartered Surveyors (RICS) Rules of Conduct. Licensed professionals using the Platform remain the "Responsible Charge" practitioner for all professional work product. Full statutory and RICS disclosures at legal.landsurv.ai are incorporated into these Terms by reference.',
    ],
  },
  {
    id: 'license',
    number: '4',
    title: '4. License to Use the Platform & Restrictions',
    paragraphs: [
      'Subject to your continuous compliance with these Terms, LandSurv.ai grants you a personal, limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use the hosted Platform for your internal professional, educational, or research workflows.',
      'Except for the open-source components expressly identified in Section 12, LandSurv.ai and its licensors retain all right, title, and interest in and to the hosted Platform, including the LandSurv.ai brand and trade dress, proprietary agent orchestration and system prompts, the Auto-Draft vision pipeline, the CAD Manager rule and alias engine, the Standards Compliance audit engine, the LandSurv Claw service, the LandsurvConnector for Civil 3D, server infrastructure, and all aggregate telemetry.',
    ],
    bullets: [
      {
        lead: 'No Reverse Engineering of Hosted Services:',
        text: 'You may not decompile, disassemble, or attempt to extract non-public server-side source code, system prompts, model routing weights, or cryptographic signing keys of the hosted Platform (except to the extent applicable law expressly prohibits such restriction).',
      },
      {
        lead: 'No Competing Model Training:',
        text: 'You may not use outputs, synthetic geometry, or scraped interfaces from the Platform to train, fine-tune, distill, or benchmark a competing commercial AI or surveying software product.',
      },
      {
        lead: 'No Unauthorized Framing or Resale:',
        text: 'You may not mirror, frame, white-label, or resell the hosted Platform or its API endpoints as a managed service to third parties without a written enterprise agreement.',
      },
      {
        lead: 'Preservation of Notices:',
        text: 'You may not strip, obscure, or alter any copyright, trademark, attribution, or provenance metadata embedded in Platform interfaces or specifications.',
      },
    ],
  },
  {
    id: 'user-content',
    number: '5',
    title: '5. Your Content, Project Files & Data Ownership',
    paragraphs: [
      '"User Content" means all data, files, and inputs you upload, paste, key in, capture, or transmit through the Platform—including legal descriptions, deed PDFs, civil plan sheets, DXF/DWG drawings, GeoJSON files, RINEX GNSS observation logs, UAV/drone imagery, point files (.csv/.txt), TIN/LandXML surfaces, CAD standards, chat prompts, saved .lsvz project archives, and the project-specific geometry or reports generated from your inputs.',
      'You retain 100% ownership of your User Content. By submitting User Content to the Platform, you grant LandSurv.ai a limited, worldwide, royalty-free, non-exclusive license to host, cache, parse, transform, transmit, and display that User Content solely to the extent necessary to provide, secure, debug, and maintain the Platform features you invoke, and to comply with applicable law.',
      'No Foundation Model Training on Your Private Data: LandSurv.ai does NOT sell your User Content and does NOT use your private deeds, survey points, plans, or CAD drawings to train general-purpose third-party foundation AI models. When you invoke cloud AI inference, your request is processed through our enterprise cloud endpoints (such as Google Cloud Vertex AI) or via your own Bring-Your-Own-Key (BYOK) credentials in accordance with Section 6 and Section 7.',
      'You represent and warrant that you own or hold all necessary rights, consents, and permissions to submit your User Content, and that its processing under these Terms does not violate any third-party intellectual property right, trade secret, non-disclosure agreement, privacy statute, or critical-infrastructure security restriction.',
    ],
  },
  {
    id: 'ai-output',
    number: '6',
    title: '6. AI Output, Multi-Model Governance & Mandatory Verification',
    paragraphs: [
      'The Platform integrates large language models, multimodal vision models, and algorithmic solvers (including Google Gemini models and Anthropic Claude models such as Claude Sonnet, Claude Opus, and Claude Fable 5 served via Google Cloud Vertex AI) to assist with deed parsing, plan reading, coordinate geometry, code matching, compliance auditing, and drafting.',
      'AI Output Is Probabilistic, Not Deterministic: Machine-learning models can and do make mistakes. Outputs may: (i) hallucinate calls, monuments, bearings, distances, or ordinance citations that do not exist in the record; (ii) omit curves, easements, exceptions, or plan notes that do exist; (iii) misread degraded scans, handwritten annotations, or complex tables; and (iv) produce mathematically plausible but factually incorrect geometry.',
    ],
    bullets: [
      {
        lead: 'Mandatory Independent Verification:',
        text: 'Every coordinate, traverse closure, area computation, station/offset value, contour line, slope classification, flood/soil/structure overlay, title chain summary, zoning citation, compliance audit result, and CAD deliverable MUST be independently checked against authoritative source documents and field measurements by a qualified professional before being relied upon for any boundary, engineering, regulatory, construction, conveyance, or legal purpose.',
      },
      {
        lead: 'Google Model Armor & Safety Screening:',
        text: 'Where enabled on Vertex AI routes, prompts and model responses are screened at the backend boundary via Google Model Armor to mitigate prompt injection, sensitive-data leakage, and policy violations.',
      },
      {
        lead: 'Anthropic Usage Policy & Advanced AI Safety Addendum:',
        text: 'Use of Anthropic Claude models on the Platform requires explicit acceptance of the Anthropic Usage Policy. Use of advanced frontier models (such as Claude Fable 5) additionally requires acceptance of the Advanced AI Safety Addendum, which may include provider-level abuse monitoring and temporary safety retention as documented in the in-app Claude Settings panel. Requests lacking recorded policy consent are automatically rejected (HTTP 412).',
      },
    ],
    footerParagraphs: [
      'You assume sole and exclusive responsibility for all decisions, filings, construction stakeouts, and professional deliverables derived in whole or in part from Platform output.',
    ],
  },
  {
    id: 'byok',
    number: '7',
    title: '7. Bring-Your-Own-Key (BYOK), API Keys & Free Allowances',
    paragraphs: [
      'The Platform supports user-supplied API keys ("BYOK") for supported upstream AI providers (including Google Gemini, OpenAI, Anthropic, and xAI in applicable modes) as well as LandSurv-issued access keys and metered free allowances (such as the per-device 5 free deed allowance).',
    ],
    bullets: [
      {
        lead: 'Client-Side Key Storage:',
        text: 'When you supply your own upstream provider API key, it is stored in your browser’s local storage and used to authenticate requests initiated from your session.',
      },
      {
        lead: 'Upstream Billing & Quota Responsibility:',
        text: 'You are solely responsible for all token charges, rate limits, quota exhaustion, and terms-of-service compliance incurred under your own API key with the upstream provider.',
      },
      {
        lead: 'Minimal Operational Telemetry:',
        text: 'To power in-app cost estimation, rate-limit protection, and session diagnostics, the Platform may log non-sensitive metadata (such as a hashed key fingerprint, model identifier, token/byte counts, and latency). We never log or harvest your raw upstream API secret.',
      },
      {
        lead: 'Free Allowances & Fair Use:',
        text: 'Complimentary allowances (such as the 5 free deed drafts granted per device) are provided for evaluation purposes. Attempting to reset, spoof, or circumvent device fingerprinting or rate limits to obtain unlimited free server-side inference is a material breach of these Terms.',
      },
    ],
  },
  {
    id: 'billing',
    number: '8',
    title: '8. Subscriptions, Day Passes, Billing & Refund Policy',
    paragraphs: [
      'In addition to local/BYOK modes and open-source use, LandSurv.ai offers paid access tiers—including single-use Day Passes and recurring subscription plans—that provide managed server-side AI inference and cloud compute. Current pricing, included compute credits, and tier limits are displayed in the Upgrade & Billing modal at the time of purchase.',
    ],
    bullets: [
      {
        lead: 'Authorized Payment Processors:',
        text: 'Payments are processed through PCI-compliant third-party processors including Stripe and PayPal (see subprocessors.landsurv.ai). By submitting payment details, you authorize us and our processor to charge your designated payment method.',
      },
      {
        lead: 'Subscription Auto-Renewal & Cancellation:',
        text: 'Recurring subscriptions automatically renew at the end of each billing cycle (monthly or annual) unless cancelled prior to the renewal timestamp. You may cancel at any time via the in-app billing portal or by emailing billing@landsurv.ai; your paid access remains active through the conclusion of the current paid period.',
      },
      {
        lead: 'Day Passes & Compute Packs:',
        text: 'Day Passes provide time-boxed access (e.g., 24 hours from activation) to managed AI services and are subject to fair-use session pacing (such as periodic active-use check-ins to prevent unattended runaway scripts). Once activated, Day Passes are non-transferable and non-refundable.',
      },
      {
        lead: 'Refund Policy:',
        text: 'Except where mandated by applicable consumer protection law, subscription fees are non-refundable. However, if an unintended renewal occurs and you contact billing@landsurv.ai within seven (7) calendar days of the renewal charge without substantial usage during that renewal period, we may, at our reasonable discretion, issue a full or pro-rata refund.',
      },
      {
        lead: 'Taxes & Chargebacks:',
        text: 'Stated prices exclude applicable sales, use, VAT, or withholding taxes. Initiating a credit-card chargeback or payment dispute without first contacting billing@landsurv.ai to allow 10 business days for resolution will result in immediate suspension of your account and revocation of issued keys.',
      },
    ],
  },
  {
    id: 'claw',
    number: '9',
    title: '9. The LandSurv Claw, Permissive-Source Policy & Public GIS Datasets',
    paragraphs: [
      'Certain research agents (such as the Zoning Agent and Flood/Soils/Structures overlays) retrieve publicly accessible municipal, state, and federal geospatial data on your behalf. LandSurv.ai enforces strict technical and legal boundaries on automated retrieval:',
    ],
    bullets: [
      {
        lead: 'Hard-Blocked Commercial Codifiers:',
        text: 'The LandSurv Claw browser-automation engine operates under a strict Permissive-Source Policy. Commercial municipal-code publishing platforms whose terms of service prohibit automated scraping—specifically including eCode360 (General Code), Municode (CivicPlus), QCode, American Legal Publishing (amlegal.com), Code Publishing Co., Sterling Codifiers, and Conway Greene (lf-pubs.com)—are hard-blocked at the application and proxy layers. Neither the Claw nor our backend proxy will fetch, parse, or cache content from those hosts.',
      },
      {
        lead: 'User-Initiated Direct Browser Links:',
        text: 'Where a municipality hosts its ordinances on a restricted codifier, the Platform provides a transparent notice and a direct hyperlink so you can open the ordinance in your own web browser. Any manual browsing you perform occurs directly between your browser and that publisher.',
      },
      {
        lead: 'Public Government GIS & Environmental Layers:',
        text: 'Layers retrieved from federal, state, or municipal open-data endpoints—including FEMA National Flood Hazard Layer (NFHL), FEMA National Structure Inventory (NSI), USDA NRCS Web Soil Survey (SSURGO), USGS 3DEP / National Map elevation contours, and state GIS clearinghouses—are provided strictly as preliminary planning exhibits. Public GIS layers frequently have horizontal positional inaccuracies of 10 to 50+ feet and must never be used as a substitute for field-run topographic, wetland, or boundary surveys.',
      },
    ],
    footerParagraphs: [
      'You agree not to bypass, disable, or tamper with the Permissive-Source blocklist, nor instruct any Platform agent to scrape any third-party website in violation of its terms of service or robots.txt directives.',
    ],
  },
  {
    id: 'acceptable-use',
    number: '10',
    title: '10. Acceptable Use & Prohibited Conduct',
    paragraphs: [
      'You agree to use the Platform lawfully, ethically, and in accordance with all applicable professional-practice and AI safety standards. You must NOT use the Platform to:',
    ],
    bullets: [
      {
        lead: 'Unlawful Practice or Misrepresentation:',
        text: 'Hold yourself out as a licensed land surveyor, professional engineer, chartered surveyor, or attorney if you do not hold an active license, or affix a fraudulent seal, stamp, or certification to any Platform output.',
      },
      {
        lead: 'Unverified Reliance in High-Risk Contexts:',
        text: 'Submit or record any AI-generated legal description, boundary plat, structural layout, or flood/slope exhibit with a county recorder, municipality, or construction crew without independent verification by a qualified professional.',
      },
      {
        lead: 'Infringement & Confidentiality Breaches:',
        text: 'Upload copyrighted plans, proprietary client data, or classified government infrastructure documents that you lack legal authorization to process.',
      },
      {
        lead: 'Privacy & PII Violations:',
        text: 'Upload sensitive personal data (such as Social Security numbers, financial account numbers, protected health information, or biometric identifiers) in violation of GDPR, CCPA, HIPAA, or similar privacy laws.',
      },
      {
        lead: 'Security Abuse & Rate-Limit Evasion:',
        text: 'Probe, scan, fuzz, or penetration-test Platform infrastructure without prior written authorization; launch denial-of-service attacks; inject malicious payloads; or use automated scripts to abuse Day Passes or free deed allowances.',
      },
      {
        lead: 'Prohibited AI Use Cases:',
        text: 'Violate the Google Cloud Generative AI Prohibited Use Policy or the Anthropic Usage Policy, including generating malware, facilitating fraud or deception, conducting unlawful surveillance, or developing weapons.',
      },
    ],
  },
  {
    id: 'third-party',
    number: '11',
    title: '11. Third-Party Services, Photogrammetry & CAD Connectors',
    paragraphs: [
      'The Platform interoperates with specialized third-party cloud services, open-source processing engines, and desktop CAD environments:',
    ],
    bullets: [
      {
        lead: 'Cloud & AI Subprocessors:',
        text: 'Core infrastructure and inference rely on Google Cloud Platform, Google Cloud Vertex AI, Anthropic (via Vertex AI), Google Maps Platform, Stripe, and PayPal. A complete inventory of subprocessors is maintained at subprocessors.landsurv.ai, and third-party software licenses are documented at technologies.landsurv.ai.',
      },
      {
        lead: 'Drone / Photogrammetry Staging (NodeODM):',
        text: 'When you use the Drone Agent, aerial imagery is staged in ephemeral processing storage to execute photogrammetric orthomosaic, point-cloud, and DSM generation via NodeODM, with deliverables exported back to your connected storage. Temporary staging storage is not a permanent archival backup; you are responsible for retaining your original flight imagery and exported deliverables.',
      },
      {
        lead: 'RINEX / GNSS Post-Processing:',
        text: 'GNSS observation processing utilizes RTKLIB and public ephemeris/CORS data streams. Solutions depend on satellite geometry, atmospheric conditions, and base-station integrity and must be validated against known control monuments.',
      },
      {
        lead: 'Civil 3D & IntelliCAD Connectors (LandsurvConnector):',
        text: 'When you pair the desktop LandsurvConnector plugin via WebSocket/QR authentication, commands and geometry synchronize directly with your active drawing session. You are responsible for saving backups of your .dwg files prior to executing live synchronization or automated drafting commands.',
      },
    ],
  },
  {
    id: 'open-source',
    number: '12',
    title: '12. Open-Source Software & Open Specifications (landsurv-core, .lsvz, CACP)',
    paragraphs: [
      'LandSurv.ai is committed to verifiable geospatial mathematics and open industry standards. We publish and maintain the following open-source software and open specifications:',
    ],
    bullets: [
      {
        lead: 'landsurv-core (Apache License 2.0):',
        text: 'The core client-side CAD drawing canvas, COGO/traverse math engine, ALTA/NSPS closure verification, Delaunay TIN contouring, Point Editor, and CAD Manager are released as free and open-source software under the Apache License, Version 2.0 at github.com/LandSurvAi/landsurv-core (documented at opensource.landsurv.ai). Your use, modification, and distribution of the standalone landsurv-core source repository are governed by the Apache-2.0 license.',
      },
      {
        lead: '.lsvz Container Specification (CC BY 4.0):',
        text: 'The AI-native surveying project archive format (.lsvz) specification is published under Creative Commons Attribution 4.0 International (CC BY 4.0) at lsvz.landsurv.ai.',
      },
      {
        lead: 'CACP Protocol Specification (CC BY 4.0):',
        text: 'The Cross-Agent Communications Protocol (CACP) specification for multi-agent geospatial provenance and handoff is published under CC BY 4.0 at cacp.landsurv.ai.',
      },
    ],
    footerParagraphs: [
      'These Terms of Service govern your access to and use of the commercially hosted Platform at landsurv.ai and its managed cloud endpoints, without limiting any rights granted to you under Apache-2.0 or CC BY 4.0 for the standalone open-source repositories and specifications.',
    ],
  },
  {
    id: 'ip',
    number: '13',
    title: '13. Intellectual Property, Trademarks & DMCA Policy',
    paragraphs: [
      'All proprietary elements of the hosted Platform—including the "LandSurv.ai" name, logos, custom SVG iconography, UI design, cloud backend services, and curated documentation—are protected by United States and international copyright, trademark, and trade-secret laws.',
      'Feedback License: If you submit bug reports, feature suggestions, survey-code alias proposals, or workflow feedback to us, you grant LandSurv.ai a perpetual, irrevocable, worldwide, royalty-free license to use and incorporate that feedback into the Platform and our open-source projects without compensation or restriction.',
      'DMCA Copyright Notices: LandSurv.ai respects intellectual property rights. If you believe any material accessible on the Platform infringes your copyright, please submit a written notice compliant with the Digital Millennium Copyright Act, 17 U.S.C. § 512(c)(3), to our designated agent at dmca@landsurv.ai. Repeat infringers will have their access terminated.',
    ],
  },
  {
    id: 'privacy',
    number: '14',
    title: '14. Privacy, Data Processing, Security & Telemetry',
    paragraphs: [
      'Our collection, use, retention, and protection of personal data are governed by our live Privacy Policy at privacy.landsurv.ai, which is incorporated into these Terms by reference.',
    ],
    bullets: [
      {
        lead: 'Local-First Architecture:',
        text: 'Most interactive drafting state, point lists, and BYOK keys reside in your browser’s local storage unless you explicitly invoke cloud AI agents, cloud storage, or C3D WebSocket relay sync.',
      },
      {
        lead: 'Enterprise Data Processing Addendum (DPA) & Subprocessors:',
        text: 'Where LandSurv.ai processes personal data on behalf of a business customer subject to GDPR, UK GDPR, or CCPA, our Data Processing Addendum at dpa.landsurv.ai and our Subprocessor disclosures at subprocessors.landsurv.ai govern that processing.',
      },
      {
        lead: 'Security & Compliance Posture (SOC 2 + GDPR + SAIF):',
        text: 'LandSurv.ai maintains technical and organizational safeguards aligned with SOC 2 Trust Services Criteria, GDPR data-protection principles, Google’s Secure AI Framework (SAIF), and NIST SP 800-53 FedRAMP-readiness controls, as detailed in our Trust Center at compliance.landsurv.ai.',
      },
      {
        lead: 'Electronic Agreement & Communications:',
        text: 'When you sign the first-time legal agreement gate, we record your name, email address, drawn signature image, agreement version, timestamp, and user-agent string as an auditable compliance record, and you opt in to receive occasional product update emails (from which you may unsubscribe at any time via the one-click link in any email).',
      },
    ],
  },
  {
    id: 'export-controls',
    number: '15',
    title: '15. Export Controls, Sanctions & Trade Compliance',
    paragraphs: [
      'The Platform is operated from the United States and is subject to U.S. export administration and economic sanctions laws, including the Export Administration Regulations (EAR) administered by the U.S. Department of Commerce and sanctions programs administered by the U.S. Treasury Department’s Office of Foreign Assets Control (OFAC).',
      'You represent and warrant that: (a) you are not located in, ordinarily resident in, or organized under the laws of any country or territory subject to comprehensive U.S. embargoes (currently including Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and Luhansk regions of Ukraine); (b) you are not listed on, and are not owned or controlled by any party listed on, the OFAC Specially Designated Nationals (SDN) List, the U.S. Commerce Department Denied Persons or Entity Lists, or any equivalent U.K., E.U., or U.N. restricted-party list; and (c) you will not use the Platform for any military, nuclear, missile, or chemical/biological weapons end-use prohibited by U.S. export law.',
    ],
  },
  {
    id: 'warranty',
    number: '16',
    title: '16. Disclaimer of Warranties',
    accent: 'text-amber-300',
    conspicuous: true,
    conspicuousNote: 'The following disclaimer is required by law to be conspicuous — please read carefully.',
    paragraphs: [
      'THE PLATFORM, ALL AI AGENTS, THE LANDSURV CLAW, THE LANDSURVCONNECTOR PLUGIN, ALL PUBLIC GIS OVERLAYS (INCLUDING FEMA, USDA, AND USGS DATASETS), AND ALL OUTPUTS, CALCULATIONS, PLOTS, DRAWINGS, AND REPORTS ARE PROVIDED STRICTLY ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS, IMPLIED, OR STATUTORY.',
      'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LANDSURV.AI EXPRESSLY DISCLAIMS ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, PROFESSIONAL ACCURACY, POSITIONAL OR GEODETIC PRECISION, TITLE, QUIET ENJOYMENT, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING OR USAGE OF TRADE.',
      'LANDSURV.AI DOES NOT WARRANT THAT: (A) ANY AI-GENERATED BOUNDARY CLOSURE, LEGAL DESCRIPTION, COORDINATE, CONTOUR, SLOPE BAND, ZONING CITATION, OR COMPLIANCE AUDIT WILL BE ACCURATE, COMPLETE, RELIABLE, OR SUITABLE FOR RECORDING, DESIGN, OR CONSTRUCTION; (B) THE PLATFORM WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE; OR (C) ANY DEFECTS OR ERRORS WILL BE CORRECTED.',
    ],
  },
  {
    id: 'liability',
    number: '17',
    title: '17. Limitation of Liability',
    accent: 'text-amber-300',
    conspicuous: true,
    conspicuousNote: 'This section limits the remedies and damages you may recover from LandSurv.ai.',
    paragraphs: [
      'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL LANDSURV.AI, ITS FOUNDER, AFFILIATES, OFFICERS, EMPLOYEES, CONTRACTORS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES—OR FOR ANY LOSS OF PROFITS, REVENUE, GOODWILL, CLIENT CONTRACTS, DATA, CONSTRUCTION DELAYS, SURVEY RE-WORK COSTS, BOUNDARY DISPUTES, TITLE CLAIMS, OR REGULATORY PENALTIES—ARISING OUT OF OR RELATING TO YOUR ACCESS TO OR USE OF (OR INABILITY TO USE) THE PLATFORM OR RELIANCE ON ANY OUTPUT THEREOF, REGARDLESS OF THE THEORY OF LIABILITY (CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE), EVEN IF LANDSURV.AI HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.',
      'IN NO EVENT SHALL LANDSURV.AI’S TOTAL CUMULATIVE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE PLATFORM EXCEED THE GREATER OF: (A) THE TOTAL AMOUNT OF FEES ACTUALLY PAID BY YOU TO LANDSURV.AI IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM; OR (B) ONE HUNDRED U.S. DOLLARS (US$100.00).',
      'THE LIMITATIONS IN THIS SECTION APPLY EVEN IF ANY LIMITED REMEDY FAILS OF ITS ESSENTIAL PURPOSE. Some jurisdictions do not permit the exclusion of certain implied warranties or the limitation of liability for incidental or consequential damages; in such jurisdictions, our liability shall be limited to the smallest amount permitted by applicable law.',
    ],
  },
  {
    id: 'indemnification',
    number: '18',
    title: '18. Indemnification',
    paragraphs: [
      'You agree to defend, indemnify, and hold harmless LandSurv.ai, its founder, affiliates, officers, employees, contractors, and licensors from and against any and all third-party claims, demands, actions, investigations, losses, liabilities, damages, judgments, settlements, penalties, costs, and expenses (including reasonable attorneys’ and expert-witness fees) arising out of or relating to:',
    ],
    bullets: [
      {
        lead: '(a) Unverified Professional Reliance:',
        text: 'Any survey plat, deed description, engineering plan, construction stakeout, regulatory filing, or real-estate transaction prepared or executed by you or your clients using Platform output without independent verification;',
      },
      {
        lead: '(b) User Content:',
        text: 'Your User Content, including any allegation that your User Content infringes or misappropriates a third party’s copyright, trade secret, privacy, or property rights;',
      },
      {
        lead: '(c) Breach of Terms or Law:',
        text: 'Your breach of these Terms or violation of any applicable federal, state, local, or international law or professional-licensing regulation; or',
      },
      {
        lead: '(d) Unauthorized Scraping or API Abuse:',
        text: 'Your misuse of the LandSurv Claw, circumvention of the Permissive-Source Policy, or violation of any third-party data provider’s terms.',
      },
    ],
  },
  {
    id: 'termination',
    number: '19',
    title: '19. Suspension, Termination & Data Export',
    paragraphs: [
      'You may discontinue use of the Platform at any time and cancel any active subscription through the in-app billing controls or by contacting billing@landsurv.ai.',
      'We reserve the right to suspend, throttle, or terminate your access to the hosted Platform or revoke any issued API key—with or without prior notice—if we reasonably determine that: (a) you have breached these Terms or the Acceptable Use Policy; (b) your use poses a security, operational, or legal risk to the Platform or other users; (c) payment fees are overdue or subject to an unresolved chargeback; or (d) we are required to do so by law or an upstream cloud/model provider.',
      'Upon termination, your license to access the hosted Platform ceases immediately, though you may continue to use local files and open-source components under their respective licenses. Where technically and legally feasible, we will provide a thirty (30) day window upon written request for you to export any server-saved .lsvz project archives before permanent deletion. Sections 3, 5, 6, 12, 13, 15, 16, 17, 18, 19, 21, 22, and 23 survive any termination of these Terms.',
    ],
  },
  {
    id: 'changes',
    number: '20',
    title: '20. Modifications to the Platform or Terms',
    paragraphs: [
      'LandSurv.ai is a rapidly evolving geospatial AI platform. We may add, upgrade, transition between release stages (Pre-Alpha, Alpha, Beta, Release Candidate, General Availability), restyle, or retire specific agents, models, or features at any time.',
      'We may update these Terms from time to time to reflect new features, model-provider requirements, or legal developments. When we make changes, we will post the revised Terms at tos.landsurv.ai and update the "Version" and "Effective Date" at the top of the document. For material changes that adversely affect your rights, we will provide at least fourteen (14) days’ prior notice via an in-app banner, release-log notice, or email (unless an immediate change is required by law, safety policy, or security urgency). Your continued use of the Platform after the effective date of updated Terms constitutes your acceptance of those changes.',
    ],
  },
  {
    id: 'governing-law',
    number: '21',
    title: '21. Governing Law & Exclusive Venue',
    paragraphs: [
      'These Terms, and any dispute, claim, or controversy arising out of or relating to these Terms or the Platform, shall be governed by and construed in accordance with the internal laws of the Commonwealth of Pennsylvania, United States, without giving effect to any choice-of-law or conflict-of-laws principles (whether of Pennsylvania or any other jurisdiction), and by applicable United States federal law (including the Federal Arbitration Act). The United Nations Convention on Contracts for the International Sale of Goods (CISG) does not apply.',
      'Subject to the mandatory arbitration provisions in Section 22, any judicial proceeding permitted under these Terms shall be brought exclusively in the state or federal courts located in the Commonwealth of Pennsylvania, and both you and LandSurv.ai irrevocably consent to the personal jurisdiction and venue of those courts.',
    ],
  },
  {
    id: 'dispute',
    number: '22',
    title: '22. Dispute Resolution — Mandatory Binding Arbitration & Class-Action Waiver',
    accent: 'text-amber-300',
    conspicuous: true,
    conspicuousNote: 'Please read this section carefully — it requires individual arbitration and waives class actions and jury trials.',
    paragraphs: [
      'Informal Resolution First (60-Day Notice): Most technical or billing concerns can be resolved quickly. Before initiating any arbitration or court proceeding, you agree to send a written "Notice of Dispute" describing the nature of the claim and the relief sought to legal@landsurv.ai. You and LandSurv.ai agree to negotiate in good faith for sixty (60) days from receipt of the notice to resolve the matter informally.',
      'Binding Individual Arbitration: If a dispute is not resolved within 60 days, you and LandSurv.ai agree that any dispute, claim, or controversy arising out of or relating to these Terms or the Platform (a "Dispute") shall be resolved exclusively by final and binding individual arbitration administered by the American Arbitration Association ("AAA") under its Commercial Arbitration Rules (or Consumer Arbitration Rules if you are an individual consumer using the Platform for non-business purposes), before a single neutral arbitrator. The arbitration shall be conducted in English, either remotely by video/written submission or in Pennsylvania.',
      'CLASS-ACTION & JURY TRIAL WAIVER: YOU AND LANDSURV.AI AGREE THAT EACH PARTY MAY BRING CLAIMS AGAINST THE OTHER ONLY IN AN INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, CONSOLIDATED, MASS, OR REPRESENTATIVE PROCEEDING. UNLESS BOTH YOU AND LANDSURV.AI AGREE OTHERWISE IN WRITING, THE ARBITRATOR MAY NOT CONSOLIDATE MORE THAN ONE PERSON’S CLAIMS. TO THE EXTENT ANY CLAIM PROCEEDS IN COURT RATHER THAN ARBITRATION, BOTH PARTIES WAIVE ANY RIGHT TO A TRIAL BY JURY.',
      'Equitable & Small-Claims Carve-Outs: Notwithstanding the foregoing, either party may: (a) bring an individual action in a small-claims court of competent jurisdiction if the claim qualifies; or (b) seek temporary, preliminary, or permanent injunctive or equitable relief in a court of competent jurisdiction to protect its intellectual property rights, trade secrets, or platform security.',
      '30-Day Right to Opt Out: You may opt out of this arbitration agreement and class-action waiver by sending an email to legal@landsurv.ai with the subject line "Arbitration Opt-Out", stating your full name, account email address, and a clear statement that you wish to opt out of arbitration, within thirty (30) calendar days of first accepting these Terms.',
    ],
  },
  {
    id: 'misc',
    number: '23',
    title: '23. General Legal Provisions (Miscellaneous)',
    paragraphs: [
      'The following general contract principles apply to these Terms:',
    ],
    bullets: [
      {
        lead: 'Entire Agreement:',
        text: 'These Terms, together with the Legal & Compliance Disclosures (legal.landsurv.ai), Privacy Policy (privacy.landsurv.ai), Data Processing Addendum (dpa.landsurv.ai), and any applicable plan or API key terms, constitute the entire agreement between you and LandSurv.ai regarding the Platform and supersede all prior or contemporaneous understandings.',
      },
      {
        lead: 'Severability:',
        text: 'If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court or arbitrator of competent jurisdiction, that provision shall be modified to the minimum extent necessary to make it enforceable, and the remaining provisions shall remain in full force and effect.',
      },
      {
        lead: 'No Waiver:',
        text: 'Our failure or delay in exercising or enforcing any right or provision of these Terms shall not constitute a waiver of such right or provision.',
      },
      {
        lead: 'Assignment:',
        text: 'You may not assign, delegate, or transfer these Terms or any rights hereunder without our prior written consent. LandSurv.ai may freely assign these Terms in connection with a corporate reorganization, merger, acquisition, or sale of substantially all of its assets.',
      },
      {
        lead: 'Force Majeure:',
        text: 'Neither party shall be liable for any delay or failure in performance (other than payment obligations) resulting from causes beyond its reasonable control, including acts of God, internet or telecommunications backbone failures, upstream cloud-provider or AI-model-provider outages, cyberattacks, or government actions.',
      },
      {
        lead: 'Electronic Notices & Signatures:',
        text: 'You consent to receive all agreements, notices, disclosures, and communications electronically. Electronic signatures captured via the in-app SignatureForm carry the same legal effect as handwritten ink signatures under the U.S. ESIGN Act (15 U.S.C. § 7001 et seq.) and the Pennsylvania Electronic Transactions Act (73 P.S. § 2260.101 et seq.).',
      },
    ],
  },
  {
    id: 'contact',
    number: '24',
    title: '24. Contact Information & Legal Notices',
    paragraphs: [
      'Official questions, notices, and correspondence regarding these Terms or the Platform should be directed to our dedicated channels:',
    ],
    bullets: [
      {
        lead: 'Legal, Terms, DPA & Arbitration Notices:',
        text: 'legal@landsurv.ai',
      },
      {
        lead: 'General Product Support:',
        text: 'support@landsurv.ai',
      },
      {
        lead: 'Billing, Subscriptions & Refunds:',
        text: 'billing@landsurv.ai',
      },
      {
        lead: 'Security Vulnerability & Abuse Reporting:',
        text: 'security@landsurv.ai',
      },
      {
        lead: 'CAD & Geodetic Standards Inquiries:',
        text: 'standards@landsurv.ai',
      },
      {
        lead: 'DMCA Copyright Takedown Notices:',
        text: 'dmca@landsurv.ai',
      },
    ],
  },
];

export const TOS_RELATED_PAGES: Array<{
  href: string;
  host: string;
  title: string;
  description: string;
  accent: 'cyan' | 'emerald' | 'amber' | 'teal';
}> = [
  {
    href: 'https://legal.landsurv.ai',
    host: 'legal.landsurv.ai',
    title: 'Legal & Professional Practice',
    description: 'State licensing statutes (63 Pa. C.S. § 501), RICS disclosures, and professional-use boundaries.',
    accent: 'cyan',
  },
  {
    href: 'https://privacy.landsurv.ai',
    host: 'privacy.landsurv.ai',
    title: 'Privacy Policy',
    description: 'How personal data, local storage, telemetry, and GDPR/CCPA data-subject rights are handled.',
    accent: 'cyan',
  },
  {
    href: 'https://compliance.landsurv.ai',
    host: 'compliance.landsurv.ai',
    title: 'Security & Compliance Trust Center',
    description: 'SOC 2, GDPR, Google SAIF, Model Armor, and FedRAMP-readiness operational controls.',
    accent: 'teal',
  },
  {
    href: 'https://dpa.landsurv.ai',
    host: 'dpa.landsurv.ai',
    title: 'Data Processing Addendum',
    description: 'Controller/processor commitments, security safeguards, and incident-response framework.',
    accent: 'cyan',
  },
  {
    href: 'https://subprocessors.landsurv.ai',
    host: 'subprocessors.landsurv.ai',
    title: 'Subprocessors Inventory',
    description: 'Authorized cloud, AI inference (Google Cloud Vertex AI, Anthropic), and payment subprocessors.',
    accent: 'cyan',
  },
  {
    href: 'https://standards.landsurv.ai',
    host: 'standards.landsurv.ai',
    title: 'Industry & Geodetic Standards',
    description: 'NAD83/WGS84, SPCS, UTM, RINEX, ALTA/NSPS, and CAD compliance reference.',
    accent: 'cyan',
  },
  {
    href: 'https://opensource.landsurv.ai',
    host: 'opensource.landsurv.ai',
    title: 'landsurv-core (Open Source)',
    description: 'Apache-2.0 open-source core CAD, COGO, TIN, and multi-agent framework on GitHub.',
    accent: 'emerald',
  },
  {
    href: 'https://technologies.landsurv.ai',
    host: 'technologies.landsurv.ai',
    title: 'Technologies & Licenses',
    description: 'Complete third-party dependency inventory and open-source software attributions.',
    accent: 'cyan',
  },
  {
    href: 'https://lsvz.landsurv.ai',
    host: 'lsvz.landsurv.ai',
    title: '.lsvz Archive Specification',
    description: 'Open AI-native surveying project container specification (CC BY 4.0).',
    accent: 'amber',
  },
  {
    href: 'https://cacp.landsurv.ai',
    host: 'cacp.landsurv.ai',
    title: 'CACP Protocol Specification',
    description: 'Open Cross-Agent Communications Protocol for verifiable geospatial handoffs (CC BY 4.0).',
    accent: 'amber',
  },
];
