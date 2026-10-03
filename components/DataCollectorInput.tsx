
import React from 'react';
import { MapPinIcon, HomeIcon } from './icons';

interface DataCollectorInputProps {
  onSessionStart: () => void;
  onGoBack: () => void;
}

const DataCollectorInput: React.FC<DataCollectorInputProps> = ({ onSessionStart, onGoBack }) => {
  return (
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
      <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title="Go to Home Screen">
        <HomeIcon className="w-6 h-6"/>
      </button>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tighter text-gray-200 text-center mb-4">
          Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span><sup>™</sup>
      </h1>
      <div className="w-full max-w-2xl flex flex-col items-center">
        <p className="text-gray-400 mt-2 mb-6 max-w-lg">
          Use your device's GPS to perform stakeout and topographic surveys. Collected points will be converted to your project's coordinate system by the AI.
        </p>

        <button
          onClick={onSessionStart}
          className="px-8 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-600 transition-colors duration-200"
        >
          Start GPS Session
        </button>
      </div>
    </div>
  );
};

export default DataCollectorInput;