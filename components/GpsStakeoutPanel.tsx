import React, { useState, useEffect, useMemo } from 'react';
import { type Settings, type SurveyPoint, type PointList } from '../types.ts';
import { MapPinIcon, ChevronLeftIcon, InteroperabilityIcon, ChevronDownIcon, ChevronUpIcon } from './icons.tsx';
import proj4 from 'proj4';
import { PointAgent } from '../services/PointAgent';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface GpsStakeoutPanelProps {
  isOverlay: boolean;
  currentPosition: GeolocationPosition | null;
  projectedPosition: { northing: number, easting: number } | null;
  projectPoints: SurveyPoint[];
  pointLists: PointList[];
  onStorePoint: (pointNumber: string, description: string, position: GeolocationPosition) => void;
  onStoreStakedPoint: (designPointNumber: string, stakedPointNumber: string, description: string, position: GeolocationPosition) => void;
  settings: Settings;
  targetPointNumber: string;
  setTargetPointNumber: (pn: string) => void;
  // FIX: Added missing nextAvailablePointNumber prop to fix type error in App.tsx
  nextAvailablePointNumber: string;
  /** Optional initial tab — used so the home-screen "Stakeout" / "Collect" CTAs jump straight into the right view. */
  initialTab?: 'stakeout' | 'collect' | 'benchmark';
  /**
   * When true the tab bar is hidden — the panel is locked to its initialTab.
   * Used for the independent floating Stakeout and Collect panels.
   */
  lockedTab?: boolean;
}

interface StakeoutData {
  bearing: number; // in degrees
  distance: number; // in feet
  deltaNorth: number;
  deltaEast: number;
  deltaElev: number | null;
}

