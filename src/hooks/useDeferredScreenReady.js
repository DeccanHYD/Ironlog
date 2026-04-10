import { useCallback, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function useDeferredScreenReady(options = {}) {
  const { minDelayMs = 0, resetOnBlur = true } = options;
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timeoutId = null;
      let frameId = null;

      setReady(false);

      const task = InteractionManager.runAfterInteractions(() => {
        const markReady = () => {
          frameId = requestAnimationFrame(() => {
            if (!cancelled) setReady(true);
          });
        };

        if (minDelayMs > 0) {
          timeoutId = setTimeout(markReady, minDelayMs);
        } else {
          markReady();
        }
      });

      return () => {
        cancelled = true;
        if (typeof task?.cancel === 'function') task.cancel();
        if (timeoutId) clearTimeout(timeoutId);
        if (frameId) cancelAnimationFrame(frameId);
        if (resetOnBlur) setReady(false);
      };
    }, [minDelayMs, resetOnBlur])
  );

  return ready;
}
