import React from 'react';
import { XIcon, InfoIcon } from 'lucide-react';

interface ReleaseStagesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const releaseStages = [
  {
    short: 'PA',
    name: 'Pre-Alpha',
    description: 'Initial development phase. Features are being built and may not work reliably. Not recommended for any production use.',
    bgColor: 'bg-gray-700',
    textColor: 'text-gray-300',
    borderColor: 'border-gray-500'
  },
  {
    short: 'A',
    name: 'Alpha',
    description: 'Early testing phase. Core features are implemented but may have significant bugs. Suitable for internal testing and adventurous users.',
    bgColor: 'bg-purple-900/50',
    textColor: 'text-purple-300',
    borderColor: 'border-purple-500'
  },
  {
    short: 'B',
    name: 'Beta',
    description: 'Feature complete with known issues being addressed. Suitable for evaluation and non-critical workflows. Feedback is valuable.',
    bgColor: 'bg-blue-900/50',
    textColor: 'text-blue-300',
    borderColor: 'border-blue-500'
  },
  {
    short: 'RC',
    name: 'Release Candidate',
    description: 'Nearly production-ready. All features are complete and tested. Only critical bug fixes remain before general availability.',
    bgColor: 'bg-amber-900/50',
    textColor: 'text-amber-300',
    borderColor: 'border-amber-500'
  },
  {
    short: 'GA',
    name: 'General Availability',
    description: 'Production-ready and fully supported. Recommended for all users and production workflows.',
    bgColor: 'bg-green-900/50',
    textColor: 'text-green-300',
    borderColor: 'border-green-500'
  }
];

export const ReleaseStagesModal: React.FC<ReleaseStagesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden light-theme:bg-white light-theme:border-gray-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 light-theme:border-gray-200">
          <div className="flex items-center gap-3">
            <InfoIcon className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white light-theme:text-gray-900">Release Stages</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors light-theme:hover:bg-gray-100"
          >
            <XIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
          <p className="text-gray-400 mb-6 light-theme:text-gray-600">
            Each AI agent in LandSurv.AI is assigned a release stage indicator to help you understand 
            its maturity and reliability. Look for the badge in the bottom-right corner of each agent card.
          </p>
          
          <div className="space-y-4">
            {releaseStages.map(stage => (
              <div 
                key={stage.short}
                className={`p-4 rounded-lg border ${stage.borderColor} ${stage.bgColor}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border ${stage.borderColor} ${stage.textColor} font-bold text-sm`}>
                    {stage.short}
                  </div>
                  <h3 className={`font-semibold text-lg ${stage.textColor}`}>{stage.name}</h3>
                </div>
                <p className="text-gray-300 text-sm pl-11 light-theme:text-gray-700">{stage.description}</p>
              </div>
            ))}
          </div>
          
          <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-gray-600 light-theme:bg-gray-100 light-theme:border-gray-300">
            <h4 className="font-semibold text-white mb-2 light-theme:text-gray-900">Current Agent Status</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400 light-theme:text-gray-600">
                <span className="text-blue-300 font-semibold">Beta:</span> Civil 3D Connector, Boundary Agent, Point Editor
              </div>
              <div className="text-gray-400 light-theme:text-gray-600">
                <span className="text-purple-300 font-semibold">Alpha:</span> Civil Drafter, Profile & XS
              </div>
              <div className="text-gray-400 col-span-2 light-theme:text-gray-600">
                <span className="text-gray-300 font-semibold">Pre-Alpha:</span> All other agents
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 light-theme:border-gray-200">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReleaseStagesModal;