const GpsStakeoutPanel: React.FC<GpsStakeoutPanelProps> = ({
  isOverlay, currentPosition, projectedPosition, projectPoints, pointLists, onStorePoint, onStoreStakedPoint, settings, targetPointNumber, setTargetPointNumber, nextAvailablePointNumber, initialTab, lockedTab
}) => {
  const [activeTab, setActiveTab] = useState<'stakeout' | 'collect' | 'benchmark'>(initialTab ?? 'stakeout');
  // Keep the panel responsive to home-screen CTAs: when the parent passes a new
  // initialTab (e.g. user clicked Stakeout vs Collect on the home card), switch.
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [isCollapsed, setIsCollapsed] = useState(false);
    const { addNotification } = useAppState();

  // Collect Tab State
  const [pointNumber, setPointNumber] = useState(nextAvailablePointNumber);
  const [description, setDescription] = useState('');
  const [iterationDirection, setIterationDirection] = useState<'increment' | 'decrement'>('increment');
  
  // Stakeout Tab State
  const [stakeoutMode, setStakeoutMode] = useState<'point' | 'line'>('point');
  const [selectedListId, setSelectedListId] = useState<string>('all');
  const [stakeoutData, setStakeoutData] = useState<StakeoutData | null>(null);
  const [stakedPointNumber, setStakedPointNumber] = useState('');
  const [stakedDescription, setStakedDescription] = useState('');
  const [lineFromPoint, setLineFromPoint] = useState('');
  const [lineToPoint, setLineToPoint] = useState('');
  const [lineStakeoutData, setLineStakeoutData] = useState<{
      station: number;
      offset: number;
      cutFill: number | null;
  } | null>(null);

  // Benchmark Tab State
  const [benchmarkPointNumber, setBenchmarkPointNumber] = useState('');
  const [benchmarkData, setBenchmarkData] = useState<{
      deltaNorth: number;
      deltaEast: number;
      deltaElev: number | null;
      distance3d: number;
  } | null>(null);

  const { coordinatePrecision, projection } = settings;

  // FIX: Update point number input when the next available number changes from props.
  useEffect(() => {
    setPointNumber(nextAvailablePointNumber);
  }, [nextAvailablePointNumber]);

  const stakeoutPoints = useMemo(() => {
    if (selectedListId === 'all') {
      return projectPoints;
    }
    const selectedList = pointLists.find(l => l.id === selectedListId);
    return selectedList ? selectedList.points : [];
  }, [selectedListId, projectPoints, pointLists]);
  
  const stakeoutPointsMap = useMemo(() => new Map(stakeoutPoints.map(p => [p.pointNumber, p])), [stakeoutPoints]);

  useEffect(() => {
    if (activeTab !== 'stakeout' || stakeoutMode !== 'point' || !targetPointNumber || !currentPosition || !projectedPosition) {
      setStakeoutData(null);
      return;
    }

    const targetPoint = stakeoutPointsMap.get(targetPointNumber);
    if (!targetPoint) {
      setStakeoutData(null);
      return;
    }

    try {
        const deltaNorth = targetPoint.northing - projectedPosition.northing;
        const deltaEast = targetPoint.easting - projectedPosition.easting;
        const distance = Math.hypot(deltaNorth, deltaEast);
        
        const bearingRad = Math.atan2(deltaEast, deltaNorth);
        let bearingDeg = bearingRad * (180 / Math.PI);
        if (bearingDeg < 0) bearingDeg += 360;

        const deltaElev = (targetPoint.elevation !== undefined && currentPosition.coords.altitude !== null)
            ? targetPoint.elevation - (currentPosition.coords.altitude * 3.28084)
            : null;

        setStakeoutData({
            bearing: bearingDeg,
            distance,
            deltaNorth,
            deltaEast,
            deltaElev
        });
    } catch(err) {
        console.error("Stakeout projection error:", err);
        addNotification({ kind: 'gps-stakeout', severity: 'error', title: 'GPS Stakeout', message: 'Projection error during stakeout calculation.' });
    }

  }, [targetPointNumber, currentPosition, projectedPosition, stakeoutPointsMap, activeTab, stakeoutMode]);
  
  useEffect(() => {
    if (activeTab !== 'stakeout' || stakeoutMode !== 'line' || !lineFromPoint || !lineToPoint || !projectedPosition) {
        setLineStakeoutData(null);
        return;
    }

    const p1 = projectPoints.find(p => p.pointNumber === lineFromPoint);
    const p2 = projectPoints.find(p => p.pointNumber === lineToPoint);
    
    if (!p1 || !p2) {
        setLineStakeoutData(null);
        return;
    }

    const { northing: Nc, easting: Ec } = projectedPosition;
    const { northing: N1, easting: E1, elevation: Z1 } = p1;
    const { northing: N2, easting: E2, elevation: Z2 } = p2;

    const dE = E2 - E1;
    const dN = N2 - N1;
    
    const lineLength = Math.hypot(dE, dN);
    if (lineLength < 1e-6) { // Avoid division by zero for coincident points
        setLineStakeoutData(null);
        return;
    }
    
    // Station calculation (dot product projection)
    const vE = Ec - E1;
    const vN = Nc - N1;
    const station = (vE * dE + vN * dN) / lineLength;

    // Offset calculation (2D cross product)
    const offset = (vE * dN - vN * dE) / lineLength;

    // Cut/Fill calculation
    let cutFill = null;
    const hasElevations = Z1 !== undefined && Z2 !== undefined && currentPosition?.coords.altitude !== null;
    if (hasElevations) {
        const dZ = (Z2 as number) - (Z1 as number);
        const lineSlope = dZ / lineLength;
        const elevationOnLine = (Z1 as number) + (station * lineSlope);
        cutFill = elevationOnLine - (currentPosition!.coords.altitude! * 3.28084);
    }

    setLineStakeoutData({ station, offset, cutFill });

  }, [activeTab, stakeoutMode, lineFromPoint, lineToPoint, projectedPosition, projectPoints, currentPosition]);

   useEffect(() => {
    if (activeTab !== 'benchmark' || !benchmarkPointNumber || !currentPosition || !projectedPosition) {
      setBenchmarkData(null);
      return;
    }

    const benchmarkPoint = projectPoints.find(p => p.pointNumber === benchmarkPointNumber);
    if (!benchmarkPoint) {
      setBenchmarkData(null);
      return;
    }

    try {
        const deltaNorth = benchmarkPoint.northing - projectedPosition.northing;
        const deltaEast = benchmarkPoint.easting - projectedPosition.easting;
        const deltaElev = (benchmarkPoint.elevation !== undefined && currentPosition.coords.altitude !== null)
            ? benchmarkPoint.elevation - (currentPosition.coords.altitude * 3.28084)
            : null;

        const distance3d = Math.hypot(deltaNorth, deltaEast, deltaElev ?? 0);
        
        setBenchmarkData({ deltaNorth, deltaEast, deltaElev, distance3d });
    } catch(err) {
        console.error("Benchmark projection error:", err);
        addNotification({ kind: 'gps-stakeout', severity: 'error', title: 'GPS Stakeout', message: 'Projection error during benchmark calculation.' });
    }

  }, [benchmarkPointNumber, currentPosition, projectedPosition, projectPoints, activeTab]);


  useEffect(() => {
    if (targetPointNumber) {
      setStakedPointNumber(`${targetPointNumber}-S`);
      setStakedDescription(`AS-STAKED ${targetPointNumber}`);
    } else {
      setStakedPointNumber('');
      setStakedDescription('');
    }
  }, [targetPointNumber]);

  const handleStorePoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPosition && pointNumber) {
      onStorePoint(pointNumber, description, currentPosition);

      // CACP: PointAgent is the sole authority for the next number when
      // incrementing. Decrementing is a UI affordance that stays local since
      // PointAgent only issues forward.
      let nextPointNumberToSuggest = pointNumber;
      if (iterationDirection === 'increment') {
        const agent = PointAgent.getInstance();
        agent.setLabelingSettings(settings.pointLabelingSettings);
        agent.setAvailablePoints(pointLists.flatMap(l => l.points));
        const [next] = agent.getNextNumbers(1);
        nextPointNumberToSuggest = next;
      } else {
        const match = pointNumber.match(/(.*?)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const numberStr = match[2];
          const num = parseInt(numberStr, 10);
          const nextNum = num - 1;
          let nextNumStr = String(nextNum);
          if (numberStr.startsWith('0')) {
            nextNumStr = nextNumStr.padStart(numberStr.length, '0');
          }
          nextPointNumberToSuggest = prefix + nextNumStr;
        }
      }

      setPointNumber(nextPointNumberToSuggest);
      setDescription('');
    } else {
                addNotification({
                    kind: 'gps-stakeout',
                    severity: 'warning',
                    title: 'GPS Stakeout',
                    message: pointNumber ? 'Waiting for GPS signal.' : 'Point Number is required.',
                });
    }
  };

  const handleStoreStaked = () => {
    if (currentPosition && targetPointNumber && stakedPointNumber) {
        onStoreStakedPoint(targetPointNumber, stakedPointNumber, stakedDescription, currentPosition);
        setTargetPointNumber(''); // Clear target after storing
    }
  };
  
  const projectionName = projection.zoneName ? `${projection.state} - ${projection.zoneName}` : 'None (Select in Settings)';
  const compassRotation = (stakeoutData?.bearing ?? 0) - (currentPosition?.coords.heading ?? 0);

  // GPS signal quality badge
  const signalAccuracyFt = currentPosition ? currentPosition.coords.accuracy * 3.28084 : null;
  const signalQuality = signalAccuracyFt === null ? 'none'
    : signalAccuracyFt <= 5 ? 'excellent'
    : signalAccuracyFt <= 15 ? 'good'
    : signalAccuracyFt <= 50 ? 'fair'
    : 'poor';
  const signalColors: Record<string, string> = {
    none: 'text-gray-500 bg-gray-800/60',
    excellent: 'text-emerald-300 bg-emerald-900/40',
    good: 'text-green-300 bg-green-900/40',
    fair: 'text-yellow-300 bg-yellow-900/30',
    poor: 'text-red-400 bg-red-900/30',
  };
  const signalLabel: Record<string, string> = { none: 'No Signal', excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor' };

  const TabButton = ({ tabName, label }: { tabName: 'stakeout' | 'collect' | 'benchmark', label: string }) => (
    <button
        onClick={() => setActiveTab(tabName)}
        className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === tabName 
            ? 'text-blue-400 border-blue-400' 
            : 'text-gray-400 border-transparent hover:bg-gray-700/50 light-theme:text-gray-500 light-theme:hover:bg-gray-200/50'
        }`}
    >
        {label}
    </button>
  );

  const containerClasses = isOverlay
    ? `absolute bottom-4 left-4 z-10 bg-gray-900/70 backdrop-blur-sm border border-gray-700/50 rounded-lg transition-all duration-300 ease-in-out`
    : `w-full h-full bg-gray-800 flex flex-col rounded-md overflow-hidden light-theme:bg-gray-50`;

  // GPS signal + position status bar shown in floating panels
  const signalBar = (
    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-950/60 border-b border-gray-700/50 text-[11px] font-mono flex-shrink-0">
      <span className={`px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${signalColors[signalQuality]}`}>
        ◉ {signalLabel[signalQuality]}{signalAccuracyFt !== null ? ` ±${signalAccuracyFt.toFixed(1)}ft` : ''}
      </span>
      {projectedPosition ? (
        <span className="text-gray-400">
          N{projectedPosition.northing.toFixed(2)}&nbsp;E{projectedPosition.easting.toFixed(2)}
        </span>
      ) : (
        <span className="text-gray-600 italic">acquiring…</span>
      )}
    </div>
  );
  
  const content = (
    <div className="w-full h-full flex flex-col">
        {lockedTab && signalBar}
        {!lockedTab && (
          <div className="flex border-b border-gray-700 px-4 flex-shrink-0 light-theme:border-gray-300">
              <TabButton tabName="stakeout" label="Stakeout" />
              <TabButton tabName="collect" label="Collect" />
              <TabButton tabName="benchmark" label="Benchmark" />
          </div>
        )}
        <div className="p-4 flex-grow overflow-y-auto">
             {activeTab === 'collect' && (
                <form onSubmit={handleStorePoint} className="mt-2 space-y-2 max-w-md mx-auto">
                    <h4 className="font-semibold text-gray-200 text-base mb-2">Collect New Point</h4>
                     <div className="flex gap-2">
                        <div className="relative w-2/5">
                            <input 
                                type="text" 
                                placeholder="Point #" 
                                required 
                                value={pointNumber} 
                                onChange={e => setPointNumber(e.target.value)} 
                                className="w-full p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300 pr-12" 
                            />
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex bg-gray-800 rounded-md p-0.5 light-theme:bg-gray-200">
                                <button type="button" onClick={() => setIterationDirection('increment')} className={`px-1.5 py-0.5 rounded-sm text-xs ${iterationDirection === 'increment' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-600'}`} title="Increment point number">+</button>
                                <button type="button" onClick={() => setIterationDirection('decrement')} className={`px-1.5 py-0.5 rounded-sm text-xs ${iterationDirection === 'decrement' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-600'}`} title="Decrement point number">-</button>
                            </div>
                        </div>
                        <input type="text" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300" />
                    </div>
                    <button type="submit" className="w-full py-1.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors text-xs disabled:bg-gray-600" disabled={!currentPosition}>
                        Store Point
                    </button>
                </form>
             )}
              {activeTab === 'stakeout' && (
                <div className="mt-2 space-y-3 max-w-md mx-auto">
                    <div className="flex justify-center p-1 bg-gray-700/50 rounded-lg mb-4 light-theme:bg-gray-200/50">
                        <button onClick={() => setStakeoutMode('point')} className={`px-4 py-1 rounded-md text-sm font-semibold transition-colors ${stakeoutMode === 'point' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600 light-theme:text-gray-600 light-theme:hover:bg-gray-300'}`}>Point</button>
                        <button onClick={() => setStakeoutMode('line')} className={`px-4 py-1 rounded-md text-sm font-semibold transition-colors ${stakeoutMode === 'line' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600 light-theme:text-gray-600 light-theme:hover:bg-gray-300'}`}>Line</button>
                    </div>

                    {stakeoutMode === 'point' && (
                      <>
                        <h4 className="font-semibold text-gray-200 text-base mb-2 light-theme:text-gray-800">Stakeout Point</h4>
                        <div>
                            <label htmlFor="list-select" className="block text-xs font-medium text-gray-400 mb-1">Stakeout from List</label>
                            <select 
                                id="list-select"
                                value={selectedListId}
                                onChange={e => {
                                    setSelectedListId(e.target.value);
                                    setTargetPointNumber(''); // Clear target when list changes
                                }}
                                className="w-full p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300"
                            >
                                <option value="all">All Visible Points ({projectPoints.length})</option>
                                {pointLists.filter(l => l.points.length > 0).map(list => (
                                    <option key={list.id} value={list.id}>{list.name} ({list.points.length})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="point-search" className="block text-xs font-medium text-gray-400 mb-1">Target Point Number</label>
                            <input id="point-search" type="text" list="point-list" placeholder="Target Point Number" value={targetPointNumber} onChange={e => setTargetPointNumber(e.target.value)} className="w-full p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300" />
                            <datalist id="point-list">
                                {stakeoutPoints.map(p => <option key={p.pointNumber} value={p.pointNumber} />)}
                            </datalist>
                        </div>

                        {stakeoutData ? (
                            <>
                                <div className="grid grid-cols-2 gap-4 text-center pt-4">
                                    <div className="flex flex-col items-center justify-center p-2 bg-gray-900/50 rounded-lg row-span-2 light-theme:bg-gray-200/50">
                                        <div className="flex items-center justify-center w-full gap-4 mb-1">
                                            <p className="text-xs text-gray-400">Direction to Point</p>
                                            {currentPosition?.coords.heading != null && (
                                                <div className="flex items-center gap-1" title={`True North (${Math.round(currentPosition.coords.heading)}°)`}>
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        className="w-5 h-5 text-red-500 transition-transform duration-300"
                                                        style={{ transform: `rotate(${-(currentPosition?.coords.heading ?? 0)}deg)` }}
                                                        fill="currentColor"
                                                    >
                                                        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                        <div className="w-24 h-24 rounded-full border-2 border-gray-600 flex items-center justify-center mt-2 relative light-theme:border-gray-400">
                                            <div className="absolute h-full w-px bg-gray-700 light-theme:bg-gray-300"></div>
                                            <div className="absolute w-full h-px bg-gray-700 light-theme:bg-gray-300"></div>
                                            <svg viewBox="0 0 24 24" className="w-20 h-20 text-blue-400 transition-transform duration-300" style={{ transform: `rotate(${compassRotation}deg)`}}>
                                                <path d="M12 2L4 22h16L12 2zm0 4.55L14.47 11H9.53L12 6.55z" fill="currentColor"/>
                                            </svg>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="p-3 bg-gray-900/50 rounded-lg flex flex-col justify-center light-theme:bg-gray-200/50">
                                            <p className="text-xs text-gray-400">Distance</p>
                                            <p className="text-3xl font-bold text-gray-100 light-theme:text-gray-800">{stakeoutData.distance.toFixed(coordinatePrecision)}<span className="text-xl">ft</span></p>
                                            <div className="flex justify-around text-sm mt-2">
                                                <p className="text-gray-400">ΔN: <span className={`font-semibold ${stakeoutData.deltaNorth > 0 ? 'text-green-400' : 'text-red-400'}`}>{stakeoutData.deltaNorth.toFixed(coordinatePrecision)}</span></p>
                                                <p className="text-gray-400">ΔE: <span className={`font-semibold ${stakeoutData.deltaEast > 0 ? 'text-green-400' : 'text-red-400'}`}>{stakeoutData.deltaEast.toFixed(coordinatePrecision)}</span></p>
                                            </div>
                                        </div>
                                        {stakeoutData.deltaElev !== null && (
                                            <div className={`p-3 rounded-lg flex flex-col justify-center ${stakeoutData.deltaElev > 0 ? 'bg-green-800/20' : 'bg-red-800/20'}`}>
                                                <p className={`text-xs uppercase font-bold ${stakeoutData.deltaElev > 0 ? 'text-green-400' : 'text-red-400'}`}>{stakeoutData.deltaElev > 0 ? 'Fill' : 'Cut'}</p>
                                                <p className={`text-3xl font-bold ${stakeoutData.deltaElev > 0 ? 'text-green-300' : 'text-red-300'}`}>
                                                    {Math.abs(stakeoutData.deltaElev).toFixed(coordinatePrecision)}
                                                    <span className="text-xl">ft</span>
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-2 col-span-2 light-theme:border-gray-300/50">
                                    <h5 className="font-semibold text-gray-300 text-sm light-theme:text-gray-600">Store As-Staked Point</h5>
                                    <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="As-Staked PN"
                                        value={stakedPointNumber}
                                        onChange={e => setStakedPointNumber(e.target.value)}
                                        className="w-1/3 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Description"
                                        value={stakedDescription}
                                        onChange={e => setStakedDescription(e.target.value)}
                                        className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300"
                                    />
                                    </div>
                                    <button
                                    onClick={handleStoreStaked}
                                    disabled={!currentPosition || !stakedPointNumber}
                                    className="w-full py-1.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors text-xs disabled:bg-gray-600"
                                    >
                                    Store As-Staked
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="text-center text-xs text-gray-500 py-8">Enter a target point number to begin stakeout.</p>
                        )}
                      </>
                    )}
                    {stakeoutMode === 'line' && (
                        <div className="space-y-3">
                            <h4 className="font-semibold text-gray-200 text-base mb-2 light-theme:text-gray-800">Stakeout Line</h4>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label htmlFor="line-from" className="block text-xs font-medium text-gray-400 mb-1">From Point</label>
                                    <input id="line-from" type="text" list="point-list-all" placeholder="From" value={lineFromPoint} onChange={e => setLineFromPoint(e.target.value)} className="w-full p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300" />
                                </div>
                                <div className="flex-1">
                                    <label htmlFor="line-to" className="block text-xs font-medium text-gray-400 mb-1">To Point</label>
                                    <input id="line-to" type="text" list="point-list-all" placeholder="To" value={lineToPoint} onChange={e => setLineToPoint(e.target.value)} className="w-full p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300" />
                                </div>
                                <datalist id="point-list-all">
                                    {projectPoints.map(p => <option key={p.pointNumber} value={p.pointNumber} />)}
                                </datalist>
                            </div>
                            {lineStakeoutData ? (
                                <div className="grid grid-cols-2 gap-4 text-center pt-4">
                                    <div className="flex flex-col items-center justify-center p-2 bg-gray-900/50 rounded-lg row-span-2 light-theme:bg-gray-200/50">
                                        <p className="text-xs text-gray-400 mb-2">Your Position</p>
                                        <div className="w-24 h-24 border-2 border-dashed border-gray-600 flex items-center justify-center relative light-theme:border-gray-400">
                                            <div className="absolute h-full w-px bg-gray-500 light-theme:bg-gray-300"></div>
                                            <div className="absolute top-1/2 w-3 h-3 rounded-full bg-blue-400 border-2 border-white"
                                                style={{
                                                    left: `calc(50% - 6px + ${Math.max(-40, Math.min(40, lineStakeoutData.offset * 4))}px)`
                                                }}>
                                            </div>
                                            <span className="absolute bottom-1 text-xs text-gray-400">Line</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="p-3 bg-gray-900/50 rounded-lg light-theme:bg-gray-200/50">
                                            <p className="text-xs text-gray-400">Station</p>
                                            <p className="text-2xl font-bold text-gray-100 light-theme:text-gray-800">{lineStakeoutData.station.toFixed(coordinatePrecision)}<span className="text-lg">ft</span></p>
                                        </div>
                                        <div className="p-3 bg-gray-900/50 rounded-lg light-theme:bg-gray-200/50">
                                            <p className="text-xs text-gray-400">Offset</p>
                                            <p className="text-2xl font-bold text-gray-100 light-theme:text-gray-800">{Math.abs(lineStakeoutData.offset).toFixed(coordinatePrecision)}<span className="text-lg">ft</span> <span className={`text-base font-semibold ${lineStakeoutData.offset > 0 ? 'text-green-400' : 'text-red-400'}`}>{lineStakeoutData.offset > 0 ? 'Right' : 'Left'}</span></p>
                                        </div>
                                    </div>
                                    {lineStakeoutData.cutFill !== null && (
                                        <div className={`p-3 rounded-lg col-span-2 ${lineStakeoutData.cutFill > 0 ? 'bg-green-800/20' : 'bg-red-800/20'}`}>
                                            <p className={`text-xs uppercase font-bold ${lineStakeoutData.cutFill > 0 ? 'text-green-400' : 'text-red-400'}`}>{lineStakeoutData.cutFill > 0 ? 'Fill' : 'Cut'}</p>
                                            <p className={`text-3xl font-bold ${lineStakeoutData.cutFill > 0 ? 'text-green-300' : 'text-red-300'}`}>{Math.abs(lineStakeoutData.cutFill).toFixed(coordinatePrecision)}<span className="text-xl">ft</span></p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-center text-xs text-gray-500 py-8">Select 'From' and 'To' points to begin line stakeout.</p>
                            )}
                        </div>
                    )}
                </div>
             )}
             {activeTab === 'benchmark' && (
                <div className="mt-2 space-y-3 max-w-md mx-auto">
                    <h4 className="font-semibold text-gray-200 text-base mb-2 light-theme:text-gray-800">Benchmark Check</h4>
                    <div>
                        <label htmlFor="benchmark-point-select" className="block text-xs font-medium text-gray-400 mb-1">Benchmark Point</label>
                        <select
                            id="benchmark-point-select"
                            value={benchmarkPointNumber}
                            onChange={e => setBenchmarkPointNumber(e.target.value)}
                            className="w-full p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300"
                        >
                            <option value="">Select a benchmark...</option>
                            {projectPoints.map(p => <option key={p.pointNumber} value={p.pointNumber}>{p.pointNumber} - {p.description}</option>)}
                        </select>
                    </div>

                    {benchmarkData ? (
                        <div className="pt-4 space-y-3">
                            <div className="p-3 bg-gray-900/50 rounded-lg text-center light-theme:bg-gray-200/50">
                                <p className="text-xs text-gray-400">3D Distance to Benchmark</p>
                                <p className="text-3xl font-bold text-gray-100 light-theme:text-gray-800">{benchmarkData.distance3d.toFixed(coordinatePrecision)}<span className="text-xl">ft</span></p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="p-2 bg-gray-900/50 rounded-lg light-theme:bg-gray-200/50">
                                    <p className="text-xs text-gray-400">Δ North</p>
                                    <p className={`font-semibold ${benchmarkData.deltaNorth > 0 ? 'text-green-400' : 'text-red-400'}`}>{benchmarkData.deltaNorth.toFixed(coordinatePrecision)}</p>
                                </div>
                                <div className="p-2 bg-gray-900/50 rounded-lg light-theme:bg-gray-200/50">
                                    <p className="text-xs text-gray-400">Δ East</p>
                                    <p className={`font-semibold ${benchmarkData.deltaEast > 0 ? 'text-green-400' : 'text-red-400'}`}>{benchmarkData.deltaEast.toFixed(coordinatePrecision)}</p>
                                </div>
                                {benchmarkData.deltaElev !== null && (
                                    <div className="p-2 bg-gray-900/50 rounded-lg light-theme:bg-gray-200/50">
                                        <p className="text-xs text-gray-400">Δ Elev</p>
                                        <p className={`font-semibold ${benchmarkData.deltaElev > 0 ? 'text-green-400' : 'text-red-400'}`}>{benchmarkData.deltaElev.toFixed(coordinatePrecision)}</p>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 text-center pt-2">Deltas are calculated as (Benchmark - GPS).</p>
                        </div>
                    ) : (
                        <p className="text-center text-xs text-gray-500 py-8">Select a benchmark point to see real-time differences.</p>
                    )}
                </div>
            )}
        </div>
    </div>
  );

  return isOverlay ? (
    <div className={`${containerClasses} ${isCollapsed ? 'w-48' : 'w-96'}`}>
        <div className="flex items-start">
            <div className={`p-3 transition-opacity ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                <h3 className="text-base font-semibold text-blue-400 mb-2 flex items-center gap-2"><MapPinIcon className="w-5 h-5"/> GPS Status</h3>
                {currentPosition && projectedPosition ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                        <span>N:</span> <span className="text-gray-100">{projectedPosition.northing.toFixed(coordinatePrecision)}</span>
                        <span>E:</span> <span className="text-gray-100">{projectedPosition.easting.toFixed(coordinatePrecision)}</span>
                        <span>Acc:</span> <span className="text-gray-100">&plusmn;{(currentPosition.coords.accuracy * 3.28084).toFixed(coordinatePrecision)} ft</span>
                    </div>
                ) : (
                    <p className="text-yellow-400 text-xs">Waiting for GPS signal...</p>
                )}
            </div>
            <button onClick={() => setIsCollapsed(p => !p)} className="p-2 self-start text-gray-400 hover:text-white">
                <ChevronLeftIcon className={`w-5 h-5 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} />
            </button>
        </div>
    </div>
  ) : (
    <div className={containerClasses}>
        {content}
    </div>
  );
};

export default GpsStakeoutPanel;