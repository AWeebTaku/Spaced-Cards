import { Rating, State } from '@spaced/fsrs';
import { studyDayKey } from './queue';

export interface ReviewLogEntry {
  reviewedAt: number;
  rating: Rating;
  /** Card state before this review. */
  stateBefore: State;
}

export interface DayStat {
  day: string;
  reviews: number;
}

/** Reviews per study day for the last `days` days (oldest first, zero-filled). */
export function reviewsPerDay(log: ReviewLogEntry[], now: number, days = 14): DayStat[] {
  const counts = new Map<string, number>();
  for (const e of log) {
    const k = studyDayKey(e.reviewedAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: DayStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = studyDayKey(now - i * 86_400_000);
    out.push({ day: k, reviews: counts.get(k) ?? 0 });
  }
  return out;
}

/**
 * True retention: share of mature-card (Review-state) reviews answered Hard/Good/Easy.
 * Returns null when there are no such reviews.
 */
export function retention(log: ReviewLogEntry[]): number | null {
  const rev = log.filter((e) => e.stateBefore === State.Review);
  if (rev.length === 0) return null;
  return rev.filter((e) => e.rating !== Rating.Again).length / rev.length;
}

/** Consecutive study days (ending today or yesterday) with at least one review. */
export function streak(log: ReviewLogEntry[], now: number): number {
  const days = new Set(log.map((e) => studyDayKey(e.reviewedAt)));
  let n = 0;
  let t = now;
  if (!days.has(studyDayKey(t))) t -= 86_400_000;
  while (days.has(studyDayKey(t))) { n++; t -= 86_400_000; }
  return n;
}
