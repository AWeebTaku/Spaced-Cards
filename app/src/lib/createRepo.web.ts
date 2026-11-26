import { MemoryRepo, type MemorySnapshot, type Repo } from '@spaced/core';

const KEY = 'spaced-cards:v1';

/** Web demo: same logic, persisted as JSON in localStorage. */
export async function createRepo(): Promise<Repo> {
  let snapshot: MemorySnapshot | undefined;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) snapshot = JSON.parse(raw) as MemorySnapshot;
  } catch {
    snapshot = undefined;
  }
  return new MemoryRepo(snapshot, (s) => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota: keep running in memory */ }
  });
}
