import React, { useState } from 'react';
import { TitleSearchData, TitleDeed, TitleLien } from '../types';

interface TitleSearchPanelProps {
    titleData: TitleSearchData;
    onDeedSelect: (deedId: string) => void;
    onLienSelect: (lienId: string) => void;
    selectedDeedId?: string;
    selectedLienId?: string;
}

export const TitleSearchPanel: React.FC<TitleSearchPanelProps> = ({
    titleData,
    onDeedSelect,
    onLienSelect,
    selectedDeedId,
    selectedLienId,
}) => {
    const [activeTab, setActiveTab] = useState<'chain' | 'deeds' | 'liens'>('chain');

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'clear': return 'text-green-400';
            case 'issues': return 'text-red-400';
            case 'pending-review': return 'text-yellow-400';
            default: return 'text-gray-400';
        }
    };

    const getLienStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-red-400';
            case 'released': return 'text-green-400';
            case 'satisfied': return 'text-blue-400';
            default: return 'text-gray-400';
        }
    };

    const getLienTypeLabel = (type: string) => {
        const labels: { [key: string]: string } = {
            'mortgage': 'Mortgage',
            'tax-lien': 'Tax Lien',
            'judgment': 'Judgment',
            'mechanic-lien': "Mechanic's Lien",
            'easement': 'Easement',
            'other': 'Other',
        };
        return labels[type] || type;
    };

    const sortedChain = [...titleData.chainOfTitle].sort((a, b) => b.order - a.order);

    return (
        <div className="h-full flex flex-col bg-gray-900 text-gray-100">
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold mb-2">Title Search</h2>
                {titleData.propertyAddress && (
                    <p className="text-sm text-gray-400">{titleData.propertyAddress}</p>
                )}
                {titleData.parcelId && (
                    <p className="text-xs text-gray-500">Parcel: {titleData.parcelId}</p>
                )}
                
                {/* Title Status */}
                <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm font-semibold">Status:</span>
                    <span className={`text-sm font-bold uppercase ${getStatusColor(titleData.titleStatus)}`}>
                        {titleData.titleStatus.replace('-', ' ')}
                    </span>
                </div>

                {/* Issues */}
                {titleData.issues && titleData.issues.length > 0 && (
                    <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded">
                        <p className="text-xs font-semibold text-red-400 mb-1">Issues Found:</p>
                        <ul className="text-xs text-gray-300 list-disc list-inside space-y-1">
                            {titleData.issues.map((issue, idx) => (
                                <li key={idx}>{issue}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-700">
                <button
                    onClick={() => setActiveTab('chain')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'chain'
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                >
                    Chain of Title ({sortedChain.length})
                </button>
                <button
                    onClick={() => setActiveTab('deeds')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'deeds'
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                >
                    All Deeds ({titleData.deeds.length})
                </button>
                <button
                    onClick={() => setActiveTab('liens')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'liens'
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                >
                    Liens ({titleData.liens.length})
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Chain of Title Tab */}
                {activeTab === 'chain' && (
                    <div className="space-y-3">
                        {sortedChain.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">
                                No chain of title established yet.
                            </p>
                        ) : (
                            sortedChain.map((entry) => {
                                const deed = titleData.deeds.find(d => d.id === entry.deedId);
                                if (!deed) return null;

                                return (
                                    <div
                                        key={entry.deedId}
                                        onClick={() => onDeedSelect(entry.deedId)}
                                        className={`p-3 rounded border cursor-pointer transition-colors ${
                                            selectedDeedId === entry.deedId
                                                ? 'bg-amber-900/30 border-amber-500'
                                                : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-bold text-amber-400">
                                                    #{entry.order}
                                                </span>
                                                {entry.isCurrentOwner && (
                                                    <span className="px-2 py-0.5 text-xs font-semibold bg-green-900/50 text-green-400 rounded">
                                                        CURRENT
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-500">{deed.recordingDate}</span>
                                        </div>
                                        
                                        <div className="space-y-1 text-sm">
                                            <div>
                                                <span className="text-gray-500">From:</span>{' '}
                                                <span className="text-gray-200">{deed.grantor}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500">To:</span>{' '}
                                                <span className="text-gray-200 font-semibold">{deed.grantee}</span>
                                            </div>
                                            {deed.considerationAmount && (
                                                <div className="text-xs text-gray-400">
                                                    Consideration: {deed.considerationAmount}
                                                </div>
                                            )}
                                            {deed.deedBook && deed.deedPage && (
                                                <div className="text-xs text-gray-500">
                                                    Book {deed.deedBook}, Page {deed.deedPage}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* All Deeds Tab */}
                {activeTab === 'deeds' && (
                    <div className="space-y-3">
                        {titleData.deeds.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">
                                No deeds uploaded yet. Add deeds to begin analysis.
                            </p>
                        ) : (
                            titleData.deeds.map((deed) => (
                                <div
                                    key={deed.id}
                                    onClick={() => onDeedSelect(deed.id)}
                                    className={`p-3 rounded border cursor-pointer transition-colors ${
                                        selectedDeedId === deed.id
                                            ? 'bg-amber-900/30 border-amber-500'
                                            : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="text-sm font-semibold text-gray-200">
                                            {deed.grantee}
                                        </div>
                                        <span className="text-xs text-gray-500">{deed.recordingDate}</span>
                                    </div>
                                    
                                    <div className="space-y-1 text-sm">
                                        <div className="text-gray-400">
                                            From: <span className="text-gray-300">{deed.grantor}</span>
                                        </div>
                                        {deed.considerationAmount && (
                                            <div className="text-xs text-gray-500">
                                                Amount: {deed.considerationAmount}
                                            </div>
                                        )}
                                        {deed.deedBook && deed.deedPage && (
                                            <div className="text-xs text-gray-500">
                                                Book {deed.deedBook}, Page {deed.deedPage}
                                            </div>
                                        )}
                                        {deed.parcelId && (
                                            <div className="text-xs text-gray-500">
                                                Parcel: {deed.parcelId}
                                            </div>
                                        )}
                                        {deed.legalDescription && (
                                            <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-900/50 rounded">
                                                {deed.legalDescription.substring(0, 150)}
                                                {deed.legalDescription.length > 150 && '...'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Liens Tab */}
                {activeTab === 'liens' && (
                    <div className="space-y-3">
                        {titleData.liens.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">
                                No liens or encumbrances found.
                            </p>
                        ) : (
                            titleData.liens.map((lien) => (
                                <div
                                    key={lien.id}
                                    onClick={() => onLienSelect(lien.id)}
                                    className={`p-3 rounded border cursor-pointer transition-colors ${
                                        selectedLienId === lien.id
                                            ? 'bg-amber-900/30 border-amber-500'
                                            : lien.status === 'active'
                                            ? 'bg-red-900/10 border-red-500/30 hover:bg-red-900/20'
                                            : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <span className="text-sm font-semibold text-gray-200">
                                                {getLienTypeLabel(lien.type)}
                                            </span>
                                            <span className={`ml-2 text-xs font-bold uppercase ${getLienStatusColor(lien.status)}`}>
                                                {lien.status}
                                            </span>
                                        </div>
                                        <span className="text-xs text-gray-500">{lien.recordingDate}</span>
                                    </div>
                                    
                                    <div className="space-y-1 text-sm">
                                        <div className="text-gray-400">
                                            Holder: <span className="text-gray-200">{lien.holder}</span>
                                        </div>
                                        {lien.amount && (
                                            <div className="text-gray-400">
                                                Amount: <span className="text-gray-200 font-semibold">{lien.amount}</span>
                                            </div>
                                        )}
                                        {lien.releaseDate && (
                                            <div className="text-xs text-green-400">
                                                Released: {lien.releaseDate}
                                            </div>
                                        )}
                                        <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-900/50 rounded">
                                            {lien.description}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Footer Summary */}
            <div className="p-3 border-t border-gray-700 bg-gray-800 text-xs space-y-1">
                <div className="flex justify-between">
                    <span className="text-gray-400">Total Transfers:</span>
                    <span className="text-gray-200 font-semibold">{titleData.deeds.length}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Active Liens:</span>
                    <span className={`font-semibold ${titleData.liens.filter(l => l.status === 'active').length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {titleData.liens.filter(l => l.status === 'active').length}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Title Status:</span>
                    <span className={`font-semibold ${getStatusColor(titleData.titleStatus)}`}>
                        {titleData.titleStatus.replace('-', ' ').toUpperCase()}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default TitleSearchPanel;
