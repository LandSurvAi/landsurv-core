import { useEffect } from 'react';

/**
 * Custom hook for managing a timer that tracks AI "thinking" time.
 * 
 * @param isLoading - Whether the AI is currently processing
 * @param thinkingTime - Current thinking time in milliseconds
 * @param setThinkingTime - Function to update thinking time
 * @param interval - Update interval in milliseconds (default: 100ms)
 * 
 * @example
 * ```tsx
 * const [thinkingTime, setThinkingTime] = useState(0);
 * useThinkingTimer(isLoading, thinkingTime, setThinkingTime);
 * ```
 */
export function useThinkingTimer(
  isLoading: boolean,
  setThinkingTime: (value: number | ((prev: number) => number)) => void,
  interval: number = 100
): void {
  useEffect(() => {
    let timerRef: number | null = null;

    if (isLoading) {
      setThinkingTime(0);
      timerRef = window.setInterval(() => {
        setThinkingTime(prevTime => prevTime + interval);
      }, interval);
    }

    return () => {
      if (timerRef !== null) {
        clearInterval(timerRef);
      }
    };
  }, [isLoading, setThinkingTime, interval]);
}
