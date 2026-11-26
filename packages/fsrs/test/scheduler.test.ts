import { describe, it, expect } from 'vitest';
import { fsrs, createEmptyCard, default_w, type Grade } from 'ts-fsrs';
import {
  Scheduler,
  Rating,
  State,
  newCard,
  DEFAULT_W,
  retrievability,
  cardRetrievability,
  formatInterval,
  type Card,
} from '../src';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const DAY = 86_400_000;
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('constants', () => {
  it('uses the FSRS-5 default weights', () => {
    expect([...DEFAULT_W]).toEqual([...default_w]);
  });
});

describe('memory model', () => {
  const s = new Scheduler();
  it('forgetting curve: R = 0.9 when t = S', () => {
    near(retrievability(10, 10), 0.9);
    near(retrievability(0, 5), 1);
  });
  it('initial stability and difficulty', () => {
    expect(s.initStability(Rating.Again)).toBe(0.40255);
    expect(s.initStability(Rating.Easy)).toBe(15.69105);
    near(s.initDifficulty(Rating.Again), 7.1949);
    near(s.initDifficulty(Rating.Good), 7.1949 - Math.exp(2 * 0.5345) + 1, 1e-7);
  });
  it('interval equals stability at 90% retention', () => {
    expect(s.nextInterval(10)).toBe(10);
    expect(s.nextInterval(0.1)).toBe(1);
    expect(new Scheduler({ maximumInterval: 30 }).nextInterval(1000)).toBe(30);
  });
  it('retention target moves intervals the right way', () => {
    expect(new Scheduler({ requestRetention: 0.95 }).nextInterval(100)).toBeLessThan(100);
    expect(new Scheduler({ requestRetention: 0.8 }).nextInterval(100)).toBeGreaterThan(100);
  });
  it('difficulty stays in [1, 10]', () => {
    let d = s.initDifficulty(Rating.Again);
    for (let i = 0; i < 100; i++) d = s.nextDifficulty(d, Rating.Again);
    expect(d).toBeLessThanOrEqual(10);
    for (let i = 0; i < 100; i++) d = s.nextDifficulty(d, Rating.Easy);
    expect(d).toBeGreaterThanOrEqual(1);
  });
  it('recall grows stability by grade; lapse shrinks it', () => {
    const sv = 10, d = 5, r = 0.9;
    const good = s.nextRecallStability(d, sv, r, Rating.Good);
    expect(good).toBeGreaterThan(sv);
    expect(s.nextRecallStability(d, sv, r, Rating.Easy)).toBeGreaterThan(good);
    expect(s.nextRecallStability(d, sv, r, Rating.Hard)).toBeLessThan(good);
    expect(s.nextForgetStability(d, sv, r)).toBeLessThan(sv);
  });
});

