import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** Run `fn` every time the screen gains focus; returns [data, reload]. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cb = useCallback(() => { let live = true; fn().then((d) => live && setData(d)); return () => { live = false; }; }, [tick, ...deps]);
  useFocusEffect(cb);
  return [data, () => setTick((t) => t + 1)];
}
