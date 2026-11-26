import { State } from '@spaced/fsrs';

export interface QueueCard {
  id: number;
  state: State;
  due: number;
}

export interface Limits {
  newPerDay: number;
  reviewsPerDay: number;
}

export interface DoneToday {
  newDone: number;
  reviewsDone: number;
}

export const DEFAULT_LIMITS: Limits = { newPerDay: 20, reviewsPerDay: 200 };

/** Start (ms) of the local study day; the day rolls over at `rolloverHour` (default 4am). */
export function studyDayStart(now: number, rolloverHour = 4): number {
  const d = new Date(now);
  d.setHours(rolloverHour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function studyDayKey(ts: number, rolloverHour = 4): string {
  const d = new Date(studyDayStart(ts, rolloverHour));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DueCounts {
  new: number;
  learning: number;
  review: number;
  total: number;
}

/**
 * Cards to study right now. Learning/relearning cards due now always show (they are
 * mid-session); due reviews and new cards are capped by what remains of today's limits.
 * Order: learning first (earliest due), then reviews (earliest due), then new.
 */
export function buildQueue(cards: QueueCard[], now: number, limits: Limits, done: DoneToday): number[] {
  const learning = cards
    .filter((c) => (c.state === State.Learning || c.state === State.Relearning) && c.due <= now)
    .sort((a, b) => a.due - b.due);
  const reviews = cards
    .filter((c) => c.state === State.Review && c.due <= endOfStudyDay(now))
    .sort((a, b) => a.due - b.due)
    .slice(0, Math.max(0, limits.reviewsPerDay - done.reviewsDone));
  const fresh = cards
    .filter((c) => c.state === State.New)
    .slice(0, Math.max(0, limits.newPerDay - done.newDone));
  return [...learning, ...reviews, ...fresh].map((c) => c.id);
}

function endOfStudyDay(now: number): number {
  return studyDayStart(now) + 86_400_000 - 1;
}

export function dueCounts(cards: QueueCard[], now: number, limits: Limits, done: DoneToday): DueCounts {
  let learning = 0, review = 0, fresh = 0;
  for (const c of cards) {
    if ((c.state === State.Learning || c.state === State.Relearning) && c.due <= now) learning++;
    else if (c.state === State.Review && c.due <= endOfStudyDay(now)) review++;
    else if (c.state === State.New) fresh++;
  }
  review = Math.min(review, Math.max(0, limits.reviewsPerDay - done.reviewsDone));
  fresh = Math.min(fresh, Math.max(0, limits.newPerDay - done.newDone));
  return { new: fresh, learning, review, total: fresh + learning + review };
}
