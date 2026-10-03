import React, { useState, useEffect, useRef } from 'react';
import { type ChatMessage, AgentType, type Settings } from '../types.ts';
// FIX: Changed default import to named import for ChatInterface.
import { ChatInterface } from './ChatInterface.tsx';
import { MapPinIcon } from './icons.tsx';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface DataCollectorPanelProps {
  onStorePoint: (pointNumber: string, description: string, position: GeolocationPosition) => void;
  chatHistory: ChatMessage[];
  onSendMessage: (query: string) => void;
  isLoading: boolean;
  onStopGenerating: () => void;
  activeAgent: AgentType;
  settings: Settings;
  onToggleExpand: (msgIndex: number) => void;
  thinkingTime: number;
}

const DataCollectorPanel: React.FC<DataCollectorPanelProps> = ({ onStorePoint, chatHistory, onSendMessage, isLoading, onStopGenerating, activeAgent, settings, onToggleExpand, thinkingTime }) => {
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [pointNumber, setPointNumber] = useState('');
  const [description, setDescription] = useState('');
  const lastNotificationRef = useRef<string | null>(null);
  const { addNotification } = useAppState();

  const { coordinatePrecision, projection } = settings;

  useEffect(() => {
    if (!navigator.geolocation) {
      const message = 'Geolocation is not supported by this browser.';
      if (lastNotificationRef.current !== message) {
        lastNotificationRef.current = message;
        addNotification({ kind: 'gps-status', severity: 'error', title: 'GPS', message });
      }
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition(pos);
        lastNotificationRef.current = null;
      },
      (err) => {
        if (lastNotificationRef.current !== err.message) {
          lastNotificationRef.current = err.message;
          addNotification({ kind: 'gps-status', severity: 'error', title: 'GPS', message: err.message });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);
  
  const handleStorePoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (position && pointNumber) {
      onStorePoint(pointNumber, description, position);
      setPointNumber('');
      setDescription('');
    } else if (!pointNumber) {
        addNotification({ kind: 'gps-status', severity: 'warning', title: 'GPS', message: 'Point Number is required.' });
    } else {
        addNotification({ kind: 'gps-status', severity: 'warning', title: 'GPS', message: 'Waiting for GPS signal to store point.' });
    }
  };
  
  const projectionName = projection.zoneName
    ? `${projection.state} - ${projection.zoneName}`
    : 'None (Select in Settings)';


  return (
    <div className="flex flex-col h-full w-full bg-gray-800 text-sm text-gray-300 light-theme:bg-gray-50 light-theme:text-gray-600">
        <div className="flex-shrink-0 p-4 border-b border-gray-700 light-theme:border-gray-300">
            <h3 className="text-base font-semibold text-blue-400 mb-2 flex items-center gap-2"><MapPinIcon className="w-5 h-5"/> GPS Status</h3>
             <p className="text-xs text-gray-400 mb-2">Projection: <span className={`font-semibold ${projection.epsg ? 'text-gray-200' : 'text-yellow-400'} light-theme:text-gray-800`}>{projectionName}</span></p>
            {position ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                    <span>Lat:</span> <span className="text-gray-100 light-theme:text-gray-800">{position.coords.latitude.toFixed(8)}</span>
                    <span>Lon:</span> <span className="text-gray-100 light-theme:text-gray-800">{position.coords.longitude.toFixed(8)}</span>
                    <span>Alt:</span> <span className="text-gray-100 light-theme:text-gray-800">{position.coords.altitude?.toFixed(coordinatePrecision) ?? 'N/A'}</span>
                    <span>Acc:</span> <span className="text-gray-100 light-theme:text-gray-800">&plusmn;{position.coords.accuracy.toFixed(coordinatePrecision)} ft</span>
                </div>
            ) : (
                <p className="text-yellow-400 text-xs">Waiting for GPS signal...</p>
            )}

            <form onSubmit={handleStorePoint} className="mt-4 space-y-2">
                <div className="flex gap-2">
                    <input type="text" placeholder="Point Number" required value={pointNumber} onChange={e => setPointNumber(e.target.value)} className="w-1/3 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300" />
                    <input type="text" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300" />
                </div>
                 <button type="submit" className="w-full py-1.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors text-xs disabled:bg-gray-600" disabled={!position || isLoading}>
                    {isLoading ? 'Processing...' : 'Store Point'}
                </button>
            </form>
        </div>
      <div className="flex-grow min-h-0">
        <ChatInterface 
            messages={chatHistory} 
            onSendMessage={onSendMessage} 
            isLoading={isLoading}
            suggestedQuestions={["What was the last point I collected?"]}
            onStopGenerating={onStopGenerating} 
            onToggleExpand={onToggleExpand}
            thinkingTime={thinkingTime}
        />
      </div>
    </div>
  );
};

export default DataCollectorPanel;