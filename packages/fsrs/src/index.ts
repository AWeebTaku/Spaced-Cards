/**
 * FSRS-5 spaced-repetition scheduler (pure TypeScript, no dependencies).
 *
 * Memory model:
 *   R(t, S) = (1 + FACTOR * t / S) ^ DECAY      (retrievability)
 *   interval = S / FACTOR * (r^(1/DECAY) - 1)   (days until R drops to r)
 * Short-term learning steps are 1m/5m/10m like the reference implementation;
 * fuzzing is omitted so scheduling is deterministic.
 */

export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export enum State {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

export interface Card {
  state: State;
  /** Next due time (ms since epoch). */
  due: number;
  /** Memory stability in days (0 for New). */
  stability: number;
  /** Difficulty 1..10 (0 for New). */
  difficulty: number;
  /** Time of last review (ms since epoch), null for New. */
  lastReview: number | null;
  reps: number;
  lapses: number;
  /** Interval assigned by the last review, in days (0 for same-day steps). */
  scheduledDays: number;
}

export interface Params {
  /** 19 FSRS-5 weights. */
  w: readonly number[];
  requestRetention: number;
  maximumInterval: number;
}

export const DEFAULT_W: readonly number[] = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]);

export const DEFAULT_PARAMS: Params = Object.freeze({
  w: DEFAULT_W,
  requestRetention: 0.9,
  maximumInterval: 36500,
});

export const DECAY = -0.5;
export const FACTOR = 19 / 81;
const S_MIN = 0.01;
const S_MAX = 36500;
const MINUTE = 60_000;
const DAY = 86_400_000;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const round8 = (v: number) => +v.toFixed(8);

export function newCard(now: number): Card {
  return {
    state: State.New,
    due: now,
    stability: 0,
    difficulty: 0,
    lastReview: null,
    reps: 0,
    lapses: 0,
    scheduledDays: 0,
  };
}

/** Probability of recall after `elapsedDays` for a memory with `stability`. */
export function retrievability(elapsedDays: number, stability: number): number {
  return round8(Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY));
}

/** Current recall probability of a card at time `now` (0 for New cards). */
export function cardRetrievability(card: Card, now: number): number {
  if (card.state === State.New || card.lastReview === null) return 0;
  const elapsed = Math.max(0, (now - card.lastReview) / DAY);
  return retrievability(elapsed, card.stability);
}

/** Whole calendar days (UTC) from `a` to `b`. */
export function dateDiffInDays(a: number, b: number): number {
  const da = new Date(a);
  const db = new Date(b);
  const ua = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate());
  const ub = Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate());
  return Math.floor((ub - ua) / DAY);
}

export class Scheduler {
  readonly params: Params;
  private readonly intervalModifier: number;

  constructor(params: Partial<Params> = {}) {
    const p = { ...DEFAULT_PARAMS, ...params };
    if (p.w.length !== 19) throw new Error(`Expected 19 FSRS-5 weights, got ${p.w.length}`);
    if (!(p.requestRetention > 0 && p.requestRetention <= 1)) {
      throw new Error('requestRetention must be in (0, 1]');
    }
    this.params = p;
    this.intervalModifier = round8((Math.pow(p.requestRetention, 1 / DECAY) - 1) / FACTOR);
  }

  initStability(g: Rating): number {
    return Math.max(this.params.w[g - 1], 0.1);
  }

  initDifficulty(g: Rating): number {
    const w = this.params.w;
    return this.constrainDifficulty(w[4] - Math.exp((g - 1) * w[5]) + 1);
  }

  private constrainDifficulty(d: number): number {
    return Math.min(Math.max(round8(d), 1), 10);
  }

  nextDifficulty(d: number, g: Rating): number {
    const w = this.params.w;
    const delta = -w[6] * (g - 3);
    const damped = d + round8((delta * (10 - d)) / 9);
    const reverted = round8(w[7] * this.initDifficulty(Rating.Easy) + (1 - w[7]) * damped);
    return this.constrainDifficulty(reverted);
  }

  nextRecallStability(d: number, s: number, r: number, g: Rating): number {
    const w = this.params.w;
    const hard = g === Rating.Hard ? w[15] : 1;
    const easy = g === Rating.Easy ? w[16] : 1;
    return round8(
      clamp(
        s *
          (1 +
            Math.exp(w[8]) *
              (11 - d) *
              Math.pow(s, -w[9]) *
              (Math.exp((1 - r) * w[10]) - 1) *
              hard *
              easy),
        S_MIN,
        S_MAX,
      ),
    );
  }

