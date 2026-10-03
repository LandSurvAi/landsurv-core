import React, { useState } from 'react';
import { SurveyPoint } from '../types.ts';
import {
  MapPin,
  Eye,
  Edit2,
  Navigation,
  ChevronDown,
  X,
} from 'lucide-react';

interface ARPointMenuProps {
  point: SurveyPoint;
  onAction: (action: string) => void;
  onClose: () => void;
}

const ARPointMenu: React.FC<ARPointMenuProps> = ({
  point,
  onAction,
  onClose,
}) => {
  const [expanded, setExpanded] = useState(true);

  const actions = [
    {
      id: 'stake',
      label: 'Stake to Point',
      icon: MapPin,
      color: 'bg-green-600 hover:bg-green-700',
    },
    {
      id: 'stakeout',
      label: 'Stakeout',
      icon: Navigation,
      color: 'bg-blue-600 hover:bg-blue-700',
    },
    {
      id: 'details',
      label: 'Show Details',
      icon: Eye,
      color: 'bg-cyan-600 hover:bg-cyan-700',
    },
    {
      id: 'edit',
      label: 'Edit Point',
      icon: Edit2,
      color: 'bg-purple-600 hover:bg-purple-700',
    },
  ];

  const handleAction = (actionId: string) => {
    onAction(actionId);
  };

  return (
    <div className="bg-gray-900 border border-cyan-500 rounded-lg overflow-hidden shadow-2xl">
      {/* Header */}
      <div
        className="bg-gray-800 border-b border-cyan-500 p-4 flex justify-between items-start cursor-pointer hover:bg-gray-750 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-cyan-300 truncate">
            {point.pointNumber || point.description || 'Point'}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Survey Point
          </p>
        </div>
        <button
          className="ml-2 text-gray-400 hover:text-cyan-300 transition flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Expandable content */}
      {expanded && (
        <>
          {/* Point details */}
          <div className="bg-gray-800 border-b border-gray-700 p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">
                  Easting
                </p>
                <p className="text-cyan-300 font-mono">
                  {point.easting.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">
                  Northing
                </p>
                <p className="text-cyan-300 font-mono">
                  {point.northing.toFixed(2)}
                </p>
              </div>
            </div>

            {point.elevation !== undefined && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">
                  Elevation
                </p>
                <p className="text-cyan-300 font-mono">
                  {point.elevation.toFixed(2)} m
                </p>
              </div>
            )}

            {point.description && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">
                  Description
                </p>
                <p className="text-gray-300 text-sm">{point.description}</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="bg-gray-900 p-3 space-y-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id)}
                  className={`w-full flex items-center gap-2 px-4 py-3 rounded font-medium text-white transition ${action.color}`}
                >
                  <Icon size={18} />
                  <span className="text-sm">{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* Close button */}
          <div className="bg-gray-800 border-t border-gray-700 p-3">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded font-medium transition text-sm"
            >
              Close
            </button>
          </div>
        </>
      )}

      {/* Collapsed state footer */}
      {!expanded && (
        <div className="bg-gray-800 px-4 py-2 flex justify-between items-center text-xs text-gray-400 border-t border-gray-700">
          <span>{actions.length} actions available</span>
          <ChevronDown size={16} />
        </div>
      )}
    </div>
  );
};

export default ARPointMenu;
