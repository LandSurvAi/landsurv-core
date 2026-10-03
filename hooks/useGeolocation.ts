import { useEffect } from 'react';

/**
 * Custom hook for managing device geolocation tracking.
 * Essential for the GPS Stakeout agent.
 * Only requests geolocation permission when needed (when agent is active).
 * Continuously watches the user's position and handles errors.
 * 
 * @param setCurrentPosition - Function to update the current geolocation position
 * @param setGeolocationError - Function to update geolocation error messages
 * @param isEnabled - Whether geolocation tracking should be active (default: false to not request on page load)
 */
export function useGeolocation(
  setCurrentPosition: (position: GeolocationPosition) => void,
  setGeolocationError: (error: string | null) => void,
  isEnabled: boolean = false
) {
  useEffect(() => {
    // Don't request geolocation on page load - only when explicitly enabled
    if (!isEnabled) {
      return;
    }

    if (!navigator.geolocation) {
      setGeolocationError("Geolocation is not supported by this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeolocationError(null);
        setCurrentPosition(pos);
      },
      (err: GeolocationPositionError) => {
        let errorMessage: string;
        // Use numeric error codes for GeolocationPositionError.
        // 1: PERMISSION_DENIED, 2: POSITION_UNAVAILABLE, 3: TIMEOUT
        switch (err.code) {
          case 1:
            errorMessage = "Geolocation permission denied. Please enable location services in your browser settings.";
            break;
          case 2:
            errorMessage = "Geolocation error: Location information is currently unavailable.";
            break;
          case 3:
            errorMessage = "Geolocation error: The request to get user location timed out.";
            break;
          default:
            // Defensively handle the message to prevent "[object Object]" errors.
            const message = (err && typeof err.message === 'string') ? err.message : 'An unknown error occurred.';
            errorMessage = `Geolocation error: ${message}`;
            break;
        }
        setGeolocationError(errorMessage);
        console.error("Geolocation error:", err);
      },
      { 
        enableHighAccuracy: true, 
        maximumAge: 0 
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [setCurrentPosition, setGeolocationError, isEnabled]);
}
