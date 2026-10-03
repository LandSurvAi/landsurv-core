/**
 * LayerAnalysisChat Component
 * 
 * AI-powered chat interface that analyzes pulled layers from Civil 3D
 * and asks clarifying questions before creating a standard.
 * 
 * The AI will:
 * - Identify patterns in layer names (prefixes, suffixes, delimiters)
 * - Ask about discipline codes (X, C, V, L, etc.)
 * - Clarify ambiguous or unknown layer purposes
 * - Build understanding before generating the standard
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMirrorError } from '../../hooks/useMirrorError';
import { StandardDefinition, CodeDefinition } from '../../contexts/types/CadManager.types';
import { startGeminiChat } from '../../services/geminiService';
import { useSettings, AgentType, type Chat } from '../../types';
import { parseMarkdownToStandard, generateLinetypesFromCodes } from '../../utils/markdownTableParser';

export interface LayerInfo {
  name: string;
  colorIndex?: number;
  colorRgb?: string;
  linetype?: string;
  lineWeight?: string;
  isOff?: boolean;
  isFrozen?: boolean;
  isLocked?: boolean;
  isPlottable?: boolean;
  description?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface LayerAnalysisChatProps {
  layers: LayerInfo[];
  drawingName: string;
  onStandardGenerated: (standard: StandardDefinition) => void;
  onCancel: () => void;
}

/**
 * Analyze layers and generate initial prompt for AI
 */
