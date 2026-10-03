import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { type SurveyPoint, AgentType } from '../types.ts';
import { inverse, formatBearing } from '../utils/cogo.ts';
import { useErrorReporter } from '../contexts/AppStateContext';

interface CogoPanelProps {
  pointLists: { id: string; name: string; points: SurveyPoint[]; isVisible: boolean }[];
  onAddPoint: (point: SurveyPoint) => void;
  activeAgent: AgentType;
  settings: {
    coordinatePrecision: number;
  };
  onPointSelect?: (point: SurveyPoint) => void;
  isSelectingFromCanvas?: boolean;
}

export interface CogoPanelHandles {
  handleCanvasPointSelect: (point: SurveyPoint) => void;
}

export const CogoPanel = forwardRef<CogoPanelHandles, CogoPanelProps>(({
  pointLists,
  onAddPoint,
  activeAgent,
  settings,
  onPointSelect,
  isSelectingFromCanvas = false,
}, ref) => {
  const [inversePoint1, setInversePoint1] = useState<string>('');
  const [inversePoint2, setInversePoint2] = useState<string>('');
  const [inverseResult, setInverseResult] = useState<{ distance: number; bearing: string } | null>(null);
  const [selectingPoint, setSelectingPoint] = useState<'point1' | 'point2' | null>(null);
  const { reportError } = useErrorReporter();

  // Expose handleCanvasPointSelect method via ref
  useImperativeHandle(ref, () => ({
    handleCanvasPointSelect,
  }));

  // Get all points from all lists
  const allPoints = pointLists.flatMap(list => list.points);

  const handleCalculateInverse = useCallback(() => {
    const point1 = allPoints.find(p => p.pointNumber === inversePoint1);
    const point2 = allPoints.find(p => p.pointNumber === inversePoint2);

    if (!point1 || !point2) {
      reportError({ title: 'Invalid points', message: 'Please select valid points for both Point 1 and Point 2.' });
      return;
    }

    const result = inverse(
      { northing: point1.northing, easting: point1.easting },
      { northing: point2.northing, easting: point2.easting }
    );

    setInverseResult({
      distance: result.distance,
      bearing: formatBearing(result.bearing)
    });
  }, [inversePoint1, inversePoint2, allPoints, reportError]);

  const handleClearInverse = useCallback(() => {
    setInversePoint1('');
    setInversePoint2('');
    setInverseResult(null);
  }, []);

  const handleCanvasPointSelect = useCallback((point: SurveyPoint) => {
    if (selectingPoint === 'point1') {
      setInversePoint1(point.pointNumber);
      setSelectingPoint(null);
    } else if (selectingPoint === 'point2') {
      setInversePoint2(point.pointNumber);
      setSelectingPoint(null);
    }
  }, [selectingPoint]);

  const handleSelectFromCanvas = useCallback((pointType: 'point1' | 'point2') => {
    setSelectingPoint(pointType);
    if (onPointSelect) {
      // This will trigger canvas selection mode
    }
  }, [onPointSelect]);

  return (
    <div className="w-full h-full bg-gray-800 text-sm text-gray-300 flex flex-col light-theme:bg-gray-50 light-theme:text-gray-600">
      <div className="flex-grow p-4 space-y-6 overflow-y-auto">
        {/* Inverse Calculation Tool */}
        <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 light-theme:bg-gray-100/50 light-theme:border-gray-300">
          <h3 className="text-lg font-semibold text-purple-400 mb-4 light-theme:text-purple-600">Inverse Calculation</h3>
          <p className="text-gray-400 text-sm mb-4 light-theme:text-gray-500">
            Calculate the distance and bearing between two points.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 light-theme:text-gray-700">
                Point 1
              </label>
              <select
                value={inversePoint1}
                onChange={(e) => setInversePoint1(e.target.value)}
                className="w-full p-2 bg-gray-600 border border-gray-500 rounded-md text-white light-theme:bg-gray-200 light-theme:text-gray-800 light-theme:border-gray-400"
              >
                <option value="">Select Point 1...</option>
                {allPoints.map(point => (
                  <option key={point.pointNumber} value={point.pointNumber}>
                    {point.pointNumber} - {point.description || 'No description'}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleSelectFromCanvas('point1')}
                className={`mt-2 px-3 py-1 text-xs rounded-md font-semibold ${
                  selectingPoint === 'point1'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                } light-theme:bg-gray-200 light-theme:text-gray-700`}
              >
                {selectingPoint === 'point1' ? 'Click Point on Canvas' : 'Select from Canvas'}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 light-theme:text-gray-700">
                Point 2
              </label>
              <select
                value={inversePoint2}
                onChange={(e) => setInversePoint2(e.target.value)}
                className="w-full p-2 bg-gray-600 border border-gray-500 rounded-md text-white light-theme:bg-gray-200 light-theme:text-gray-800 light-theme:border-gray-400"
              >
                <option value="">Select Point 2...</option>
                {allPoints.map(point => (
                  <option key={point.pointNumber} value={point.pointNumber}>
                    {point.pointNumber} - {point.description || 'No description'}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleSelectFromCanvas('point2')}
                className={`mt-2 px-3 py-1 text-xs rounded-md font-semibold ${
                  selectingPoint === 'point2'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                } light-theme:bg-gray-200 light-theme:text-gray-700`}
              >
                {selectingPoint === 'point2' ? 'Click Point on Canvas' : 'Select from Canvas'}
              </button>
            </div>
          </div>

          {selectingPoint && (
            <div className="bg-purple-600/20 border border-purple-500 rounded-lg p-3 mb-4">
              <p className="text-purple-300 text-sm font-semibold">
                Click on a point in the canvas to select it as {selectingPoint === 'point1' ? 'Point 1' : 'Point 2'}
              </p>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button
              onClick={handleCalculateInverse}
              disabled={!inversePoint1 || !inversePoint2}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              Calculate Inverse
            </button>
            <button
              onClick={handleClearInverse}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-semibold"
            >
              Clear
            </button>
          </div>

          {inverseResult && (
            <div className="bg-gray-600/50 rounded-lg p-3 border border-gray-500 light-theme:bg-gray-200/50 light-theme:border-gray-400">
              <h4 className="font-semibold text-purple-300 mb-2 light-theme:text-purple-700">Results:</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400 light-theme:text-gray-600">Distance:</span>
                  <span className="font-mono text-white light-theme:text-gray-800">
                    {inverseResult.distance.toFixed(settings.coordinatePrecision)}'
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 light-theme:text-gray-600">Bearing:</span>
                  <span className="font-mono text-white light-theme:text-gray-800">
                    {inverseResult.bearing}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Intersection Calculation Tool */}
        <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 light-theme:bg-gray-100/50 light-theme:border-gray-300">
          <h3 className="text-lg font-semibold text-violet-400 mb-4 light-theme:text-violet-600">Intersection Calculation</h3>
          <p className="text-gray-400 text-sm mb-4 light-theme:text-gray-500">
            Find the intersection point of two lines defined by points and bearings.
          </p>
          <p className="text-gray-500 text-xs italic light-theme:text-gray-600">
            (Forward calculation feature — enter bearing and distance from a point to find the intersection)
          </p>
        </div>

        {/* Future COGO Tools Placeholder */}
        <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 light-theme:bg-gray-100/50 light-theme:border-gray-300">
          <h3 className="text-lg font-semibold text-purple-400 mb-2 light-theme:text-purple-600">Additional Tools</h3>
          <p className="text-gray-400 text-sm light-theme:text-gray-500">
            More COGO calculation tools will be added here in future updates.
          </p>
        </div>
      </div>
    </div>
  );
});