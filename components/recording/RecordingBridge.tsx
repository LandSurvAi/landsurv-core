/**
 * Read-only capture bridge between the live app and the recorder.
 *
 * App.tsx owns the project state. This component only observes the slices the
 * recording format supports, builds an allowlisted start snapshot, and feeds
 * changes to the recorder. It renders nothing and never mutates project state.
 */

import { useEffect } from 'react';
import type {
  AgentType,
  ChatMessage,
  JobInfo,
  SessionState,
  Settings,
} from '../../types';
import { useRecording } from '../../contexts/RecordingContext.tsx';
import type {
  CameraTransform,
  ReplayAreaLabel,
  ReplayBoundaryFile,
  ReplayCenterline,
  ReplayContourLabel,
  ReplayDimension,
  ReplayHatch,
  ReplayLine,
  ReplayParcelLabel,
  ReplayPointList,
  ReplayStreetLabel,
  ReplayTextAnnotation,
  ReplayUiState,
} from '../../utils/recording/types';

interface RecordingBridgeProps {
  pointLists: ReplayPointList[];
  lines: ReplayLine[];
  centerlines: ReplayCenterline[];
  contourLabels: ReplayContourLabel[];
  boundaryFiles?: ReplayBoundaryFile[];
  textAnnotations?: ReplayTextAnnotation[];
  dimensions?: ReplayDimension[];
  hatches?: ReplayHatch[];
  streetLabels?: ReplayStreetLabel[];
  parcelLabels?: ReplayParcelLabel[];
  areaLabels?: ReplayAreaLabel[];
  customSymbols?: NonNullable<SessionState['customSymbols']>;
  jobInfo: JobInfo;
  settings: Settings;
  camera: CameraTransform | null;
  chat: ChatMessage[];
  activeAgent: AgentType;
  ui: ReplayUiState;
}

export const RecordingBridge: React.FC<RecordingBridgeProps> = ({
  pointLists,
  lines,
  centerlines,
  contourLabels,
  boundaryFiles,
  textAnnotations,
  dimensions,
  hatches,
  streetLabels,
  parcelLabels,
  areaLabels,
  customSymbols,
  jobInfo,
  settings,
  camera,
  chat,
  activeAgent,
  ui,
}) => {
  const {
    setLatestSeed,
    recordCamera,
    recordUi,
    recordGeometry,
    recordChat,
  } = useRecording();

  useEffect(() => {
    setLatestSeed({
      title: jobInfo?.jobName?.trim() || 'Untitled training',
      camera,
      ui,
      project: {
        jobInfo,
        camera,
        // Allowlist display settings only. Credentials never enter a bundle.
        settings: {
          theme: settings?.theme,
          projection: settings?.projection,
        },
        pointLists: pointLists ?? [],
        lines: lines ?? [],
        centerlines: centerlines ?? [],
        contourLabels: contourLabels ?? [],
        boundaryFiles: boundaryFiles ?? [],
        textAnnotations: textAnnotations ?? [],
        dimensions: dimensions ?? [],
        hatches: hatches ?? [],
        streetLabels: streetLabels ?? [],
        parcelLabels: parcelLabels ?? [],
        areaLabels: areaLabels ?? [],
        customSymbols,
        files: [],
        chat: [{ agent: activeAgent, messages: chat ?? [] }],
        ui,
      },
    });
  }, [
    jobInfo,
    settings?.theme,
    settings?.projection,
    camera,
    ui,
    pointLists,
    lines,
    centerlines,
    contourLabels,
    boundaryFiles,
    textAnnotations,
    dimensions,
    hatches,
    streetLabels,
    parcelLabels,
    areaLabels,
    customSymbols,
    activeAgent,
    chat,
    setLatestSeed,
  ]);

  useEffect(() => { recordCamera(camera); }, [camera, recordCamera]);
  useEffect(() => { recordUi(ui); }, [ui, recordUi]);
  useEffect(() => { recordChat(activeAgent, chat); }, [activeAgent, chat, recordChat]);
  useEffect(() => { recordGeometry('pointLists', pointLists); }, [pointLists, recordGeometry]);
  useEffect(() => { recordGeometry('lines', lines); }, [lines, recordGeometry]);
  useEffect(() => { recordGeometry('centerlines', centerlines); }, [centerlines, recordGeometry]);
  useEffect(() => { recordGeometry('contourLabels', contourLabels); }, [contourLabels, recordGeometry]);
  useEffect(() => { recordGeometry('boundaryFiles', boundaryFiles ?? []); }, [boundaryFiles, recordGeometry]);
  useEffect(() => { recordGeometry('textAnnotations', textAnnotations ?? []); }, [textAnnotations, recordGeometry]);
  useEffect(() => { recordGeometry('dimensions', dimensions ?? []); }, [dimensions, recordGeometry]);
  useEffect(() => { recordGeometry('hatches', hatches ?? []); }, [hatches, recordGeometry]);
  useEffect(() => { recordGeometry('streetLabels', streetLabels ?? []); }, [streetLabels, recordGeometry]);
  useEffect(() => { recordGeometry('parcelLabels', parcelLabels ?? []); }, [parcelLabels, recordGeometry]);
  useEffect(() => { recordGeometry('areaLabels', areaLabels ?? []); }, [areaLabels, recordGeometry]);

  return null;
};
