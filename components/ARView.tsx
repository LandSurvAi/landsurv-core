import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMirrorError } from '../hooks/useMirrorError';
import { SurveyPoint } from '../types.ts';
import ARSession, { detectDeviceCapabilities, type DeviceCapabilities } from '../services/xrSessionService.ts';
import ARPointRenderer from './ARPointRenderer';
import ARPointMenu from './ARPointMenu';
import { GeolocationService } from '../services/geolocationService.ts';
import { GoogleMaps3DService } from '../services/googleMaps3DService.ts';
import { googleGlassService } from '../services/googleGlassService.ts';
import { glassCacpGateway } from '../services/glassCacpGateway.ts';
import { X } from 'lucide-react';
import { useDocumentScrollLock } from '../hooks/useDocumentScrollLock.ts';

interface ARViewProps {
  isActive: boolean;
  points: SurveyPoint[];
  selectedPoint?: SurveyPoint | null;
  onPointSelected: (point: SurveyPoint | null) => void;
  onMenuAction: (action: string, point: SurveyPoint) => void;
  onClose: () => void;
}

const ARView: React.FC<ARViewProps> = ({
  isActive,
  points,
  selectedPoint,
  onPointSelected,
  onMenuAction,
  onClose,
}) => {
  useDocumentScrollLock(isActive);

  console.log('ARView rendering. isActive:', isActive);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arSessionRef = useRef<ARSession | null>(null);
  const pointRendererRef = useRef<ARPointRenderer | null>(null);
  const geolocationRef = useRef<GeolocationService | null>(null);
  const mapsServiceRef = useRef<GoogleMaps3DService | null>(null);
  const sessionModeRef = useRef<'immersive-ar' | 'immersive-vr'>('immersive-ar');
  const hasDispatchedSessionIntentRef = useRef(false);
  const [isXRSupported, setIsXRSupported] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'AR View', kind: 'arview-error' });
  const [loadingMessage, setLoadingMessage] = useState('Initializing AR...');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities | null>(null);

  // Check WebXR support on mount
  useEffect(() => {
    const checkXRSupport = async () => {
      try {
        if (!navigator.xr) {
          setError('WebXR not supported on this device');
          setIsXRSupported(false);
          return;
        }

        // Detect device capabilities first
        const capabilities = await detectDeviceCapabilities();
        setDeviceCapabilities(capabilities);

        // Check for immersive AR support
        let supported = capabilities.supportsImmersiveAR;
        
        // For Oculus/Meta devices, also check VR support as a fallback
        if (!supported && (capabilities.isOculusDevice || capabilities.isMetaDevice)) {
          supported = capabilities.supportsImmersiveVR;
          if (supported) {
            console.log('Using VR mode on Oculus device for immersive experience');
            sessionModeRef.current = 'immersive-vr';
          }
        } else {
            sessionModeRef.current = 'immersive-ar';
        }

        setIsXRSupported(supported);

        if (!supported) {
          let errorMsg = 'Immersive AR not supported on this device';
          if (capabilities.isOculusDevice) {
            errorMsg = `Immersive AR not supported on ${capabilities.deviceModel || 'this Oculus device'}. Please ensure you have the latest firmware.`;
          }
          setError(errorMsg);
        } else if (capabilities.isOculusDevice) {
          console.log(`✓ AR support detected on ${capabilities.deviceModel || 'Oculus device'}`);
        }
      } catch (err) {
        console.error('Error checking WebXR support:', err);
        setError('Failed to check WebXR support');
        setIsXRSupported(false);
      }
    };

    checkXRSupport();
  }, []);

  // Initialize AR session when view becomes active
  useEffect(() => {
    if (!isActive || !isXRSupported || !canvasRef.current) {
      return;
    }

    const initializeAR = async () => {
      try {
        setLoadingMessage('Requesting AR session...');

        // Create AR session
        arSessionRef.current = new ARSession(canvasRef.current!);
        await arSessionRef.current.initialize(sessionModeRef.current);

        setLoadingMessage('Initializing Glass bridge...');
        await googleGlassService.connect('glass://local-ar-session');

        setLoadingMessage('Initializing location services...');

        // Get Google Maps API key from localStorage
        const googleMapsApiKey = localStorage.getItem('googleMapsApiKey') || '';
        
        // Initialize geolocation service
        geolocationRef.current = new GeolocationService(googleMapsApiKey, true);
        
        try {
            await geolocationRef.current.startTracking();
            
            // Get current location
            const location = await geolocationRef.current.getCurrentLocation();
            if (location) {
              setUserLocation({ lat: location.latitude, lon: location.longitude });
              setAccuracy(location.accuracy);
            }
        } catch (geoError) {
            console.warn("Geolocation failed or not available:", geoError);
            // Continue without location - AR will use local coordinate system
        }

        // Initialize 3D maps service
        if (googleMapsApiKey) {
          mapsServiceRef.current = new GoogleMaps3DService(
            arSessionRef.current.getScene(),
            googleMapsApiKey
          );
        }

        setLoadingMessage('Initializing scene...');

        // Create point renderer with location context
        pointRendererRef.current = new ARPointRenderer(arSessionRef.current, geolocationRef.current, userLocation);
        await pointRendererRef.current.initialize(points);

        // Set up point selection callback
        if (pointRendererRef.current) {
          pointRendererRef.current.onPointSelected = (point: SurveyPoint | null) => {
            onPointSelected(point);
          };
        }

        // Start render loop
        await arSessionRef.current.startRenderLoop((frame: XRFrame) => {
          if (pointRendererRef.current) {
            pointRendererRef.current.render(frame);
          }
        });

        // Log location context
        if (userLocation) {
          console.log(`AR initialized at: ${userLocation.lat.toFixed(6)}, ${userLocation.lon.toFixed(6)}, Accuracy: ${accuracy}m`);
        }

        setSessionActive(true);

        if (!hasDispatchedSessionIntentRef.current) {
          hasDispatchedSessionIntentRef.current = true;
          const inferredFeature = points.some(point => point.description?.toLowerCase().includes('tree')) ? 'tree' : 'structure';
          const sessionSummary = `AR session started with ${points.length} point${points.length === 1 ? '' : 's'}${userLocation ? ` near ${userLocation.lat.toFixed(5)}, ${userLocation.lon.toFixed(5)}` : ''}.`;
          void glassCacpGateway.captureIntent(sessionSummary, inferredFeature).catch((error) => {
            console.warn('[ARView] Failed to dispatch session CACP intent:', error);
          });
        }

        setError(null);
      } catch (err) {
        console.error('Error initializing AR session:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to initialize AR session. Please ensure you have a WebXR-compatible device.'
        );
        setSessionActive(false);
      }
    };

    initializeAR();

    // Cleanup on unmount or when view is deactivated
    return () => {
      const cleanup = async () => {
        if (pointRendererRef.current) {
          pointRendererRef.current.dispose();
          pointRendererRef.current = null;
        }

        if (mapsServiceRef.current) {
          mapsServiceRef.current.dispose();
          mapsServiceRef.current = null;
        }

        if (geolocationRef.current) {
          geolocationRef.current.stopTracking();
          geolocationRef.current = null;
        }

        googleGlassService.disconnect();

        if (arSessionRef.current) {
          await arSessionRef.current.end();
          arSessionRef.current = null;
        }

        setSessionActive(false);
      };

      hasDispatchedSessionIntentRef.current = false;
      cleanup();
    };
  }, [isActive, isXRSupported, points, onPointSelected, userLocation]);

  // Handle menu actions
  const handleMenuAction = useCallback(
    (action: string) => {
      if (selectedPoint) {
        onMenuAction(action, selectedPoint);
      }
    },
    [selectedPoint, onMenuAction]
  );

  // Handle close
  const handleClose = useCallback(() => {
    const cleanup = async () => {
      if (pointRendererRef.current) {
        pointRendererRef.current.dispose();
        pointRendererRef.current = null;
      }

      if (mapsServiceRef.current) {
        mapsServiceRef.current.dispose();
        mapsServiceRef.current = null;
      }

      if (geolocationRef.current) {
        geolocationRef.current.stopTracking();
        geolocationRef.current = null;
      }

      if (arSessionRef.current) {
        await arSessionRef.current.end();
        arSessionRef.current = null;
      }

      setSessionActive(false);
      onClose();
    };

    cleanup();
  }, [onClose]);

  if (!isActive) {
    return null;
  }

  if (!isXRSupported) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-95 flex flex-col items-center justify-center z-50">
        <div className="bg-red-900 border border-red-500 rounded-lg p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-red-100 mb-4">WebXR Not Supported</h2>
          <p className="text-red-200 mb-4">
            {error || 'Your device or browser does not support WebXR AR mode.'}
          </p>
          {deviceCapabilities && (
            <div className="mb-4 p-3 bg-red-950 rounded text-sm text-red-300">
              <p className="mb-1"><strong>Device Info:</strong></p>
              <p>{deviceCapabilities.deviceModel || 'Unknown Device'}</p>
              {deviceCapabilities.isOculusDevice && <p>✓ Oculus Device Detected</p>}
              {deviceCapabilities.isMetaDevice && <p>✓ Meta Device Detected</p>}
              <p className="mt-2 text-xs">AR: {deviceCapabilities.supportsImmersiveAR ? '✓' : '✗'} | VR: {deviceCapabilities.supportsImmersiveVR ? '✓' : '✗'}</p>
            </div>
          )}
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition"
          >
            Close
          </button>
          {(deviceCapabilities?.isOculusDevice || deviceCapabilities?.isMetaDevice) && (
            <button
                onClick={() => {
                    setIsXRSupported(true);
                    sessionModeRef.current = 'immersive-vr';
                    setError(null);
                }}
                className="mt-4 block w-full px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition"
            >
                Force Start (VR Mode)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-95 flex flex-col items-center justify-center z-50">
        <div className="bg-red-900 border border-red-500 rounded-lg p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-red-100 mb-4">AR Error</h2>
          <p className="text-red-200 mb-4">{error}</p>
          {deviceCapabilities && (
            <div className="mb-4 p-3 bg-red-950 rounded text-sm text-red-300">
              <p className="mb-1"><strong>Device Info:</strong></p>
              <p>{deviceCapabilities.deviceModel || 'Unknown Device'}</p>
              {deviceCapabilities.isOculusDevice && <p>✓ Oculus Device Detected</p>}
            </div>
          )}
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition"
          >
            Close
          </button>
          <button
            onClick={() => {
                setError(null);
                setSessionActive(false);
                // Trigger re-initialization
                const reInit = async () => {
                    if (arSessionRef.current) {
                        await arSessionRef.current.end();
                        arSessionRef.current = null;
                    }
                    // Force re-render to trigger effect
                    setSessionActive(false);
                };
                reInit();
            }}
            className="mt-4 block w-full px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 flex flex-col"
    >
      {/* Canvas for Babylon.js */}
      <canvas
        ref={canvasRef}
        className="gesture-capture w-full h-full"
        style={{
          display: sessionActive ? 'block' : 'none',
        }}
      />

      {/* Loading state */}
      {!sessionActive && (
        <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-4">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
              </div>
            </div>
            <p className="text-cyan-300 text-lg">{loadingMessage}</p>
          </div>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 bg-gray-900 bg-opacity-70 hover:bg-opacity-90 text-white p-2 rounded-lg transition z-10"
        title="Exit AR Mode"
      >
        <X size={24} />
      </button>

      {/* Point details and menu */}
      {sessionActive && selectedPoint && (
        <div className="absolute bottom-4 left-4 right-4">
          <ARPointMenu
            point={selectedPoint}
            onAction={handleMenuAction}
            onClose={() => onPointSelected(null)}
          />
        </div>
      )}

      {/* Info panel */}
      {sessionActive && !selectedPoint && (
        <div className="absolute bottom-4 left-4 bg-gray-900 bg-opacity-70 text-white p-4 rounded-lg max-w-xs">
          <p className="text-sm text-cyan-300 font-semibold mb-2">AR Mode Active</p>
          <p className="text-xs text-gray-300">
            {points.length} point{points.length !== 1 ? 's' : ''} loaded
          </p>
          {userLocation && (
            <p className="text-xs text-green-300 mt-2">
              📍 {userLocation.lat.toFixed(6)}, {userLocation.lon.toFixed(6)}
            </p>
          )}
          {accuracy && (
            <p className="text-xs text-gray-400">
              ±{accuracy.toFixed(0)}m accuracy
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Point at a marker and tap to select
          </p>
        </div>
      )}
    </div>
  );
};

export default ARView;
