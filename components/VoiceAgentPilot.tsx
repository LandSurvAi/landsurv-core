import React, { useEffect, useRef, useState } from 'react';
import type { VoiceExecutableTask, VoiceLayerSuggestion } from '../services/voiceOrchestrator.ts';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface WindowWithSpeech extends Window {
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  SpeechRecognition?: new () => SpeechRecognitionLike;
}

interface VoiceAgentPilotProps {
  enabled: boolean;
  isBusy?: boolean;
  isSpeaking?: boolean;
  prompt: string | null;
  layerSuggestion: VoiceLayerSuggestion | null;
  taskSuggestions: string[];
  executableTasks?: VoiceExecutableTask[];
  pendingTask?: VoiceExecutableTask | null;
  lastTaskExecution?: { label: string; success: boolean; message: string; at: number; confidence?: number } | null;
  canRetryLastFailedTask?: boolean;
  activity?: Array<{ id: string; text: string; at: number }>;
  onToggleEnabled: () => void;
  onSubmitUtterance: (utterance: string) => void | Promise<void>;
  onApplyLayerSuggestion: () => void;
  onDismissSuggestion: () => void;
  onRunTaskSuggestion: (suggestion: string) => void;
  onRunExecutableTask?: (task: VoiceExecutableTask) => void;
  onConfirmPendingTask?: () => void;
  onCancelPendingTask?: () => void;
  onRetryLastFailedTask?: () => void;
  onResetMemory?: () => void;
  onClose?: () => void;
}

