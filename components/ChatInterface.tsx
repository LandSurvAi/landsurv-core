import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type ChatMessage, MessageRole, AgentType, useAgent, useUI } from '../types.ts';
import { useUIState } from '../contexts/UIStateContext.tsx';
import { SendIcon, BrainCircuitIcon, StopIcon, LsvzIcon, DxfAnalyzerIcon, LightbulbIcon, CourthouseIcon, RoadIcon, PlumbBobIcon, DocumentDuplicateIcon, ChevronDownIcon, ChevronUpIcon, FolderIcon, DocumentTextIcon, CrosshairsIcon, CameraIcon, ArrowUpTrayIcon, ChevronDoubleRightIcon, GisAgentIcon, SparklesIcon } from './icons.tsx';
import SuggestedQuestions from './SuggestedQuestions.tsx';
import { ToolsDrawer } from './ToolsDrawer.tsx';
import { agentThemeColors } from '../constants/agents.ts';
import { sanitizeZoningAnswer } from '../utils/zoningRender.ts';
import { formatChatHtml } from '../utils/chatHtml.ts';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (query: string) => void;
  onStopGenerating: () => void;
  isLoading: boolean;
  suggestedQuestions: string[];
  onToggleExpand: (msgIndex: number) => void;
  thinkingTime: number;
  currentModelName?: string;
  headerControls?: React.ReactNode;
  toolsContent?: React.ReactNode;
  toolsIcon?: React.ReactNode;
  toolsTitle?: string;
}

const MODEL_LABELS: Record<string, string> = {
    'gemini-3.7-flash': 'Gemini 3.7 Flash',
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
    'claude-sonnet-5': 'Claude Sonnet 5',
    'claude-opus-5': 'Claude Opus 5',
    'claude-fable-5': 'Claude Fable 5',
};

function formatModelDisplay(id?: string): string {
    if (!id) return '';
    return MODEL_LABELS[id] || id;
}

const agentLabels: { [key in AgentType]?: string } = {
    [AgentType.RAW_CRAWLER]: 'RAW Crawler',
    [AgentType.DEED_READER]: 'Boundary Agent',
    [AgentType.CENTERLINE_STATIONING]: 'Stationing & CL',
    [AgentType.POINT_EDITOR]: 'Point Editor',
    [AgentType.GPS_STAKEOUT]: 'GPS Rover',
    [AgentType.FIELD_BOOK]: 'Field Book',
    [AgentType.LSVZ_AGENT]: 'LSVZ Meta-Agent',
    [AgentType.CIVIL_PLAN_EXPERT]: 'Civil Plan Expert',
    [AgentType.DXF_ANALYZER]: 'DXF Analyzer',
    [AgentType.IMAGE_ANALYZER]: 'Image Analyzer',
    [AgentType.GIS_AGENT]: 'GIS Agent',
    [AgentType.STEEP_SLOPE_AGENT]: 'Steep Slope',
    [AgentType.COGO_AGENT]: 'COGO',
};