  nextForgetStability(d: number, s: number, r: number): number {
    const w = this.params.w;
    return round8(
      clamp(
        w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]),
        S_MIN,
        S_MAX,
      ),
    );
  }

  nextShortTermStability(s: number, g: Rating): number {
    const w = this.params.w;
    return round8(clamp(s * Math.exp(w[17] * (g - 3 + w[18])), S_MIN, S_MAX));
  }

  /** Whole-day interval for a given stability at the requested retention. */
  nextInterval(stability: number): number {
    const days = Math.round(stability * this.intervalModifier);
    return Math.min(Math.max(1, days), this.params.maximumInterval);
  }

  /** Schedule the card for one rating. Pure: returns a new card. */
  review(card: Card, rating: Rating, now: number): Card {
    const next: Card = { ...card, lastReview: now, reps: card.reps + 1 };
    const elapsed =
      card.state !== State.New && card.lastReview !== null
        ? dateDiffInDays(card.lastReview, now)
        : 0;

    switch (card.state) {
      case State.New:
        this.reviewNew(next, rating, now);
        break;
      case State.Learning:
      case State.Relearning:
        this.reviewLearning(card, next, rating, now);
        break;
      case State.Review:
        this.reviewReview(card, next, rating, now, elapsed);
        break;
    }
    return next;
  }

  /** All four possible outcomes, for showing "next interval" under each button. */
  preview(card: Card, now: number): Record<Rating, Card> {
    return {
      [Rating.Again]: this.review(card, Rating.Again, now),
      [Rating.Hard]: this.review(card, Rating.Hard, now),
      [Rating.Good]: this.review(card, Rating.Good, now),
      [Rating.Easy]: this.review(card, Rating.Easy, now),
    };
  }

  private setDays(c: Card, days: number, now: number) {
    c.scheduledDays = days;
    c.due = now + days * DAY;
  }

  private setMinutes(c: Card, minutes: number, now: number) {
    c.scheduledDays = 0;
    c.due = now + minutes * MINUTE;
  }

  private reviewNew(next: Card, g: Rating, now: number) {
    next.difficulty = this.initDifficulty(g);
    next.stability = this.initStability(g);
    if (g === Rating.Easy) {
      next.state = State.Review;
      this.setDays(next, this.nextInterval(next.stability), now);
    } else {
      next.state = State.Learning;
      this.setMinutes(next, g === Rating.Again ? 1 : g === Rating.Hard ? 5 : 10, now);
    }
  }

  private reviewLearning(prev: Card, next: Card, g: Rating, now: number) {
    next.difficulty = this.nextDifficulty(prev.difficulty, g);
    next.stability = this.nextShortTermStability(prev.stability, g);
    switch (g) {
      case Rating.Again:
        this.setMinutes(next, 5, now);
        break;
      case Rating.Hard:
        this.setMinutes(next, 10, now);
        break;
      case Rating.Good:
        next.state = State.Review;
        this.setDays(next, this.nextInterval(next.stability), now);
        break;
      case Rating.Easy: {
        const goodS = this.nextShortTermStability(prev.stability, Rating.Good);
        const goodI = this.nextInterval(goodS);
        next.state = State.Review;
        this.setDays(next, Math.max(this.nextInterval(next.stability), goodI + 1), now);
        break;
      }
    }
  }

  private reviewReview(prev: Card, next: Card, g: Rating, now: number, elapsed: number) {
    const { difficulty: d, stability: s } = prev;
    const r = retrievability(elapsed, s);
    const w = this.params.w;

    const forgetS = this.nextForgetStability(d, s, r);
    const againS = clamp(round8(s / Math.exp(w[17] * w[18])), S_MIN, forgetS);
    const stabilityFor = (rating: Rating) =>
      rating === Rating.Again ? againS : this.nextRecallStability(d, s, r, rating);

    next.difficulty = this.nextDifficulty(d, g);
    next.stability = stabilityFor(g);

    if (g === Rating.Again) {
      next.state = State.Relearning;
      next.lapses = prev.lapses + 1;
      this.setMinutes(next, 5, now);
      return;
    }

    // Keep Hard < Good < Easy strictly increasing, as in the reference scheduler.
    const hardI0 = this.nextInterval(stabilityFor(Rating.Hard));
    const goodI0 = this.nextInterval(stabilityFor(Rating.Good));
    const hardI = Math.min(hardI0, goodI0);
    const goodI = Math.max(goodI0, hardI + 1);
    const easyI = Math.max(this.nextInterval(stabilityFor(Rating.Easy)), goodI + 1);

    next.state = State.Review;
    this.setDays(next, g === Rating.Hard ? hardI : g === Rating.Good ? goodI : easyI, now);
  }
}

/** Human readable interval, e.g. "10m", "3d", "2.1mo". */
export function formatInterval(ms: number): string {
  const minutes = ms / MINUTE;
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1).replace(/\.0$/, '')}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
}