function analyzeLayersForPrompt(layers: LayerInfo[]): string {
  // Group layers by prefix patterns
  const prefixGroups = new Map<string, string[]>();
  const suffixPatterns = new Map<string, number>();
  const delimiters = new Map<string, number>();
  
  layers.forEach(layer => {
    const name = layer.name;
    
    // Detect delimiters
    if (name.includes('-')) delimiters.set('-', (delimiters.get('-') || 0) + 1);
    if (name.includes('_')) delimiters.set('_', (delimiters.get('_') || 0) + 1);
    if (name.includes('.')) delimiters.set('.', (delimiters.get('.') || 0) + 1);
    
    // Extract prefix (first part before delimiter)
    const parts = name.split(/[-_\.]/);
    if (parts.length > 0) {
      const prefix = parts[0].toUpperCase();
      if (!prefixGroups.has(prefix)) {
        prefixGroups.set(prefix, []);
      }
      prefixGroups.get(prefix)!.push(name);
    }
    
    // Extract suffix patterns
    if (parts.length > 1) {
      const suffix = parts[parts.length - 1].toUpperCase();
      suffixPatterns.set(suffix, (suffixPatterns.get(suffix) || 0) + 1);
    }
  });
  
  // Build layer summary
  const layerSummary: string[] = [];
  
  // Sort prefixes by count
  const sortedPrefixes = Array.from(prefixGroups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20); // Top 20 prefixes
  
  sortedPrefixes.forEach(([prefix, layers]) => {
    layerSummary.push(`- "${prefix}" prefix: ${layers.length} layers (e.g., ${layers.slice(0, 3).join(', ')})`);
  });
  
  // Find most common delimiter
  const primaryDelimiter = Array.from(delimiters.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
  
  // Find common suffixes
  const commonSuffixes = Array.from(suffixPatterns.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([suffix, count]) => `"${suffix}" (${count}x)`);
  
  // Sample of full layer names
  const sampleLayers = layers
    .slice(0, 30)
    .map(l => l.name)
    .join('\n- ');
  
  return `I've pulled ${layers.length} layers from the Civil 3D drawing "${layers[0]?.name?.split('-')[0] || 'Unknown'}".

**Layer Naming Pattern Analysis:**
- Primary delimiter: "${primaryDelimiter}"
- Found ${prefixGroups.size} unique prefixes

**Prefix Distribution:**
${layerSummary.join('\n')}

**Common Suffixes:** ${commonSuffixes.length > 0 ? commonSuffixes.join(', ') : 'None detected'}

**Sample Layers:**
- ${sampleLayers}

Please analyze these layers and ask me any clarifying questions about:
1. What the various prefixes mean (discipline codes, project codes, etc.)
2. The purpose of any unusual or ambiguous layers
3. How I want codes organized (by discipline, feature type, etc.)
4. Any naming conventions specific to my firm

After you understand my layer structure, you'll help me create a complete CAD standards definition.`;
}

/**
 * System message for the AI
 */
const SYSTEM_MESSAGE = `You are a Civil CAD Standards Assistant analyzing layers pulled from a Civil 3D drawing.

Your job is to:
1. FIRST ASK QUESTIONS to understand the user's layer naming conventions
2. Identify patterns, prefixes, and disciplines
3. Clarify any ambiguous or unknown layers
4. THEN generate a complete standards definition

## IMPORTANT - ASK QUESTIONS FIRST:
Do NOT immediately generate a standards table. Instead, ask 3-5 clarifying questions such as:
- "I see layers starting with 'X-' - does X represent a specific discipline or is it a prefix convention?"
- "What does the suffix '_A' or '_ANNO' represent in your layers?"
- "I notice 'HEA-' prefix on several layers - is this a project code or firm abbreviation?"
- "How should I categorize layers like 'Defpoints' or numbered layers like '0'?"

## AFTER UNDERSTANDING:
Once the user has answered your questions, generate a markdown table with:
| Code | Description | Point Layer | Line Layer | Linetype | Symbol | Category |

Use "-" for Symbol on linework codes (edges, boundaries, etc.)
Only assign symbols to point features (monuments, structures, utilities at single points).

Be conversational and helpful. Ask follow-up questions if answers are unclear.`;

export const LayerAnalysisChat: React.FC<LayerAnalysisChatProps> = ({
  layers,
  drawingName,
  onStandardGenerated,
  onCancel,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'Layer analysis', kind: 'layer-analysis-error' });
  const [generatedStandard, setGeneratedStandard] = useState<StandardDefinition | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { settings } = useSettings();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize chat with layer analysis
  useEffect(() => {
    const initializeChat = async () => {
      if (layers.length === 0) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Start Gemini chat with proper parameters
        const geminiChat = startGeminiChat(
          AgentType.CAD_MANAGER,
          SYSTEM_MESSAGE,
          'gemini-3.7-flash',
          settings
        );
        setChat(geminiChat);
        
        // Generate initial analysis prompt
        const analysisPrompt = analyzeLayersForPrompt(layers);
        
        // Add user message showing the analysis
        const userMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'user',
          content: analysisPrompt,
          timestamp: new Date(),
        };
        setMessages([userMsg]);
        
        // Get AI response
        const response = await geminiChat.sendMessage({ message: analysisPrompt });
        const responseText = response.text || '';
        
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}-response`,
          role: 'assistant',
          content: responseText,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMsg]);
        
      } catch (err) {
        console.error('Failed to initialize layer analysis chat:', err);
        setError(err instanceof Error ? err.message : 'Failed to start AI analysis');
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeChat();
  }, [layers, settings]);

  /**
   * Send a message to the AI
   */
  const handleSend = async () => {
    if (!inputValue.trim() || !chat || isLoading) return;
    
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await chat.sendMessage({ message: userMessage.content });
      const responseText = response.text || '';
      
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-response`,
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      
      // Check if response contains a markdown table (standard generated)
      if (responseText.includes('| Code |') && responseText.includes('| Description |')) {
        try {
          const parsed = parseMarkdownToStandard(responseText);
          if (parsed && parsed.codes.length > 0) {
            // Add linetypes
            const linetypes = generateLinetypesFromCodes(parsed.codes);
            parsed.linetypes = linetypes;
            parsed.name = `${drawingName} Standards`;
            parsed.description = `Standards generated from ${layers.length} layers in ${drawingName}`;
            parsed.lastUpdated = new Date().toISOString();
            setGeneratedStandard(parsed);
          }
        } catch (parseErr) {
          console.log('Response did not contain parseable standard yet');
        }
      }
      
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle key press (Enter to send)
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Ask AI to generate the standard now
   */
  const handleGenerateNow = async () => {
    if (!chat || isLoading) return;
    
    const prompt = `Based on our conversation, please now generate the complete CAD standards table in markdown format. Include all the layers we discussed with appropriate codes, descriptions, and categories. Use the format:

| Code | Description | Point Layer | Line Layer | Linetype | Symbol | Category |

Remember:
- Use "-" for Symbol on linework codes
- Only assign symbols to point features
- Group by category/discipline`;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      const response = await chat.sendMessage({ message: prompt });
      const responseText = response.text || '';
      
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-response`,
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      
      // Parse the generated standard
      const parsed = parseMarkdownToStandard(responseText);
      if (parsed && parsed.codes.length > 0) {
        const linetypes = generateLinetypesFromCodes(parsed.codes);
        parsed.linetypes = linetypes;
        parsed.name = `${drawingName} Standards`;
        parsed.description = `Standards generated from ${layers.length} layers in ${drawingName}`;
        parsed.lastUpdated = new Date().toISOString();
        setGeneratedStandard(parsed);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate standard');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Accept the generated standard
   */
  const handleAcceptStandard = () => {
    if (generatedStandard) {
      onStandardGenerated(generatedStandard);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900/50 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div>
          <h3 className="text-sm font-medium text-white">
            🤖 AI Layer Analysis
          </h3>
          <p className="text-xs text-gray-400">
            Analyzing {layers.length} layers from {drawingName}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-gray-400 hover:text-white text-sm"
        >
          ✕ Cancel
        </button>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-cyan-600/30 border border-cyan-500/30 text-gray-100'
                  : 'bg-gray-800 border border-gray-700 text-gray-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                <span className="text-sm text-gray-400">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-lg px-3 py-2">
            <p className="text-sm text-red-400">⚠️ {error}</p>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Generated Standard Preview */}
      {generatedStandard && (
        <div className="p-3 border-t border-gray-700 bg-green-900/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-green-400">
              ✓ Generated {generatedStandard.codes.length} codes
            </span>
            <button
              onClick={handleAcceptStandard}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
            >
              Accept & Use Standard
            </button>
          </div>
        </div>
      )}
      
      {/* Input Area */}
      <div className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Answer the AI's questions or ask your own..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-cyan-500"
            rows={2}
            disabled={isLoading}
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
            >
              Send
            </button>
            {messages.length >= 4 && !generatedStandard && (
              <button
                onClick={handleGenerateNow}
                disabled={isLoading}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg text-xs transition-colors"
                title="Ask AI to generate the standard now"
              >
                Generate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayerAnalysisChat;
