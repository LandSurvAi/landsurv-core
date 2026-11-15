/**
 * Single source of truth for the DevOps console navigation and command palette.
 *
 * The tab list used to be duplicated as a long row of hand-written buttons.
 * Keeping labels, groups, keywords and searchable sub-sections here means the
 * nav and the search index can never drift apart.
 */

export type DevOpsTabId =
  | 'dashboard'
  | 'subscribers'
  | 'apikeys'
  | 'deeds'
  | 'security'
  | 'compliance'
  | 'agents'
  | 'global'
  | 'settings'
  | 'cacp'
  | 'gatelog'
  | 'a2ui'
  | 'gateway'
  | 'rag'
  | 'prompts'
  | 'sandbox'
  | 'legal'
  | 'calls'
  | 'deepdocs'
  | 'emails'
  | 'licenses'
  | 'symbols';

export type DevOpsTabAccent =
  | 'cyan'
  | 'green'
  | 'rose'
  | 'teal'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'purple';

export interface DevOpsSearchSection {
  label: string;
  /** Sub-section id understood by the destination panel (SurveyBrain today). */
  section?: string;
  keywords?: string[];
}

export interface DevOpsTab {
  id: DevOpsTabId;
  label: string;
  icon: string;
  group: string;
  hint: string;
  accent: DevOpsTabAccent;
  keywords: string[];
  sections?: DevOpsSearchSection[];
}