export const VoiceAgentPilot: React.FC<VoiceAgentPilotProps> = ({
  enabled,
  isBusy = false,
  isSpeaking = false,
  prompt,
  layerSuggestion,
  taskSuggestions,
  executableTasks = [],
  pendingTask = null,
  lastTaskExecution = null,
  canRetryLastFailedTask = false,
  activity = [],
  onToggleEnabled,
  onSubmitUtterance,
  onApplyLayerSuggestion,
  onDismissSuggestion,
  onRunTaskSuggestion,
  onRunExecutableTask,
  onConfirmPendingTask,
  onCancelPendingTask,
  onRetryLastFailedTask,
  onResetMemory,
  onClose,
}) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [supportsSpeech, setSupportsSpeech] = useState(false);
  const [isRolledUp, setIsRolledUp] = useState(true);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 16, y: 16 };
    return { x: Math.max(16, window.innerWidth - 266), y: 16 };
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number; pointerId: number | null }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
    pointerId: null,
  });

  useEffect(() => {
    const win = window as WindowWithSpeech;
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    setSupportsSpeech(!!Ctor);
  }, []);

  const toggleListening = () => {
    if (!supportsSpeech) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const win = window as WindowWithSpeech;
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalTranscript = '';
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const value = event.results[i]?.[0]?.transcript || '';
        if (event.results[i]?.isFinal) {
          finalTranscript += value;
        } else {
          interim += value;
        }
      }
      const display = (finalTranscript + ' ' + interim).trim();
      if (display) setInput(display);
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      const transcript = finalTranscript.trim() || input.trim();
      if (transcript) {
        onSubmitUtterance(transcript);
        setInput('');
      }
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const updatePanelPosition = (clientX: number, clientY: number) => {
    const panelWidth = panelRef.current?.offsetWidth ?? 250;
    const panelHeight = panelRef.current?.offsetHeight ?? 120;
    const nextX = Math.min(
      Math.max(8, clientX - dragRef.current.offsetX),
      Math.max(8, window.innerWidth - panelWidth - 8)
    );
    const nextY = Math.min(
      Math.max(8, clientY - dragRef.current.offsetY),
      Math.max(8, window.innerHeight - panelHeight - 8)
    );
    setPanelPos({ x: nextX, y: nextY });
  };

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      dragging: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      pointerId: e.pointerId,
    };
    e.preventDefault();
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || dragRef.current.pointerId !== e.pointerId) return;
    updatePanelPosition(e.clientX, e.clientY);
  };

  const onHeaderPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current.dragging = false;
    dragRef.current.pointerId = null;
    if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={panelRef}
      className="fixed z-[58] w-[250px] max-w-[calc(100vw-1rem)] rounded-lg border border-cyan-500/40 bg-gray-900/95 shadow-xl backdrop-blur-sm"
      style={{ left: `${panelPos.x}px`, top: `${panelPos.y}px` }}
    >
      <div
        className="flex cursor-move select-none items-center justify-between border-b border-cyan-500/20 px-2.5 py-2"
        style={{ touchAction: 'none' }}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerEnd}
        onPointerCancel={onHeaderPointerEnd}
      >
        <div>
          <p className="text-sm font-semibold text-cyan-300">Voice Agent</p>
          <p className="text-[10px] text-gray-400">Pre-Alpha • general CACP assistant</p>
        </div>
        <div className="flex items-center gap-1">
          {isSpeaking && <span className="text-[9px] font-semibold text-emerald-300">SPEAK</span>}
          {isBusy && <span className="text-[9px] font-semibold text-cyan-300">THINK</span>}
          <button
            onClick={() => setIsRolledUp(prev => !prev)}
            className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-200 hover:bg-gray-600"
            title={isRolledUp ? 'Expand voice panel' : 'Roll up voice panel'}
          >
            {isRolledUp ? '▾' : '▴'}
          </button>
          <button
            onClick={onToggleEnabled}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${enabled ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            title={enabled ? 'Disable voice agent' : 'Enable voice agent'}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-200 hover:bg-gray-600"
              title="Close voice panel"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {!enabled ? (
        <p className="px-3 py-2 text-[11px] text-gray-400">Voice Agent is paused.</p>
      ) : isRolledUp ? (
        <div className="px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-300">{isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready'}</p>
            <button
              onClick={toggleListening}
              disabled={!supportsSpeech}
              className={`h-10 w-10 rounded-full text-sm text-white transition-all ${isListening ? 'bg-red-600 hover:bg-red-500 animate-pulse' : 'bg-cyan-600 hover:bg-cyan-500'} disabled:bg-gray-700 disabled:text-gray-500`}
              title={supportsSpeech ? (isListening ? 'Stop listening' : 'Start listening') : 'Speech recognition not available'}
            >
              {isListening ? '■' : '🎙'}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-2.5 py-2 space-y-2">
          <div className="flex items-center justify-center">
            <button
              onClick={toggleListening}
              disabled={!supportsSpeech}
              className={`h-14 w-14 rounded-full text-xl text-white transition-all ${isListening ? 'bg-red-600 hover:bg-red-500 animate-pulse' : 'bg-cyan-600 hover:bg-cyan-500'} disabled:bg-gray-700 disabled:text-gray-500`}
              title={supportsSpeech ? (isListening ? 'Stop listening' : 'Start listening') : 'Speech recognition not available'}
            >
              {isListening ? '■' : '🎙'}
            </button>
          </div>

          <p className="text-center text-[11px] font-semibold text-cyan-200">
            {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready to listen'}
          </p>

          {input && (
            <div className="rounded border border-gray-700 bg-gray-800/70 px-2 py-1.5">
              <p className="text-[10px] text-gray-500">You said</p>
              <p className="text-[11px] text-gray-200">"{input}"</p>
            </div>
          )}

          <p className="rounded border border-cyan-600/30 bg-cyan-900/20 px-2 py-1.5 text-center text-[10px] text-cyan-200">
            {prompt || 'Tell me what you are drawing.'}
          </p>

          {activity.length > 0 && (
            <div className="max-h-16 space-y-1 overflow-y-auto">
              {activity.slice(-2).map((entry) => (
                <p key={entry.id} className="text-[10px] text-gray-400">• {entry.text}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceAgentPilot;
