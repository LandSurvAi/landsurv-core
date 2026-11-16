import React, { useEffect } from 'react';
import { useRecording } from '../../contexts/RecordingContext.tsx';
import { useReplayChannel } from '../../hooks/useReplayChannel';
import type { JsonValue, ReplayChannelDefinition } from '../../utils/recording/v2';

export interface PdfTransform {
  scale: number;
  x: number;
  y: number;
}

const channel = <T,>(id: string): ReplayChannelDefinition<T> => ({
  id,
  surface: 'pdf-viewer',
  version: 1,
  keyframe: true,
  diff: 'replace',
  serialize: value => value as unknown as JsonValue,
  deserialize: value => value as unknown as T,
});

const pageIndex = channel<number>('pdf.pageIndex');
const zoom = channel<number>('pdf.zoom');
const scroll = channel<{ x: number; y: number }>('pdf.scroll');
const rotation = channel<number>('pdf.rotation');
const fileIndex = channel<number>('pdf.fileIndex');

interface ReplayPdfBindingProps {
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  transform: PdfTransform;
  setTransform: React.Dispatch<React.SetStateAction<PdfTransform>>;
  rotation: number;
  setRotation: React.Dispatch<React.SetStateAction<number>>;
  currentFileIndex: number;
  setCurrentFileIndex: React.Dispatch<React.SetStateAction<number>>;
}

export const ReplayPdfBinding: React.FC<ReplayPdfBindingProps> = ({
  currentPage,
  setCurrentPage,
  transform,
  setTransform,
  rotation: currentRotation,
  setRotation,
  currentFileIndex,
  setCurrentFileIndex,
}) => {
  const recording = useRecording();

  useReplayChannel(pageIndex, currentPage, setCurrentPage);
  useReplayChannel(zoom, transform.scale, scale => {
    setTransform(previous => ({ ...previous, scale }));
  });
  useReplayChannel(scroll, { x: transform.x, y: transform.y }, next => {
    setTransform(previous => ({ ...previous, x: next.x, y: next.y }));
  });
  useReplayChannel(rotation, currentRotation, setRotation);
  useReplayChannel(fileIndex, currentFileIndex, setCurrentFileIndex);

  useEffect(() => {
    if (recording.phase !== 'recording') return;
    recording.recordChannel('pdf.pageIndex', currentPage);
    recording.recordChannel('pdf.zoom', transform.scale);
    recording.recordChannel('pdf.scroll', { x: transform.x, y: transform.y });
    recording.recordChannel('pdf.rotation', currentRotation);
    recording.recordChannel('pdf.fileIndex', currentFileIndex);
  }, [
    recording.phase,
    recording.recordChannel,
    currentPage,
    transform.scale,
    transform.x,
    transform.y,
    currentRotation,
    currentFileIndex,
  ]);

  return null;
};