/** Full nav, ordered for day-to-day operations. */
export const DEVOPS_TABS: DevOpsTab[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '◈',
    group: 'Operate',
    hint: 'Service health, traffic and launch readiness',
    accent: 'cyan',
    keywords: ['home', 'overview', 'health', 'services', 'traffic', 'billing', 'stripe', 'telemetry'],
    sections: [
      { label: 'Service health & traffic', keywords: ['frontend', 'backend', 'surveybrain', 'scout', 'claw', 'uptime', 'latency', 'probe'] },
      { label: 'Stripe billing readiness', keywords: ['billing', 'checkout', 'webhook', 'catalog', 'recaptcha'] },
      { label: 'App telemetry · 30d', keywords: ['actions', 'users', 'errors', 'response time'] },
      { label: 'Quick actions', keywords: ['refresh', 'pull global settings', 'manage agents'] },
    ],
  },
  {
    id: 'subscribers',
    label: 'Subscribers',
    icon: '◎',
    group: 'Operate',
    hint: 'Accounts, access and plan state',
    accent: 'cyan',
    keywords: ['users', 'customers', 'accounts', 'stripe', 'api key', 'service access'],
    sections: [{ label: 'Subscriber directory', keywords: ['email', 'user id', 'created', 'last seen'] }],
  },
  {
    id: 'apikeys',
    label: 'API Keys',
    icon: '⌘',
    group: 'Operate',
    hint: 'Who used a key and when',
    accent: 'cyan',
    keywords: ['tokens', 'credentials', 'usage', 'last used', 'issue key'],
    sections: [{ label: 'API key usage', keywords: ['key', 'owner', 'requests', 'last used'] }],
  },
  {
    id: 'deeds',
    label: 'Deeds',
    icon: '▤',
    group: 'Operate',
    hint: 'Free and keyholder deed ledger',
    accent: 'green',
    keywords: ['fingerprint', 'device', 'allowance', 'free deed', 'keyholder'],
    sections: [{ label: 'Deed ledger & device fingerprints', keywords: ['device', 'remaining', 'ip', 'user agent'] }],
  },
  {
    id: 'security',
    label: 'Security',
    icon: '◉',
    group: 'Operate',
    hint: 'MFA and authentication events',
    accent: 'rose',
    keywords: ['mfa', 'login', 'auth', 'audit', 'risk', 'events'],
    sections: [{ label: 'Authentication security events', keywords: ['mfa', 'challenge', 'failure', 'success'] }],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: '▣',
    group: 'Operate',
    hint: 'SOC 2 and GDPR workflows',
    accent: 'teal',
    keywords: ['soc 2', 'gdpr', 'privacy', 'retention', 'dsar', 'audit'],
    sections: [{ label: 'Compliance workflows', keywords: ['soc 2', 'gdpr', 'retention', 'request'] }],
  },
  {
    id: 'rag',
    label: 'SurveyBrain',
    icon: '◍',
    group: 'Operate',
    hint: 'Crawl, corpus and semantic search',
    accent: 'cyan',
    keywords: ['rag', 'ingest', 'crawler', 'embedding', 'pgvector', 'documents', 'search', 'scout', 'sources', 'state dot'],
    sections: [
      { label: 'Live run feed', section: 'live', keywords: ['activity', 'events', 'crawler', 'progress'] },
      { label: 'Overview', section: 'overview', keywords: ['budget', 'embedding', 'corpus', 'health'] },
      { label: 'Corpus & documents', section: 'corpus', keywords: ['documents', 'chunks', 'dedupe', 'sources'] },
      { label: 'Start ingestion', section: 'ingest', keywords: ['new run', 'sources', 'scout discovery', 'state dot', 'custom', 'pages per domain'] },
      { label: 'Semantic query', section: 'query', keywords: ['search', 'ask', 'retrieval', 'vector'] },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: '◇',
    group: 'Configure',
    hint: 'Agent roster and retirement',
    accent: 'cyan',
    keywords: ['roster', 'models', 'retire', 'retired', 'capabilities'],
    sections: [{ label: 'Agent roster', keywords: ['model', 'status', 'retire'] }],
  },
  {
    id: 'global',
    label: 'Global',
    icon: '◐',
    group: 'Configure',
    hint: 'World-wide settings for every user',
    accent: 'amber',
    keywords: ['world settings', 'defaults', 'global settings', 'reset'],
    sections: [{ label: 'World settings', keywords: ['defaults', 'save', 'reset'] }],
  },
  {
    id: 'settings',
    label: 'Debug Settings',
    icon: '⚙',
    group: 'Configure',
    hint: 'Console diagnostics and session reset',
    accent: 'cyan',
    keywords: ['debug', 'diagnostics', 'clean session', 'reset', 'devops settings'],
    sections: [{ label: 'Debug settings & clean session', keywords: ['dev session reset', 'local storage', 'open clean session'] }],
  },
  {
    id: 'cacp',
    label: 'CACP Log',
    icon: '⇄',
    group: 'Build',
    hint: 'Cross-agent communication traffic',
    accent: 'emerald',
    keywords: ['inter-agent', 'messages', 'commands', 'trace', 'handlers'],
    sections: [{ label: 'CACP traffic log', keywords: ['phase', 'trace', 'policy', 'handler'] }],
  },
  {
    id: 'gatelog',
    label: 'Gate Log',
    icon: '▷',
    group: 'Build',
    hint: 'Gate 1 / Gate 2 visitor arrivals',
    accent: 'emerald',
    keywords: ['gate', 'visitors', 'signed', 'unsigned', 'entry'],
    sections: [{ label: 'Visitor gate log', keywords: ['gate 1', 'gate 2', 'signed', 'unsigned'] }],
  },
  {
    id: 'a2ui',
    label: 'A2UI',
    icon: '▦',
    group: 'Build',
    hint: 'Internal surface catalog',
    accent: 'cyan',
    keywords: ['surfaces', 'manifest', 'cacp', 'review', 'components'],
    sections: [{ label: 'A2UI surfaces', keywords: ['manifest', 'review', 'catalog'] }],
  },
  {
    id: 'gateway',
    label: 'AI Gateway',
    icon: '⇌',
    group: 'Configure',
    hint: 'Kill switches for external models',
    accent: 'emerald',
    keywords: ['claude', 'chatgpt', 'gpt', 'grok', 'kill switch', 'platforms'],
    sections: [{ label: 'AI gateway kill switches', keywords: ['claude', 'gpt', 'grok', 'enabled'] }],
  },
  {
    id: 'prompts',
    label: 'Prompts',
    icon: '¶',
    group: 'Configure',
    hint: 'Agent system instructions without redeploy',
    accent: 'emerald',
    keywords: ['system prompt', 'instructions', 'edit', 'agents'],
    sections: [{ label: 'System prompt editor', keywords: ['prompt id', 'text', 'save', 'delete'] }],
  },
  {
    id: 'sandbox',
    label: 'Math Sandbox',
    icon: '∑',
    group: 'Build',
    hint: 'Boundary and closure math engine',
    accent: 'emerald',
    keywords: ['boundary', 'closure', 'math', 'calculation', 'test'],
    sections: [{ label: 'Boundary / closure calculator', keywords: ['traverse', 'misclosure', 'area'] }],
  },
  {
    id: 'legal',
    label: 'Legal',
    icon: '✍',
    group: 'Content',
    hint: 'First-time agreement signatures',
    accent: 'cyan',
    keywords: ['terms', 'tos', 'signatures', 'consent', 'agreements'],
    sections: [{ label: 'Legal signatures', keywords: ['tos', 'version', 'signed'] }],
  },
  {
    id: 'calls',
    label: 'Calls',
    icon: '☎',
    group: 'Content',
    hint: 'Homepage voicemails',
    accent: 'emerald',
    keywords: ['voicemail', 'answering machine', 'phone', 'messages'],
    sections: [{ label: 'Voicemail inbox', keywords: ['recording', 'caller', 'transcript'] }],
  },
  {
    id: 'deepdocs',
    label: 'Deep Docs',
    icon: '▥',
    group: 'Content',
    hint: 'Under-the-hood system documentation',
    accent: 'violet',
    keywords: ['documentation', 'architecture', 'scout', 'surveybrain', 'cacp', 'security'],
    sections: [
      { label: 'Scout browser fleet (Claw consolidated)', keywords: ['claw', 'browser', 'playwright', 'tools', 'consolidation'] },
      { label: 'SurveyBrain architecture', keywords: ['crawler', 'embedding', 'pgvector'] },
    ],
  },
  {
    id: 'emails',
    label: 'Email Campaigns',
    icon: '✉',
    group: 'Content',
    hint: 'Feedback campaigns and automation',
    accent: 'cyan',
    keywords: ['email', 'campaign', 'feedback', 'automation', 'send'],
    sections: [{ label: 'Email campaign manager', keywords: ['audience', 'send', 'draft'] }],
  },
  {
    id: 'licenses',
    label: 'Licenses',
    icon: '⚖',
    group: 'Content',
    hint: 'Third-party licences and monetization audit',
    accent: 'emerald',
    keywords: ['license', 'monetization', 'audit', 'third party'],
    sections: [{ label: 'Licence audit', keywords: ['dependency', 'usage', 'commercial'] }],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    icon: '⬡',
    group: 'Content',
    hint: 'Starter symbol pack (.dxf)',
    accent: 'cyan',
    keywords: ['symbols', 'dxf', 'block', 'library', 'upload'],
    sections: [{ label: 'Starter symbol library', keywords: ['dxf', 'upload', 'categories'] }],
  },
];

/** Active-tab styles are static strings so Tailwind keeps every class. */
export const DEVOPS_TAB_ACTIVE: Record<DevOpsTabAccent, string> = {
  cyan: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  green: 'border-green-400/40 bg-green-400/10 text-green-200',
  rose: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
  teal: 'border-teal-400/40 bg-teal-400/10 text-teal-200',
  emerald: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  violet: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
  purple: 'border-purple-400/40 bg-purple-400/10 text-purple-200',
};
