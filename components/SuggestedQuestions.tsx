
import React from 'react';
import { LightbulbIcon } from './icons.tsx';
import { AgentType } from '../types.ts';

interface SuggestedQuestionsProps {
  questions: string[];
  onQuestionSelect: (question: string) => void;
  fontSize: number;
  activeAgent: AgentType;
}

const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({ questions, onQuestionSelect, fontSize, activeAgent }) => {
  if (questions.length === 0) {
    return null;
  }
  
  const isRawAgent = activeAgent === AgentType.RAW_CRAWLER;
  const hoverBorderClass = isRawAgent ? 'hover:border-cyan-500' : 'hover:border-green-500';
  const focusRingClass = isRawAgent ? 'focus:ring-cyan-500' : 'focus:ring-green-500';

  return (
    <div className="my-6">
      <div className="flex items-center gap-2 mb-3">
        <LightbulbIcon className="w-5 h-5 text-yellow-400 flex-shrink-0" />
        <h3 className="font-semibold text-gray-400" style={{ fontSize: `${fontSize * 0.9}px` }}>Here are some ideas to get you started:</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onQuestionSelect(q)}
            className={`p-3 text-left text-gray-300 bg-gray-900/50 rounded-lg transition-colors duration-200 border border-gray-700 ${hoverBorderClass} ${focusRingClass} focus:outline-none focus:ring-2`}
            style={{ fontSize: `${fontSize * 0.95}px` }}
            aria-label={`Ask the question: ${q}`}
          >
            <p className="font-medium">{`"${q}"`}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestedQuestions;