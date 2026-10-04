import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, AdjustmentsHorizontalIcon, CogIcon } from './icons.tsx';
import { AgentType, type Settings, type NtripSettings, type JobInfo, type PointLabelingSettings } from '../types.ts';
import { projectionStates, projectionZones } from '../utils/projections.ts';
import { LINEAR_UNIT_OPTIONS, getLinearUnitAbbreviation, type LinearUnit } from '../utils/linearUnits.ts';
import { setHolidayThemeOverride } from './InitialAgentSelection.tsx';
import { useErrorReporter } from '../contexts/AppStateContext';
import { PROVIDER_KEY_URLS, type ByokProvider } from '../services/providerKeys.ts';

const AUTO_SELECTOR_OPTION = 'auto';
const getSelectorModelValue = (modelName: string): string => modelName;
const getSelectorModelLabel = (modelName: string): string => (
    modelName === AUTO_SELECTOR_OPTION ? 'Auto (smart routing)'
    : modelName === 'claude-sonnet-5' ? 'Claude Sonnet 5'
    : modelName === 'claude-opus-5' ? 'Claude Opus 5'
    : modelName === 'claude-fable-5' ? 'Claude Fable 5'
    : modelName === 'gemini-3.7-flash' ? 'Gemini 3.7 Flash'
    : modelName === 'gemini-3.8-flash' ? 'Gemini 3.8 Flash'
    : modelName === 'gemini-3.5-flash-lite' ? 'Gemini 3.5 Flash Lite'
    : modelName === 'gpt-5.6-terra' ? 'GPT-5.6 Terra (your OpenAI key)'
    : modelName === 'gpt-5.4-mini' ? 'GPT-5.4 Mini (your OpenAI key)'
    : modelName === 'grok-4.3' ? 'Grok 4.3 (your xAI key)'
    : modelName === 'grok-4.1-fast' ? 'Grok 4.1 Fast (your xAI key)'
    : modelName
);

