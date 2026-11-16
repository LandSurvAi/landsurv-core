import React, { useEffect } from 'react';
import { useRecording } from '../../contexts/RecordingContext.tsx';
import { useReplayChannel } from '../../hooks/useReplayChannel';
import type { JsonValue, ReplayChannelDefinition } from '../../utils/recording/v2';

export interface PointDraft {
  pn: string;
  n: string;
  e: string;
  z: string;
  d: string;
}

export interface LatLonDraft {
  lat: string;
  lon: string;
  z: string;
  d: string;
}

export interface PlusCodeDraft {
  code: string;
  z: string;
  d: string;
}

export interface PendingPointDelete {
  type: 'point' | 'list';
  id: string;
}

const channel = <T,>(id: string): ReplayChannelDefinition<T> => ({
  id,
  surface: 'point-editor',
  version: 1,
  keyframe: true,
  diff: 'replace',
  serialize: value => value as unknown as JsonValue,
  deserialize: value => value as unknown as T,
});

const draft = channel<any>('pointEditor.draft');
const selection = channel<any>('pointEditor.selection');
const pendingDelete = channel<any>('pointEditor.pendingDelete');

interface ReplayPointEditorBindingProps {
  newPoint: PointDraft;
  setNewPoint: React.Dispatch<React.SetStateAction<PointDraft>>;
  addMode: 'ne' | 'latlon' | 'plus';
  setAddMode: React.Dispatch<React.SetStateAction<'ne' | 'latlon' | 'plus'>>;
  latLonInput: LatLonDraft;
  setLatLonInput: React.Dispatch<React.SetStateAction<LatLonDraft>>;
  plusCodeInput: PlusCodeDraft;
  setPlusCodeInput: React.Dispatch<React.SetStateAction<PlusCodeDraft>>;
  mapsLinkInput: string;
  setMapsLinkInput: React.Dispatch<React.SetStateAction<string>>;
  expandedListIds: Set<string>;
  setExpandedListIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  mergeTargetListId: string;
  setMergeTargetListId: React.Dispatch<React.SetStateAction<string>>;
  confirmingDelete: PendingPointDelete | null;
  setConfirmingDelete: React.Dispatch<React.SetStateAction<PendingPointDelete | null>>;
}

export const ReplayPointEditorBinding: React.FC<ReplayPointEditorBindingProps> = ({
  newPoint,
  setNewPoint,
  addMode,
  setAddMode,
  latLonInput,
  setLatLonInput,
  plusCodeInput,
  setPlusCodeInput,
  mapsLinkInput,
  setMapsLinkInput,
  expandedListIds,
  setExpandedListIds,
  mergeTargetListId,
  setMergeTargetListId,
  confirmingDelete,
  setConfirmingDelete,
}) => {
  const recording = useRecording();

  useReplayChannel(draft, { newPoint, addMode, latLonInput, plusCodeInput, mapsLinkInput }, next => {
    if (!next) return;
    if (next.newPoint) setNewPoint(next.newPoint);
    if (next.addMode) setAddMode(next.addMode);
    if (next.latLonInput) setLatLonInput(next.latLonInput);
    if (next.plusCodeInput) setPlusCodeInput(next.plusCodeInput);
    if (typeof next.mapsLinkInput === 'string') setMapsLinkInput(next.mapsLinkInput);
  });
  useReplayChannel(selection, { expandedListIds: Array.from(expandedListIds), mergeTargetListId }, next => {
    if (!next) return;
    setExpandedListIds(new Set(Array.isArray(next.expandedListIds) ? next.expandedListIds : []));
    if (typeof next.mergeTargetListId === 'string') setMergeTargetListId(next.mergeTargetListId);
  });
  useReplayChannel(pendingDelete, confirmingDelete, next => {
    setConfirmingDelete(next ?? null);
  });

  useEffect(() => {
    if (recording.phase !== 'recording') return;
    recording.recordChannel('pointEditor.draft', { newPoint, addMode, latLonInput, plusCodeInput, mapsLinkInput });
    recording.recordChannel('pointEditor.selection', {
      expandedListIds: Array.from(expandedListIds),
      mergeTargetListId,
    });
    recording.recordChannel('pointEditor.pendingDelete', confirmingDelete);
  }, [
    recording.phase,
    recording.recordChannel,
    newPoint,
    addMode,
    latLonInput,
    plusCodeInput,
    mapsLinkInput,
    expandedListIds,
    mergeTargetListId,
    confirmingDelete,
  ]);

  return null;
};
