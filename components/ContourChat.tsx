import React from 'react';
import { type ContourSettings, type AgentType, type EsriServiceInfo } from '../types.ts';
import { ContourPanel } from './ContourPanel.tsx';

interface ContourChatProps {
  settings: ContourSettings;
  onSettingsChange: (settings: ContourSettings) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  activeAgent: AgentType;
  onDiscoverPublicServices?: (searchTerm: string) => void;
  isDiscovering?: boolean;
  discoveredServices?: EsriServiceInfo[];
  hasInclusionBoundary?: boolean;
  inclusionSegmentCount?: number;
  breaklineCount?: number;
  exclusionSegmentCount?: number;
  isFetchingEsri?: boolean;
  onFetchEsriContours?: (serviceUrl: string, mode: 'inclusion' | 'description', descriptionText?: string) => void;
  autoOpenGisSelector?: boolean;
  onGisSelectorOpened?: () => void;
}

export const ContourChat: React.FC<ContourChatProps> = ({
  settings,
  onSettingsChange,
  onGenerate,
  isGenerating,
  activeAgent,
  onDiscoverPublicServices,
  isDiscovering,
  discoveredServices,
  hasInclusionBoundary,
  inclusionSegmentCount,
  breaklineCount,
  exclusionSegmentCount,
  isFetchingEsri,
  onFetchEsriContours,
  autoOpenGisSelector,
  onGisSelectorOpened,
}) => {
  return (
    <ContourPanel
      settings={settings}
      onSettingsChange={onSettingsChange}
      onGenerate={onGenerate}
      isGenerating={isGenerating}
      onDiscoverPublicServices={onDiscoverPublicServices}
      isDiscovering={isDiscovering}
      discoveredServices={discoveredServices}
      hasInclusionBoundary={hasInclusionBoundary}
      inclusionSegmentCount={inclusionSegmentCount}
      breaklineCount={breaklineCount}
      exclusionSegmentCount={exclusionSegmentCount}
      isFetchingEsri={isFetchingEsri}
      onFetchEsriContours={onFetchEsriContours}
      autoOpenGisSelector={autoOpenGisSelector}
      onGisSelectorOpened={onGisSelectorOpened}
    />
  );
};
