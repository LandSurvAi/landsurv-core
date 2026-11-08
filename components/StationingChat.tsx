import React, { useState, useCallback, useMemo } from 'react';
import { type Centerline, type CenterlinePI, AgentType, type Settings } from '../types';
import { calculatePointFromStationOffset, parseStation, formatStationLabel } from '../utils/stationing';
import { PointAgent } from '../services/PointAgent';
import { useErrorReporter } from '../contexts/AppStateContext';

interface StationingChatProps {
  centerlines: Centerline[];
  onUpdateCenterline: (updatedCenterline: Centerline) => void;
  onPlacePoint: (northing: number, easting: number, pointNumber: string, description: string) => void;
  activeAgent: AgentType;
  settings: Settings;
  agentDrawMode?: 'both' | 'points' | 'lines';
  onOpenStationingSettings?: () => void;
}

const StationingChat: React.FC<StationingChatProps> = ({ centerlines, onUpdateCenterline, onPlacePoint, activeAgent, settings, agentDrawMode = 'both', onOpenStationingSettings }) => {
  const { coordinatePrecision } = settings;
  const activeCL = useMemo(() => centerlines[0], [centerlines]);
  const stationInterval = Math.max(1, Number(settings.stationing?.pointInterval) || 100);
  const stationingSettings = settings.stationing;
  const autoStationPoints = agentDrawMode !== 'lines';
  const stationLabelsOn = stationingSettings?.showStationLabels !== false;
  const stationLabelPreview = formatStationLabel(activeCL?.beginStation ?? 0, {
    prefix: stationingSettings?.stationPrefix,
    showPrefix: stationingSettings?.showStationPrefix,
    suffix: stationingSettings?.stationSuffix,
    format: stationingSettings?.stationLabelFormat,
    precision: stationingSettings?.stationPrecision,
  });
  const [activeTab, setActiveTab] = useState<'pi' | 'stakeout'>('pi');
  const { reportError } = useErrorReporter();

  const [newPi, setNewPi] = useState({ pointNumber: '', northing: '', easting: '' });
  const [stationing, setStationing] = useState({ station: '', offset: '', isRight: true, pointNumber: '', description: '' });
  
  const handleCLChange = useCallback((prop: keyof Centerline, value: any) => {
    if (activeCL) {
      onUpdateCenterline({ ...activeCL, [prop]: value });
    }
  }, [activeCL, onUpdateCenterline]);

  const handlePiChange = (piId: string, prop: keyof CenterlinePI, value: any) => {
    if (activeCL) {
        const updatedPis = activeCL.pis.map(p => 
            p.id === piId ? { ...p, [prop]: isNaN(value) ? undefined : value } : p
        );
        onUpdateCenterline({ ...activeCL, pis: updatedPis });
    }
  };

  const handleAddPi = (e: React.FormEvent) => {
    e.preventDefault();
    const northing = parseFloat(newPi.northing);
    const easting = parseFloat(newPi.easting);
    if (activeCL && !isNaN(northing) && !isNaN(easting)) {
      const piToAdd: CenterlinePI = {
        id: Date.now().toString(),
        pointNumber: newPi.pointNumber || `PI-${activeCL.pis.length + 1}`,
        northing,
        easting,
      };
      onUpdateCenterline({ ...activeCL, pis: [...activeCL.pis, piToAdd] });
      setNewPi({ pointNumber: '', northing: '', easting: '' });
    }
  };
  
  const handleRemovePi = (piId: string) => {
    if (activeCL) {
      onUpdateCenterline({ ...activeCL, pis: activeCL.pis.filter(pi => pi.id !== piId) });
    }
  };

  const handlePlacePoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCL) return;

    const stationNum = parseStation(stationing.station);
    const offsetNum = parseFloat(stationing.offset);
    if (stationNum === null || isNaN(offsetNum)) {
        reportError({ title: 'Invalid station', message: 'Invalid station or offset value.' });
        return;
    }

    const finalOffset = stationing.isRight ? offsetNum : -offsetNum;
    const coords = calculatePointFromStationOffset(activeCL, stationNum, finalOffset);

    if (coords) {
        // CACP: when the user leaves Point Number blank, ask PointAgent
        // for the next number per their labeling settings. The station
        // string lives in the description, never in the PN.
        let pn = stationing.pointNumber;
        if (!pn) {
            const agent = PointAgent.getInstance();
            agent.setLabelingSettings(settings.pointLabelingSettings);
            const [next] = agent.getNextNumbers(1);
            pn = next;
        }
        onPlacePoint(
            coords.northing,
            coords.easting,
            pn,
            stationing.description || `STA ${stationing.station} OFF ${Math.abs(offsetNum)}' ${stationing.isRight ? 'RT' : 'LT'}`
        );
        setStationing(prev => ({ ...prev, pointNumber: '', description: '' }));
    } else {
        reportError({ title: 'Station out of range', message: 'Station is outside the range of the defined centerline.' });
    }
  };

  if (!activeCL) {
    return <div className="p-4 text-gray-400">No active centerline.</div>;
  }
  
  const TabButton = ({ tabName, label }: { tabName: 'pi' | 'stakeout', label: string }) => (
    <button
        onClick={() => setActiveTab(tabName)}
        className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === tabName 
            ? 'text-cyan-300 border-cyan-400'
            : 'text-gray-400 border-transparent hover:bg-gray-700/50 light-theme:text-gray-500 light-theme:hover:bg-gray-200/50'
        }`}
    >
        {label}
    </button>
  );

  return (
    <div className="flex flex-col w-full bg-gray-800 text-sm text-gray-300 light-theme:bg-gray-50 light-theme:text-gray-600">
        <div className="flex items-center justify-between gap-2 border-b border-gray-700 px-3 py-1.5 light-theme:border-gray-300">
            <div className="flex flex-wrap items-center gap-1">
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${autoStationPoints ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-500/40 bg-slate-500/10 text-slate-400'}`}>AUTO {autoStationPoints ? 'ON' : 'OFF'}</span>
                <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">EVERY {stationInterval}'</span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${stationLabelsOn ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-slate-500/40 bg-slate-500/10 text-slate-400'}`}>LABELS {stationLabelsOn ? 'ON' : 'OFF'}</span>
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300">{stationLabelPreview}</span>
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300">P/L SWITCH</span>
            </div>
            {onOpenStationingSettings && (
                <button type="button" onClick={onOpenStationingSettings} className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20">
                    Stationing controls
                </button>
            )}
        </div>
        <div className="flex border-b border-gray-700 light-theme:border-gray-300">
            <TabButton tabName="pi" label="PI Editor" />
            <TabButton tabName="stakeout" label="Stakeout" />
        </div>
        <div className="p-3 flex-1 overflow-y-auto">
            {activeTab === 'pi' && (
                <div className="space-y-3">
                    <div>
                        <h4 className="text-base font-semibold text-cyan-300 mb-2">Points of Intersection & Curves</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                            {activeCL.pis.map((pi, i) => (
                                <div key={pi.id} className="flex items-center justify-between p-1.5 bg-gray-700/50 rounded-md light-theme:bg-gray-200/50">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs w-28 truncate" title={`N: ${pi.northing.toFixed(coordinatePrecision)}, E: ${pi.easting.toFixed(coordinatePrecision)}`}>{pi.pointNumber}</span>
                                        { i > 0 && i < activeCL.pis.length - 1 && (
                                            <input 
                                                type="number"
                                                placeholder="Radius"
                                                value={pi.curveRadius || ''}
                                                onChange={(e) => handlePiChange(pi.id, 'curveRadius', parseFloat(e.target.value))}
                                                className="w-20 p-1 text-xs bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-500 light-theme:bg-white light-theme:border-gray-300"
                                            />
                                        )}
                                    </div>
                                    <button onClick={() => handleRemovePi(pi.id)} className="px-2 py-0.5 text-xs bg-red-800 text-red-200 rounded hover:bg-red-700">&times;</button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <form onSubmit={handleAddPi} className="p-2 bg-gray-900/50 rounded-md space-y-2 light-theme:bg-gray-200/50">
                        <div className="flex gap-2">
                            <input type="number" step="any" placeholder="Northing" required value={newPi.northing} onChange={e => setNewPi(p => ({...p, northing: e.target.value}))} className="w-1/2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
                            <input type="number" step="any" placeholder="Easting" required value={newPi.easting} onChange={e => setNewPi(p => ({...p, easting: e.target.value}))} className="w-1/2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
                        </div>
                        <button type="submit" className="w-full py-1.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 transition-colors text-xs">Add PI</button>
                    </form>
                </div>
            )}
             {activeTab === 'stakeout' && (
                <div className="space-y-3">
                    <h4 className="text-base font-semibold text-cyan-300">Place Point by Station/Offset</h4>
                    <form onSubmit={handlePlacePoint} className="space-y-2">
                        <div className="flex items-center gap-2">
                            <input type="text" placeholder="Station (e.g., 10+50.25)" required value={stationing.station} onChange={e => setStationing(s => ({...s, station: e.target.value}))} className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
                            <input type="number" step="any" placeholder="Offset" required value={stationing.offset} onChange={e => setStationing(s => ({...s, offset: e.target.value}))} className="w-24 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
                            <div className="p-1 bg-gray-700 rounded-lg flex light-theme:bg-gray-200">
                              <button type="button" onClick={() => setStationing(s => ({...s, isRight: false}))} className={`px-2 py-0.5 rounded-md text-xs ${!stationing.isRight ? 'bg-sky-600' : 'hover:bg-gray-600 light-theme:hover:bg-gray-300'}`}>L</button>
                              <button type="button" onClick={() => setStationing(s => ({...s, isRight: true}))} className={`px-2 py-0.5 rounded-md text-xs ${stationing.isRight ? 'bg-sky-600' : 'hover:bg-gray-600 light-theme:hover:bg-gray-300'}`}>R</button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="text" placeholder="Point Number (optional)" value={stationing.pointNumber} onChange={e => setStationing(s => ({...s, pointNumber: e.target.value}))} className="w-1/2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
                            <input type="text" placeholder="Description (optional)" value={stationing.description} onChange={e => setStationing(s => ({...s, description: e.target.value}))} className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
                        </div>
                        <button type="submit" className="w-full py-1.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors text-xs" disabled={activeCL.pis.length < 2}>Calculate & Place Point</button>
                         {activeCL.pis.length < 2 && <p className="text-xs text-yellow-400 text-center">A centerline needs at least 2 PIs to place points.</p>}
                    </form>
                </div>
            )}
        </div>
    </div>
  );
};

export default StationingChat;