const themeClasses: { [key in AgentType]?: { gradient: string; accent: string; }} = {
    [AgentType.RAW_CRAWLER]: { gradient: 'from-cyan-500 to-blue-600', accent: 'accent-cyan-500' },
    [AgentType.DEED_READER]: { gradient: 'from-green-500 to-emerald-600', accent: 'accent-green-500' },
    [AgentType.CIVIL_PLAN_EXPERT]: { gradient: 'from-orange-500 to-amber-600', accent: 'accent-orange-500' },
    [AgentType.DXF_ANALYZER]: { gradient: 'from-indigo-500 to-violet-600', accent: 'accent-indigo-500' },
    [AgentType.GIS_AGENT]: { gradient: 'from-teal-500 to-cyan-600', accent: 'accent-teal-500' },
    [AgentType.STEEP_SLOPE_AGENT]: { gradient: 'from-orange-500 to-red-600', accent: 'accent-orange-500' },
    [AgentType.CENTERLINE_STATIONING]: { gradient: 'from-purple-500 to-violet-600', accent: 'accent-purple-500' },
    [AgentType.POINT_EDITOR]: { gradient: 'from-yellow-500 to-amber-600', accent: 'accent-yellow-500' },
    [AgentType.GPS_STAKEOUT]: { gradient: 'from-blue-500 to-indigo-600', accent: 'accent-blue-500' },
    [AgentType.IMAGE_ANALYZER]: { gradient: 'from-red-500 to-orange-600', accent: 'accent-red-500' },
    [AgentType.LSVZ_AGENT]: { gradient: 'from-slate-500 to-gray-600', accent: 'accent-slate-500' },
    [AgentType.COGO_AGENT]: { gradient: 'from-violet-500 to-purple-600', accent: 'accent-violet-500' },
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, onStopGenerating, isLoading, suggestedQuestions, onToggleExpand, thinkingTime, currentModelName, headerControls, toolsContent, toolsIcon, toolsTitle }) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { activeAgent } = useAgent();
  const { toggleChatPanel } = useUI();
  const { isToolsDrawerOpen, setIsToolsDrawerOpen } = useUIState();

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
      setShowSuggestions(false);
      // Close chat panel after sending message on mobile to show FAB
      toggleChatPanel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, showSuggestions]);

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopyConversation = useCallback(async () => {
    const stripHtml = (s: string) => s.replace(/<br\s*\/?>(\s*)/gi, '\n').replace(/<[^>]+>/g, '');
    const agentLabel = agentLabels[activeAgent] || activeAgent;
    const lines: string[] = [];
    lines.push('# LandSurv.ai Conversation Export');
    lines.push(`Agent: ${agentLabel} (${activeAgent})`);
    lines.push(`Exported: ${new Date().toISOString()}`);
    lines.push(`URL: ${typeof window !== 'undefined' ? window.location.href : 'n/a'}`);
    lines.push(`UserAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}`);
    lines.push(`Messages: ${messages.length}`);
    lines.push('');
    messages.forEach((msg, i) => {
      const role = msg.role === MessageRole.USER ? 'USER' : 'ASSISTANT';
      lines.push(`## [${i + 1}] ${role}`);
      if (msg.thinking) {
        lines.push('<details><summary>thinking</summary>');
        lines.push('');
        lines.push(stripHtml(msg.thinking));
        lines.push('');
        lines.push('</details>');
      }
      const body = msg.result || msg.text || '';
      lines.push(stripHtml(body));
      if (msg.sources && msg.sources.length > 0) {
        lines.push('');
        lines.push('### Sources');
        msg.sources.forEach((src: any, idx: number) => {
          const title = src?.title || src?.name || 'source';
          const uri = src?.uri || src?.url || '';
          lines.push(`- [${idx + 1}] ${title}${uri ? ` — ${uri}` : ''}`);
        });
      }
      lines.push('');
    });
    const text = lines.join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyStatus('copied');
    } catch (err) {
      console.error('[ChatInterface] copy conversation failed', err);
      setCopyStatus('error');
    }
    setTimeout(() => setCopyStatus('idle'), 1800);
  }, [messages, activeAgent]);

  const theme = themeClasses[activeAgent] || { gradient: 'from-gray-500 to-gray-600', accent: 'accent-gray-500' };
  
  // DEBUG: Log tools content
  useEffect(() => {
    console.log('[ChatInterface] activeAgent:', activeAgent, 'toolsContent:', !!toolsContent, 'toolsTitle:', toolsTitle);
  }, [activeAgent, toolsContent, toolsTitle]);

  return (
    <>
      <ToolsDrawer
        isOpen={isToolsDrawerOpen}
        onToggle={() => setIsToolsDrawerOpen(!isToolsDrawerOpen)}
        title={toolsTitle || 'Tools'}
        icon={toolsIcon}
      >
        {toolsContent}
      </ToolsDrawer>

      <div className="flex flex-col h-full bg-gray-800 text-gray-200 light-theme:bg-gray-100 light-theme:text-gray-800">
        <header className="flex-shrink-0 flex items-center justify-between p-2 h-[50px] border-b border-gray-700/30 bg-gray-900/40 backdrop-blur light-theme:border-gray-300/30 light-theme:bg-white/40">
          <div className="flex items-center gap-2 min-w-0">
            {headerControls}
          </div>
        <div className="flex items-center gap-1">
          <button
              onClick={handleCopyConversation}
              disabled={messages.length === 0}
              className={`p-2 rounded-full transition-colors light-theme:hover:text-black ${
                copyStatus === 'copied'
                  ? 'text-green-400'
                  : copyStatus === 'error'
                    ? 'text-red-400'
                    : 'text-gray-400 hover:text-white light-theme:text-gray-500'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy conversation (for AI debugging)'}
          >
              <DocumentDuplicateIcon className="w-5 h-5" />
          </button>
          <button
              onClick={toggleChatPanel}
              className="p-2 text-gray-400 hover:text-white rounded-full transition-colors light-theme:text-gray-500 light-theme:hover:text-black"
              title="Hide Chat"
          >
              <ChevronDownIcon className="w-6 h-6 md:hidden" />
              <ChevronDoubleRightIcon className="w-6 h-6 hidden md:block" />
          </button>
        </div>
      </header>

      <div className="flex-grow overflow-y-auto p-4 space-y-6">
        {messages.map((msg, index) => (
          <div key={index} className={`flex min-w-0 items-start gap-3 ${msg.role === MessageRole.USER ? 'justify-end' : 'justify-start'}`}>
            <div className={`min-w-0 max-w-full md:max-w-xl p-3 rounded-lg overflow-hidden ${msg.role === MessageRole.USER ? 'bg-gray-700/90 text-gray-100 rounded-br-none border border-gray-600/40' : 'bg-gray-800/80 text-gray-200 rounded-bl-none border border-gray-700/30 light-theme:bg-gray-200 light-theme:text-gray-800'}`}>
              {msg.role === MessageRole.MODEL && formatModelDisplay(msg.model || currentModelName) && (
                <div className="mb-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-purple-900/30 text-purple-300 border border-purple-500/20 light-theme:bg-purple-100 light-theme:text-purple-700 light-theme:border-purple-300">
                    <SparklesIcon className="w-3 h-3 text-purple-400" />
                    <span>{formatModelDisplay(msg.model || currentModelName)}</span>
                </div>
              )}
              {msg.thinking && (
                <div className="mb-2">
                    <button onClick={() => onToggleExpand(index)} className="flex items-center gap-1 text-xs text-gray-400 font-semibold mb-1">
                        {msg.isExpanded ? <ChevronUpIcon className="w-3 h-3"/> : <ChevronDownIcon className="w-3 h-3"/>}
                        AI's Thought Process
                    </button>
                    {msg.isExpanded && <p className="text-xs text-gray-400 border-l-2 border-gray-500 pl-2" dangerouslySetInnerHTML={{ __html: formatChatHtml(msg.thinking) }} />}
                </div>
              )}
              <div
                className="text-sm leading-relaxed break-words [overflow-wrap:anywhere] [&>*]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_code]:break-words [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: (() => {
                const raw = msg.result || msg.text || '';
                if (activeAgent === AgentType.ZONING_AGENT && msg.role === MessageRole.MODEL) {
                  const cleaned = sanitizeZoningAnswer(raw);
                  if (!cleaned) {
                    // Bubble stripped to nothing (e.g. mid-hop while only claw
                    // directives have streamed). Show a subtle live hint.
                    return '<span class="text-gray-500 italic">Researching live ordinance… (see Claw status)</span>';
                  }
                  return formatChatHtml(cleaned);
                }
                return formatChatHtml(raw);
              })() }}
              />
              
              {/* View Sources button for intelligent search results */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-600">
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      View Sources ({msg.sources.length} page{msg.sources.length !== 1 ? 's' : ''})
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {msg.sources.map((source: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <a 
                            href={source.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            {source.searchTitle || source.url.split('/').pop() || 'Ordinance Page'}
                          </a>
                          {source.wordCount && (
                            <span className="text-gray-500 ml-4">
                              ({source.wordCount.toLocaleString()} words extracted)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === MessageRole.MODEL && (
          <div className="flex items-start gap-3 justify-start">
            <div className="max-w-xl p-3 rounded-lg bg-gray-700 text-gray-200 rounded-bl-none light-theme:bg-gray-200 light-theme:text-gray-800">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    <span className="text-xs text-gray-400 ml-2">({(thinkingTime / 1000).toFixed(1)}s)</span>
                </div>
            </div>
          </div>
        )}
        {showSuggestions && <SuggestedQuestions questions={suggestedQuestions} onQuestionSelect={(q) => { onSendMessage(q); setShowSuggestions(false); toggleChatPanel(); }} fontSize={14} activeAgent={activeAgent} />}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 p-3 border-t border-gray-700 bg-gray-900/50 light-theme:border-gray-300 light-theme:bg-white/50">
        {/* Tools Row - Above input */}
        {toolsContent && (
          <div className="flex items-center gap-2 mb-2 pl-2">
            <button
              onClick={() => setIsToolsDrawerOpen(!isToolsDrawerOpen)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                isToolsDrawerOpen
                  ? 'bg-gray-700/20 border'
                  : 'bg-gray-700 hover:bg-gray-600 border border-gray-600'
              }`}
              style={{
                color: agentThemeColors[activeAgent] || '#94a3b8',
                borderColor: isToolsDrawerOpen ? agentThemeColors[activeAgent] || '#94a3b8' : undefined,
              }}
              title="Toggle Tools"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>{toolsTitle || 'Tools'}</span>
            </button>
          </div>
        )}

        <div className={`relative bg-gray-700 rounded-lg p-1 border border-transparent focus-within:border-${theme.accent.split('-')[1]}-500 transition-colors light-theme:bg-gray-200`}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question or give a command..."
            rows={1}
            className="w-full bg-transparent text-gray-200 resize-none focus:outline-none p-2 pr-24 text-sm light-theme:text-gray-800"
            style={{ minHeight: '40px' }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {suggestedQuestions.length > 0 && (
                <button 
                  onClick={() => setShowSuggestions(p => !p)} 
                  className={`p-2 text-yellow-400 hover:bg-yellow-500/10 rounded-full ${!showSuggestions ? 'animate-pulse-yellow-glow' : ''}`} 
                  title="Suggested Questions"
                >
                    <LightbulbIcon className="w-5 h-5"/>
                </button>
            )}
            {isLoading ? (
              <button onClick={onStopGenerating} className="p-2 text-red-400 bg-red-800/50 rounded-full hover:bg-red-700/50" title="Stop Generating">
                <StopIcon className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()} className="p-2 text-white bg-blue-600 rounded-full hover:bg-blue-700 disabled:bg-gray-500" title="Send Message">
                <SendIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};