describe('state machine', () => {
  const s = new Scheduler();
  it('new -> Easy graduates straight to review', () => {
    const c = s.review(newCard(T0), Rating.Easy, T0);
    expect(c.state).toBe(State.Review);
    expect(c.scheduledDays).toBe(16);
    expect(c.due).toBe(T0 + 16 * DAY);
    expect(c.reps).toBe(1);
  });
  it('new -> Again/Hard/Good use 1/5/10 minute steps', () => {
    for (const [r, m] of [[Rating.Again, 1], [Rating.Hard, 5], [Rating.Good, 10]] as const) {
      const c = s.review(newCard(T0), r, T0);
      expect(c.state).toBe(State.Learning);
      expect(c.due).toBe(T0 + m * 60_000);
    }
  });
  it('learning -> Good graduates to review', () => {
    let c = s.review(newCard(T0), Rating.Good, T0);
    c = s.review(c, Rating.Good, c.due);
    expect(c.state).toBe(State.Review);
    expect(c.scheduledDays).toBeGreaterThanOrEqual(1);
  });
  it('lapse moves a review card to relearning and counts it', () => {
    let c = s.review(newCard(T0), Rating.Easy, T0);
    c = s.review(c, Rating.Again, c.due);
    expect(c.state).toBe(State.Relearning);
    expect(c.lapses).toBe(1);
    expect(c.stability).toBeLessThan(15.7);
    c = s.review(c, Rating.Good, c.due);
    expect(c.state).toBe(State.Review);
  });
  it('Hard < Good < Easy intervals across a long history', () => {
    let c = s.review(newCard(T0), Rating.Easy, T0);
    for (let i = 0; i < 8; i++) {
      const p = s.preview(c, c.due);
      expect(p[Rating.Hard].scheduledDays).toBeLessThan(p[Rating.Good].scheduledDays);
      expect(p[Rating.Good].scheduledDays).toBeLessThan(p[Rating.Easy].scheduledDays);
      c = p[Rating.Good];
    }
  });
  it('does not mutate its input', () => {
    const c = newCard(T0);
    const copy = { ...c };
    s.review(c, Rating.Good, T0);
    expect(c).toEqual(copy);
  });
  it('early review grows stability less than on-time review', () => {
    const c = s.review(newCard(T0), Rating.Easy, T0);
    const early = s.review(c, Rating.Good, T0 + 2 * DAY);
    const onTime = s.review(c, Rating.Good, c.due);
    expect(early.stability).toBeLessThan(onTime.stability);
  });
  it('rejects bad parameters', () => {
    expect(() => new Scheduler({ w: [1, 2, 3] })).toThrow();
    expect(() => new Scheduler({ requestRetention: 0 })).toThrow();
  });
  it('cardRetrievability decays with time', () => {
    const c = s.review(newCard(T0), Rating.Easy, T0);
    expect(cardRetrievability(newCard(T0), T0)).toBe(0);
    near(cardRetrievability(c, T0), 1);
    expect(cardRetrievability(c, T0 + 30 * DAY)).toBeLessThan(cardRetrievability(c, T0 + DAY));
  });
});

describe('formatInterval', () => {
  it('formats units', () => {
    expect(formatInterval(30_000)).toBe('<1m');
    expect(formatInterval(10 * 60_000)).toBe('10m');
    expect(formatInterval(3 * 3_600_000)).toBe('3h');
    expect(formatInterval(5 * DAY)).toBe('5d');
    expect(formatInterval(45 * DAY)).toBe('1.5mo');
    expect(formatInterval(730 * DAY)).toBe('2y');
  });
});

/** Cross-check against the independent ts-fsrs implementation (FSRS-5, v4.7.1). */
describe('matches ts-fsrs oracle', () => {
  const ref = fsrs({ enable_fuzz: false });
  const mine = new Scheduler();
  const grades = [Rating.Good, Rating.Good, Rating.Hard, Rating.Again, Rating.Good, Rating.Easy,
    Rating.Good, Rating.Again, Rating.Again, Rating.Hard, Rating.Easy, Rating.Good, Rating.Good];

  function simulate(seq: Rating[], jitterDays: number[]) {
    let rc = createEmptyCard(new Date(T0));
    let mc: Card = newCard(T0);
    let now = T0;
    seq.forEach((g, i) => {
      rc = ref.next(rc, new Date(now), g as unknown as Grade).card;
      mc = mine.review(mc, g, now);
      expect(mc.state, `step ${i} state`).toBe(rc.state as unknown as State);
      near(mc.stability, rc.stability);
      near(mc.difficulty, rc.difficulty);
      expect(mc.due, `step ${i} due`).toBe(rc.due.getTime());
      expect(mc.reps).toBe(rc.reps);
      expect(mc.lapses).toBe(rc.lapses);
      now = mc.due + (mc.state === State.Review ? jitterDays[i % jitterDays.length] * DAY : 0);
    });
  }

  it('on-time review sequence', () => simulate(grades, [0]));
  it('late/early review sequence', () => simulate(grades, [3, -1, 7, 0, 2]));
  it('all-Easy and all-Again sequences', () => {
    simulate(Array(10).fill(Rating.Easy), [0]);
    simulate(Array(10).fill(Rating.Again), [0]);
  });
  it('random sequences', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let n = 0; n < 25; n++) {
      const seq = Array.from({ length: 20 }, () => (1 + Math.floor(rnd() * 4)) as Rating);
      simulate(seq, [0, 1, 4, -1, 10]);
    }
  });
});