interface SettingsPageProps {
  settings: Settings;
  onSettingsChange: React.Dispatch<React.SetStateAction<Settings>>;
  onClose: () => void;
  onReset: () => void;
    onApiKeySubmit?: (apiKey: string) => boolean;
        onProviderKeySubmit?: (provider: ByokProvider, apiKey: string) => boolean;
        isSuperUser?: boolean;
        hasApiKey?: boolean;
  activeAgent: AgentType;
  activeModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  jobInfo: JobInfo;
  onJobInfoChange: React.Dispatch<React.SetStateAction<JobInfo>>;
  pulseProjection?: boolean;
  pulseApiKey?: boolean;
    autoHighThinkingModel?: string;
    autoHighThinkingOptions?: string[];
    onAutoHighThinkingModelChange?: (model: string) => void;
    onTriggerHostCostReminder?: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
    settings, onSettingsChange, onClose, onReset, activeAgent, activeModel, availableModels,
    onModelChange, jobInfo, onJobInfoChange, pulseProjection, pulseApiKey, onApiKeySubmit
    , onProviderKeySubmit
    , isSuperUser, hasApiKey
    , autoHighThinkingModel, autoHighThinkingOptions, onAutoHighThinkingModelChange
    , onTriggerHostCostReminder
}) => {
    const [isConfirmingReset, setIsConfirmingReset] = useState(false);
    const [showScrollIndicator, setShowScrollIndicator] = useState(true);
    const [inputApiKey, setInputApiKey] = useState(settings.userApiKey || '');
    const [providerKeyInputs, setProviderKeyInputs] = useState<Record<Exclude<ByokProvider, 'google'>, string>>({
        openai: settings.openaiApiKey || '',
        xai: settings.xaiApiKey || '',
        anthropic: settings.anthropicApiKey || '',
    });
    const googleMapsSectionRef = useRef<HTMLDivElement | null>(null);
    const { reportError, notify } = useErrorReporter();

    useEffect(() => {
        setInputApiKey(settings.userApiKey || '');
    }, [settings.userApiKey]);

    useEffect(() => {
        setProviderKeyInputs({
            openai: settings.openaiApiKey || '',
            xai: settings.xaiApiKey || '',
            anthropic: settings.anthropicApiKey || '',
        });
    }, [settings.openaiApiKey, settings.xaiApiKey, settings.anthropicApiKey]);

    useEffect(() => {
        const handleFocusGoogleMaps = () => {
            googleMapsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        window.addEventListener('landsurv-open-settings-google-maps', handleFocusGoogleMaps as EventListener);
        return () => {
            window.removeEventListener('landsurv-open-settings-google-maps', handleFocusGoogleMaps as EventListener);
        };
    }, []);
    
    const selectedModelValue = getSelectorModelValue(activeModel);
    
  const handleSettingChange = (key: keyof Settings, value: any) => {
    onSettingsChange(prev => ({ ...prev, [key]: value }));
  };
  
  const handleDefaultInfoChange = (key: keyof Settings['defaultCutSheetInfo'], value: string) => {
    onSettingsChange(prev => ({
      ...prev,
      defaultCutSheetInfo: {
        ...prev.defaultCutSheetInfo,
        [key]: value
      }
    }));
  };

  const handlePointLabelingChange = (key: keyof PointLabelingSettings, value: any) => {
    onSettingsChange(prev => ({
        ...prev,
        pointLabelingSettings: {
            ...prev.pointLabelingSettings,
            [key]: value
        }
    }));
  };

  const handleNtripChange = (key: keyof NtripSettings, value: any) => {
    onSettingsChange(prev => ({
        ...prev,
        ntrip: {
            ...prev.ntrip,
            [key]: value,
        },
    }));
  };

  const gmDefaults = {
    enabled: false,
    apiKey: '',
    mapType: 'naip' as const,
    opacity: 1.0,
    scale: 2 as 1 | 2,
    showLabels: true,
  };
  const handleGoogleMapsChange = (key: keyof NonNullable<Settings['googleMaps']>, value: any) => {
    onSettingsChange(prev => ({
        ...prev,
        googleMaps: {
            ...gmDefaults,
            ...(prev.googleMaps ?? {}),
            [key]: value,
        },
    }));
  };
  
  const availableZones = settings.projection.state
    ? projectionZones[projectionStates.find(s => s.name === settings.projection.state)?.code || ''] || []
    : [];

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedStateName = e.target.value;
    const selectedState = projectionStates.find(s => s.name === selectedStateName);
    onSettingsChange(prev => ({
        ...prev,
        projection: {
            state: selectedState ? selectedState.name : null,
            zoneName: null,
            epsg: null,
        }
    }));
  };

  const handleZoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedEpsg = parseInt(e.target.value, 10);
    const selectedZone = availableZones.find(z => z.epsg === selectedEpsg);
    
    onSettingsChange(prev => ({
        ...prev,
        projection: {
            ...prev.projection,
            zoneName: selectedZone ? selectedZone.name : null,
            epsg: selectedZone ? selectedZone.epsg : null,
        }
    }));
  };


  const themeColor = 'text-gray-400';
  const themeShadow = 'shadow-gray-500/20';
  const themeFocusRing = 'focus:ring-gray-500';
  const themeAccent = 'accent-gray-500';

  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in light-theme:bg-gray-500/80"
      onClick={onClose}
    >
      <div 
        className={`bg-gray-800 border border-gray-700 rounded-lg shadow-2xl ${themeShadow} max-w-xl w-full max-h-[90vh] flex flex-col animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0 light-theme:border-gray-300">
          <h2 className={`text-2xl font-bold ${themeColor} flex items-center gap-3 light-theme:text-gray-600`}><AdjustmentsHorizontalIcon className="w-7 h-7"/> Settings</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400 light-theme:text-gray-500" />
          </button>
        </header>

        <main className="flex-grow p-6 text-gray-300 space-y-6 overflow-y-auto scrollbar-hide light-theme:text-gray-700 relative" onScroll={() => setShowScrollIndicator(false)}>

            {/* AI Settings Section */}
            <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">AI Behavior</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 space-y-3 light-theme:bg-gray-100 light-theme:border-gray-300">
                    <div>
                        <label htmlFor="modelSelector" className="flex items-center gap-2 text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">
                            AI Model
                            <CogIcon className="w-4 h-4 text-gray-500" />
                        </label>
                        <select 
                            id="modelSelector" 
                            value={selectedModelValue} 
                            onChange={e => onModelChange(e.target.value)} 
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                        >
                            {availableModels.map(model => (
                                <option key={model} value={model}>{getSelectorModelLabel(model)}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            {activeModel === AUTO_SELECTOR_OPTION && `Auto mode uses Gemini 3.5 Flash Lite for quick tasks and ${getSelectorModelLabel(autoHighThinkingModel || 'gemini-3.7-flash')} for high-thinking agents.`}
                            {activeModel === 'gemini-3.7-flash' && 'Gemini 3.7 Flash via Vertex AI backend'}
                            {activeModel.startsWith('claude-') && (settings.anthropicApiKey?.trim() ? 'Anthropic Claude via your own Anthropic key (browser-direct)' : 'Anthropic Claude via Vertex AI backend')}
                            {/^(gpt-|o\d|chatgpt-)/i.test(activeModel) && 'OpenAI via your own OpenAI key (browser-direct)'}
                            {/^grok-/i.test(activeModel) && 'xAI Grok via your own xAI key (browser-direct)'}
                        </p>
                    </div>
                    <div>
                        <label htmlFor="autoThinkingSelector" className="flex items-center gap-2 text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">
                            Auto High-Thinking Model
                            <CogIcon className="w-4 h-4 text-gray-500" />
                        </label>
                        <select
                            id="autoThinkingSelector"
                            value={autoHighThinkingModel || 'gemini-3.7-flash'}
                            onChange={e => onAutoHighThinkingModelChange?.(e.target.value)}
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                        >
                            {(autoHighThinkingOptions || ['gemini-3.7-flash', 'gemini-3.8-flash', 'claude-sonnet-5', 'claude-opus-5', 'claude-fable-5']).map(model => (
                                <option key={model} value={model}>{getSelectorModelLabel(model)}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">This controls Auto mode for complex agents. You can keep Gemini 3.7 Flash, or choose an entitled Claude model.</p>
                    </div>
                    <div>
                        <label htmlFor="uncertaintySensitivity" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Uncertainty Sensitivity</label>
                        <select 
                            id="uncertaintySensitivity" 
                            value={settings.uncertaintySensitivity} 
                            onChange={e => handleSettingChange('uncertaintySensitivity', e.target.value)} 
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                        >
                            <option value="low">Low (Fewer flags, higher confidence required)</option>
                            <option value="medium">Medium (Balanced)</option>
                            <option value="high">High (More flags, lower confidence required)</option>
                            <option value="strict">Strict (Flag any potential ambiguity)</option>
                        </select>
                         <p className="text-xs text-gray-500 mt-1">Controls how aggressively the AI flags potential errors or illegible content in PDFs.</p>
                    </div>
                </div>
            </div>
            {/* Developer & Testing Section */}
            <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">Developer / Testing</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 space-y-3 light-theme:bg-gray-100 light-theme:border-gray-300">
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={!!settings.debugPreflightEstimate}
                                onChange={e => handleSettingChange('debugPreflightEstimate', e.target.checked)}
                                className={`w-4 h-4 ${themeAccent}`}
                            />
                            <span className="text-sm font-medium text-gray-300 light-theme:text-gray-700">Show preflight token/cost estimate before AI runs</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-7">Debug only. Adds an in-chat estimate for input tokens and estimated input-side cost before each request is sent.</p>
                    </div>

                    <div>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={!!settings.debugGimbalHud}
                                onChange={e => handleSettingChange('debugGimbalHud', e.target.checked)}
                                className={`w-4 h-4 ${themeAccent}`}
                            />
                            <span className="text-sm font-medium text-gray-300 light-theme:text-gray-700">Show Civil Drafter Gimbal Vision HUD</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-7">Debug only. The gimbal vision pass always runs behind the scenes — this toggle only shows the scanning HUD overlay on the canvas.</p>
                    </div>

                    <div>
                        <label htmlFor="holidayTheme" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Holiday Theme Override 🎄</label>
                        <select
                            id="holidayTheme"
                            defaultValue={typeof window !== 'undefined' ? localStorage.getItem('landsurv-holiday-theme') || 'auto' : 'auto'}
                            onChange={e => {
                                setHolidayThemeOverride(e.target.value as 'auto' | 'christmas' | 'nye' | 'none');
                                // Force page refresh to apply theme immediately
                                window.location.reload();
                            }}
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                        >
                            <option value="auto">Auto (based on date)</option>
                            <option value="christmas">🎄 Christmas (snowflakes + gold stars)</option>
                            <option value="nye">🎆 New Year's Eve (snowflakes + fireworks)</option>
                            <option value="none">Off (no holiday decorations)</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Override the holiday theme for testing. Auto mode shows Christmas Dec 1-25, NYE Dec 26-Jan 1.</p>
                    </div>

                    <div>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                defaultChecked={typeof window !== 'undefined' && localStorage.getItem('landsurv_reduced_motion') === 'true'}
                                onChange={e => {
                                    const on = e.target.checked;
                                    if (on) {
                                        localStorage.setItem('landsurv_reduced_motion', 'true');
                                        document.documentElement.setAttribute('data-reduced-motion', 'true');
                                    } else {
                                        localStorage.removeItem('landsurv_reduced_motion');
                                        document.documentElement.removeAttribute('data-reduced-motion');
                                    }
                                }}
                                className={`w-4 h-4 ${themeAccent}`}
                            />
                            <span className="text-sm font-medium text-gray-300 light-theme:text-gray-700">🛑 Reduce motion (disable pulsing / shimmering animations)</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-7">Turns off the looping pulse, shimmer, and ping animations on agent cards and status badges. Off by default — animations stay on even if your OS has "Reduce motion" enabled. Applies immediately and persists across reloads.</p>
                    </div>

                </div>
            </div>
            {/* Canvas & Display Section */}
            <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">Canvas & Display</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 grid grid-cols-1 sm:grid-cols-2 gap-4 light-theme:bg-gray-100 light-theme:border-gray-300">
                    <div>
                        <label htmlFor="linearUnits" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Linear Units</label>
                        <select
                            id="linearUnits"
                            value={settings.linearUnits || 'usSurveyFoot'}
                            onChange={e => handleSettingChange('linearUnits', e.target.value as LinearUnit)}
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                        >
                            {LINEAR_UNIT_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label} ({option.abbreviation})</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1 light-theme:text-gray-600">
                            Used for typed line lengths and drafting display. Current abbreviation: {getLinearUnitAbbreviation(settings.linearUnits)}
                        </p>
                    </div>
                    <div>
                        <label htmlFor="northArrowStyle" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">North Arrow Style</label>
                        <select 
                            id="northArrowStyle" 
                            value={settings.northArrowStyle} 
                            onChange={e => handleSettingChange('northArrowStyle', e.target.value)} 
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                        >
                            <option value="classic">Classic</option>
                            <option value="modern">Modern</option>
                            <option value="elegant">Elegant</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="northArrowPosition" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">North Arrow Position</label>
                        <select 
                            id="northArrowPosition" 
                            value={settings.northArrowPosition} 
                            onChange={e => handleSettingChange('northArrowPosition', e.target.value)} 
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                        >
                            <option value="left">Top Left</option>
                            <option value="right">Top Right</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="pointAttributeScaling" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Annotation Text Scaling</label>
                        <select 
                            id="pointAttributeScaling" 
                            value={settings.pointAttributeScaling} 
                            onChange={e => handleSettingChange('pointAttributeScaling', e.target.value)} 
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                        >
                            <option value="screen">Fixed Size (Screen-Relative)</option>
                            <option value="world">Scale with Zoom (World-Relative)</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1 light-theme:text-gray-600">
                            Applies project-wide to annotation text. Fixed size keeps labels the same size regardless of zoom. Scale with zoom makes labels larger or smaller as you zoom in and out.
                        </p>
                    </div>
                    <div>
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.showPointSymbols === true}
                                onChange={e => handleSettingChange('showPointSymbols', e.target.checked)}
                                className={`mt-0.5 h-4 w-4 rounded border-gray-500 bg-gray-700 ${themeAccent} focus:ring-2 ${themeFocusRing}`}
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-300 light-theme:text-gray-700">Enable Point Symbols</span>
                                <span className="block text-xs text-gray-500 mt-0.5 light-theme:text-gray-600">
                                    Off by default while symbol rendering is being stabilized. Turn this on to show matching custom, CAD Manager, and built-in symbols normally.
                                </span>
                            </span>
                        </label>
                    </div>
                    <div>
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!settings.showCacpNotifications}
                                onChange={e => handleSettingChange('showCacpNotifications', e.target.checked)}
                                className={`mt-0.5 h-4 w-4 rounded border-gray-500 bg-gray-700 ${themeAccent} focus:ring-2 ${themeFocusRing}`}
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-300 light-theme:text-gray-700">Show CACP Activity Notifications</span>
                                <span className="block text-xs text-gray-500 mt-0.5 light-theme:text-gray-600">
                                    Display ephemeral pill notifications in the bottom-left when agents talk to each other via the Cross-Agent Communications Protocol. Off by default.
                                </span>
                            </span>
                        </label>
                        <label className={`mt-2 ml-7 flex items-start gap-3 ${settings.showCacpNotifications ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                            <input
                                type="checkbox"
                                checked={!!settings.showCacpHandlerNotifications}
                                disabled={!settings.showCacpNotifications}
                                onChange={e => handleSettingChange('showCacpHandlerNotifications', e.target.checked)}
                                className={`mt-0.5 h-4 w-4 rounded border-gray-500 bg-gray-700 ${themeAccent} focus:ring-2 ${themeFocusRing}`}
                            />
                            <span>
                                <span className="block text-xs font-medium text-gray-300 light-theme:text-gray-700">Include Internal Handler Phase</span>
                                <span className="block text-xs text-gray-500 mt-0.5 light-theme:text-gray-600">
                                    Shows deeper CACP dispatch steps in notifications for debugging. Keep off for quieter day-to-day use.
                                </span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>
            {/* Point Labeling Section */}
            <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">Point Labeling</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 space-y-4 light-theme:bg-gray-100 light-theme:border-gray-300">
                    <div>
                        <label htmlFor="point-label-style" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Numbering Style</label>
                        <select id="point-label-style" value={settings.pointLabelingSettings.style} onChange={e => handlePointLabelingChange('style', e.target.value)} className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}>
                            <option value="numeric">Numeric (1, 2, 3...)</option>
                            <option value="alphabetic">Alphabetic (A, B, C...)</option>
                        </select>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label htmlFor="point-label-prefix" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Prefix</label>
                            <input type="text" id="point-label-prefix" value={settings.pointLabelingSettings.prefix} onChange={e => handlePointLabelingChange('prefix', e.target.value)} className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`} />
                        </div>
                        <div className="flex-1">
                            <label htmlFor="point-label-next" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Next Number</label>
                            <input type="number" id="point-label-next" min="1" value={settings.pointLabelingSettings.nextNumber} onChange={e => handlePointLabelingChange('nextNumber', parseInt(e.target.value, 10) || 1)} className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`} />
                        </div>
                    </div>
                </div>
            </div>
             {/* Coordinate Systems Section */}
            <div className={pulseProjection ? 'animate-pulse' : ''}>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">Coordinate System</h3>
                <div className={`bg-gray-700/50 p-4 rounded-lg border space-y-3 light-theme:bg-gray-100 ${pulseProjection ? 'border-cyan-500 shadow-lg shadow-cyan-500/50' : 'border-gray-600 light-theme:border-gray-300'}`}>
                    <p className="text-xs text-gray-400">Select a State Plane zone to enable GPS functionality and GIS data plotting.</p>
                     <div className="flex items-center gap-4">
                        <div className="flex-1">
                        <label htmlFor="state-select" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">State</label>
                        <select id="state-select" value={settings.projection.state || ''} onChange={handleStateChange} className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}>
                            <option value="">Select State...</option>
                            {projectionStates.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
                        </select>
                        </div>
                        <div className="flex-1">
                        <label htmlFor="zone-select" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Zone</label>
                        <select id="zone-select" value={settings.projection.epsg || ''} onChange={handleZoneChange} disabled={!settings.projection.state} className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} disabled:opacity-50 light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}>
                            <option value="">Select Zone...</option>
                            {availableZones.map(z => <option key={z.epsg} value={z.epsg}>{z.name}</option>)}
                        </select>
                        </div>
                    </div>
                </div>
            </div>
            {/* Map Imagery Overlay Section */}
            <div id="google-maps-overlay-section" ref={googleMapsSectionRef}>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">Map Imagery Overlay</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 space-y-3 light-theme:bg-gray-100 light-theme:border-gray-300">
                    <label htmlFor="gmEnabled" className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" id="gmEnabled"
                            checked={settings.googleMaps?.enabled ?? false}
                            onChange={e => handleGoogleMapsChange('enabled', e.target.checked)}
                            className="h-5 w-5 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="font-medium text-gray-200 light-theme:text-gray-800">Enable map imagery overlay on canvas</span>
                    </label>
                    <p className="text-xs text-gray-500 light-theme:text-gray-500">
                        Renders NAIP or Google Static Maps imagery beneath survey geometry, reprojected to match the project CRS. Requires a project projection to be set.
                    </p>

                    <div>
                        <label htmlFor="gmApiKey" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Google Static Maps API Key <span className="text-gray-500 font-normal">(optional)</span></label>
                        <input type="password" id="gmApiKey"
                            value={settings.googleMaps?.apiKey ?? ''}
                            onChange={e => handleGoogleMapsChange('apiKey', e.target.value)}
                            placeholder="AIza…"
                            className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                            autoComplete="off"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Optional for Google map types — NAIP does not require this key. Auto Draft and imagery fall back to your AI key or the built-in server proxy when this is blank. Get one at <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">console.cloud.google.com</a>. Enable the <em>Maps Static API</em> on your project. Stored only in your browser.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="gmMapType" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Map Type</label>
                            <select id="gmMapType"
                                value={settings.googleMaps?.mapType ?? 'naip'}
                                onChange={e => handleGoogleMapsChange('mapType', e.target.value)}
                                className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                            >
                                <option value="roadmap">Roadmap</option>
                                <option value="satellite">Satellite</option>
                                <option value="naip">NAIP (USDA aerial)</option>
                                <option value="hybrid">Hybrid (satellite + labels)</option>
                                <option value="terrain">Terrain</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="gmScale" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Resolution (scale)</label>
                            <select id="gmScale"
                                value={String(settings.googleMaps?.scale ?? 2)}
                                onChange={e => handleGoogleMapsChange('scale', parseInt(e.target.value, 10) === 2 ? 2 : 1)}
                                className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                            >
                                <option value="1">1× (standard)</option>
                                <option value="2">2× (Retina)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="gmOpacity" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">
                            Opacity: {Math.round((settings.googleMaps?.opacity ?? 1.0) * 100)}%
                        </label>
                        <input type="range" id="gmOpacity" min="0" max="1" step="0.05"
                            value={settings.googleMaps?.opacity ?? 1.0}
                            onChange={e => handleGoogleMapsChange('opacity', parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    {settings.googleMaps?.mapType === 'hybrid' && (
                        <label htmlFor="gmLabels" className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" id="gmLabels"
                                checked={settings.googleMaps?.showLabels ?? true}
                                onChange={e => handleGoogleMapsChange('showLabels', e.target.checked)}
                                className="h-5 w-5 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300 light-theme:text-gray-700">Show road / place labels on hybrid (off = plain satellite)</span>
                        </label>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="gmLang" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Language (optional)</label>
                            <input type="text" id="gmLang"
                                value={settings.googleMaps?.language ?? ''}
                                onChange={e => handleGoogleMapsChange('language', e.target.value || undefined)}
                                placeholder="en"
                                className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                            />
                        </div>
                        <div>
                            <label htmlFor="gmRegion" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Region bias (optional)</label>
                            <input type="text" id="gmRegion"
                                value={settings.googleMaps?.region ?? ''}
                                onChange={e => handleGoogleMapsChange('region', e.target.value || undefined)}
                                placeholder="US"
                                className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                            />
                        </div>
                    </div>

                    {(settings.googleMaps?.mapType === 'roadmap' || settings.googleMaps?.mapType === 'terrain') && (
                        <div>
                            <label htmlFor="gmStyle" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Styled Maps JSON (optional)</label>
                            <textarea id="gmStyle"
                                value={settings.googleMaps?.styleJson ?? ''}
                                onChange={e => handleGoogleMapsChange('styleJson', e.target.value || undefined)}
                                rows={4}
                                placeholder='[{"featureType":"poi","stylers":[{"visibility":"off"}]}]'
                                className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-xs font-mono text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Paste a Styled Maps JSON array (e.g. from <a href="https://mapstyle.withgoogle.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">mapstyle.withgoogle.com</a>). Ignored for satellite/hybrid.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {/* NTRIP Settings Section */}
            <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">NTRIP Caster Settings</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 space-y-3 light-theme:bg-gray-100 light-theme:border-gray-300">
                    <label htmlFor="ntripEnabled" className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" id="ntripEnabled"
                            checked={settings.ntrip.enabled}
                            onChange={e => handleNtripChange('enabled', e.target.checked)}
                            className={`h-5 w-5 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500`}
                        />
                        <span className="font-medium text-gray-200 light-theme:text-gray-800">Enable NTRIP Corrections</span>
                    </label>

                    {settings.ntrip.enabled && (
                        <div className="space-y-3 pt-3 border-t border-gray-600 light-theme:border-gray-300">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="ntripHost" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Host/IP Address</label>
                                    <input type="text" id="ntripHost"
                                        value={settings.ntrip.host}
                                        onChange={e => handleNtripChange('host', e.target.value)}
                                        placeholder="caster.example.com"
                                        className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="ntripPort" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Port</label>
                                    <input type="number" id="ntripPort"
                                        value={settings.ntrip.port}
                                        onChange={e => handleNtripChange('port', parseInt(e.target.value, 10) || 2101)}
                                        className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="ntripMountpoint" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Mountpoint</label>
                                <input type="text" id="ntripMountpoint"
                                    value={settings.ntrip.mountpoint}
                                    onChange={e => handleNtripChange('mountpoint', e.target.value)}
                                    placeholder="RTCM3_NEAR"
                                    className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="ntripUsername" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Username</label>
                                    <input type="text" id="ntripUsername"
                                        value={settings.ntrip.username}
                                        onChange={e => handleNtripChange('username', e.target.value)}
                                        className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="ntripPassword" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Password</label>
                                    <input type="password" id="ntripPassword"
                                        value={settings.ntrip.password || ''}
                                        onChange={e => handleNtripChange('password', e.target.value)}
                                        className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
             {/* Cut Sheet Defaults Section */}
            <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">Cut Sheet Defaults</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 grid grid-cols-2 gap-4 light-theme:bg-gray-100 light-theme:border-gray-300">
                    <div>
                        <label htmlFor="companyName" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Company Name</label>
                        <input type="text" id="companyName" value={settings.defaultCutSheetInfo.companyName} onChange={e => handleDefaultInfoChange('companyName', e.target.value)} className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}/>
                    </div>
                    <div>
                        <label htmlFor="crewChief" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Crew Chief</label>
                        <input type="text" id="crewChief" value={settings.defaultCutSheetInfo.crewChief} onChange={e => handleDefaultInfoChange('crewChief', e.target.value)} className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 ${themeFocusRing} light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900`}/>
                    </div>
                </div>
            </div>
            
            {/* Notion Integration Section */}
            <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-2 light-theme:text-gray-800">Notion Integration</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 space-y-3 light-theme:bg-gray-100 light-theme:border-gray-300">
                    {!settings.notion?.enabled ? (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-400 light-theme:text-gray-600">
                                Connect your Notion workspace to export fieldbook entries, points, and project data directly to Notion pages.
                            </p>
                            <button
                                onClick={() => {
                                    // For now, show manual token entry
                                    const token = prompt('Enter your Notion Integration Token:\n\nTo get a token:\n1. Go to https://www.notion.so/my-integrations\n2. Create a new integration\n3. Copy the Internal Integration Token\n4. Paste it here');
                                    if (token) {
                                        onSettingsChange(prev => ({
                                            ...prev,
                                            notion: {
                                                enabled: true,
                                                accessToken: token,
                                                workspaceName: 'My Workspace',
                                            }
                                        }));
                                    }
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                            >
                                Connect Notion
                            </button>
                            <p className="text-xs text-gray-500 light-theme:text-gray-500">
                                You'll need to create a Notion integration at <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">notion.so/my-integrations</a>
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        <span className="font-medium text-gray-200 light-theme:text-gray-800">Connected to Notion</span>
                                    </div>
                                    <p className="text-sm text-gray-400 light-theme:text-gray-600 mt-1">
                                        {settings.notion.workspaceName || 'Workspace Connected'}
                                    </p>
                                    {settings.notion.lastSync && (
                                        <p className="text-xs text-gray-500 light-theme:text-gray-500 mt-1">
                                            Last sync: {new Date(settings.notion.lastSync).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        if (confirm('Disconnect from Notion? You can reconnect anytime.')) {
                                            onSettingsChange(prev => ({
                                                ...prev,
                                                notion: {
                                                    enabled: false,
                                                    accessToken: undefined,
                                                    workspaceId: undefined,
                                                    workspaceName: undefined,
                                                    databaseId: undefined,
                                                    lastSync: undefined,
                                                }
                                            }));
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-md text-sm transition-colors"
                                >
                                    Disconnect
                                </button>
                            </div>
                            
                            {settings.notion.databaseId && (
                                <div className="pt-3 border-t border-gray-600 light-theme:border-gray-300">
                                    <label className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">
                                        Default Database
                                    </label>
                                    <p className="text-sm text-gray-300 light-theme:text-gray-700">
                                        Exports will be sent to the configured database
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Session Reset Section */}
            <div>
                <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
                <div className="bg-red-900/20 p-4 rounded-lg border border-red-500/30 flex items-center justify-between">
                    <div>
                        <h4 className="font-semibold text-gray-200">Reset Session</h4>
                        <p className="text-sm text-red-300/80">This will clear all data and start a new session. This action cannot be undone.</p>
                    </div>
                    <button 
                        onClick={() => {
                            if (isConfirmingReset) {
                                onReset();
                                onClose();
                            } else {
                                setIsConfirmingReset(true);
                                setTimeout(() => setIsConfirmingReset(false), 3000);
                            }
                        }}
                        className={`px-4 py-2 text-sm font-semibold text-white rounded-md transition-colors ${isConfirmingReset ? 'bg-red-700 hover:bg-red-800' : 'bg-red-600 hover:bg-red-700'}`}
                    >
                        {isConfirmingReset ? 'Confirm Reset?' : 'Reset Now'}
                    </button>
                </div>
            </div>

            {/* Developer / Testing Utilities */}
            <div>
                <h3 className="text-lg font-semibold text-cyan-400 mb-2">Testing &amp; Previews</h3>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 flex items-center justify-between">
                    <div>
                        <h4 className="font-semibold text-gray-200">Hosting Cost Reminder Popup</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Preview the 15-minute periodic reminder popup and test payment/Zelle links.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            if (onTriggerHostCostReminder) {
                                onTriggerHostCostReminder();
                            }
                        }}
                        className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-md transition-colors whitespace-nowrap shadow-md"
                    >
                        Preview Popup
                    </button>
                </div>
            </div>
            
            {/* Scroll Indicator */}
            {showScrollIndicator && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 animate-bounce opacity-60 pointer-events-none">
                <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
