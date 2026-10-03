
import React, { useRef, useEffect } from 'react';
import { type ChatMessage, MessageRole, type ChatMessageAction, type Settings, type JobInfo } from '../types.ts';
import { BrainCircuitIcon } from './icons.tsx';

interface FieldbookPanelProps {
  notes: string;
  onNotesChange: (notes: string) => void;
  messages: ChatMessage[];
  onAction: (action: ChatMessageAction) => void;
  settings?: Settings;
  jobInfo?: JobInfo;
  onExportToNotion?: () => void;
}

const FieldbookPanel: React.FC<FieldbookPanelProps> = ({ 
  notes, 
  onNotesChange, 
  messages, 
  onAction,
  settings,
  jobInfo,
  onExportToNotion 
}) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-gray-900 rounded-md overflow-hidden">
      <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col p-3 border-b md:border-b-0 md:border-r border-gray-700">
        <h3 className="text-lg font-semibold text-orange-400 mb-2 flex-shrink-0">Manual Field Notes</h3>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          className="w-full flex-grow bg-gray-800 text-gray-200 text-sm p-3 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700"
          placeholder="Type your field notes here...&#10;e.g., 'Weather: Sunny, 75°F. Crew Chief: John Doe. Started traverse at CP-1.'"
        />
      </div>
      <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col">
        <div className="p-3 border-b border-gray-700 bg-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-orange-400">Chronological Log</h3>
              <p className="text-xs text-gray-400">Key actions are automatically logged here.</p>
            </div>
            {settings?.notion?.enabled && onExportToNotion && (
              <button
                onClick={onExportToNotion}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Export fieldbook to Notion"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 2h16a2 2 0 012 2v16a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zm0 2v16h16V4H4zm2 2h12v2H6V6zm0 4h12v2H6v-2zm0 4h8v2H6v-2z"/>
                </svg>
                Export to Notion
              </button>
            )}
          </div>
        </div>
        <div className="flex-grow min-h-0 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              {messages.filter(msg => msg.role === MessageRole.MODEL).map((msg, index) => (
                <div key={index} className="flex items-start gap-3 justify-start">
                   <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                      <BrainCircuitIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="max-w-xl p-3 rounded-lg bg-gray-700 text-gray-200 rounded-bl-none">
                         <p className="text-sm" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br />') }} />
                         {msg.action && msg.action.type === 'VIEW_UNCERTAINTIES' && (
                            <button 
                                onClick={() => onAction(msg.action!)}
                                className="mt-2 text-xs font-semibold text-orange-400 hover:text-orange-300 bg-orange-900/50 hover:bg-orange-900/80 px-3 py-1 rounded-md transition-colors"
                            >
                                View in PDF Reviewer
                            </button>
                        )}
                    </div>
                </div>
              ))}
               <div ref={logEndRef} />
            </div>
        </div>
      </div>
    </div>
  );
};

export default FieldbookPanel;
