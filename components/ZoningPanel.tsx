import React, { useState } from 'react';
import { ExternalLink, MapPin, Building2, Search, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ZoningPanelProps {
    zoningMapUrl?: string;
    zoningState?: string;
    zoningPlace?: string;
    zoningPlaceType?: string;
    onDistrictSubmit: (district: string) => void;
}

const ZoningPanel: React.FC<ZoningPanelProps> = ({ 
    zoningMapUrl, 
    zoningState,
    zoningPlace,
    zoningPlaceType,
    onDistrictSubmit 
}) => {
    const [district, setDistrict] = useState('');
    const [hasSubmittedDistrict, setHasSubmittedDistrict] = useState(false);

    const handleDistrictSubmit = () => {
        if (district.trim()) {
            setHasSubmittedDistrict(true);
            onDistrictSubmit(district.trim());
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !hasSubmittedDistrict) {
            handleDistrictSubmit();
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-800 light-theme:bg-white">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700 light-theme:border-gray-200">
                <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-lg font-semibold text-gray-100 light-theme:text-gray-900">
                        Zoning Information
                    </h2>
                </div>
                <p className="text-sm text-gray-400 light-theme:text-gray-600">
                    {zoningPlace && zoningState ? `${zoningPlace}, ${zoningState}` : 'Location-based zoning research'}
                </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Map Link Section */}
                {zoningMapUrl && (
                    <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border border-cyan-700/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                            <h3 className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">
                                Zoning Map Found
                            </h3>
                        </div>
                        <p className="text-xs text-gray-400 light-theme:text-gray-600 mb-3">
                            The zoning map is displayed in the canvas. View the original source:
                        </p>
                        <a
                            href={zoningMapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Open Official Zoning Map
                        </a>
                    </div>
                )}

                {/* District Input Section */}
                {!hasSubmittedDistrict ? (
                    <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 light-theme:bg-gray-50 light-theme:border-gray-300">
                        <div className="flex items-center gap-2 mb-3">
                            <Building2 className="w-5 h-5 text-yellow-400" />
                            <h3 className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">
                                Enter Zoning District
                            </h3>
                        </div>
                        <p className="text-xs text-gray-400 light-theme:text-gray-600 mb-3">
                            Look at the map and identify the zoning district for your property
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={district}
                                onChange={(e) => setDistrict(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="e.g., R-1, C-2, I-3"
                                className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900 light-theme:placeholder-gray-400"
                            />
                            <button
                                onClick={handleDistrictSubmit}
                                disabled={!district.trim()}
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <Search className="w-4 h-4" />
                                Research
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Enter the district code from the zoning map
                        </p>
                    </div>
                ) : (
                    <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                            <h3 className="text-sm font-semibold text-green-300">
                                District: {district}
                            </h3>
                        </div>
                        <p className="text-xs text-gray-400">
                            Ask questions about zoning requirements in the chat below
                        </p>
                    </div>
                )}

                {/* Suggested Questions */}
                {hasSubmittedDistrict && (
                    <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 light-theme:bg-gray-50 light-theme:border-gray-300">
                        <h3 className="text-sm font-semibold text-gray-200 light-theme:text-gray-800 mb-2">
                            Common Questions:
                        </h3>
                        <ul className="text-sm text-gray-400 light-theme:text-gray-600 space-y-1">
                            <li>• What are the setback requirements?</li>
                            <li>• What is the maximum building height?</li>
                            <li>• What uses are permitted?</li>
                            <li>• What is the minimum lot size?</li>
                            <li>• Are there parking requirements?</li>
                            <li>• What is the maximum lot coverage?</li>
                            <li>• Are accessory structures allowed?</li>
                            <li>• What are the sign regulations?</li>
                        </ul>
                    </div>
                )}

                {/* Location Info */}
                {zoningPlace && zoningState && (
                    <div className="bg-gray-700/30 border border-gray-600/50 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-300 mb-2">Location Details</h3>
                        <div className="space-y-1 text-sm text-gray-400">
                            <p><span className="text-gray-500">Place:</span> {zoningPlace}</p>
                            <p><span className="text-gray-500">Type:</span> {zoningPlaceType || 'N/A'}</p>
                            <p><span className="text-gray-500">State:</span> {zoningState}</p>
                        </div>
                    </div>
                )}

                {/* Disclaimer */}
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 light-theme:bg-yellow-50 light-theme:border-yellow-200">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-400 light-theme:text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm text-yellow-300 light-theme:text-yellow-700 font-medium">
                                Professional Review Required
                            </p>
                            <p className="text-xs text-yellow-400 light-theme:text-yellow-600 mt-1">
                                AI-generated zoning information should be verified with official municipal sources. This tool is for preliminary research only.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ZoningPanel;
