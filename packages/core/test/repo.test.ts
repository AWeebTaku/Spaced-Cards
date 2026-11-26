import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { Rating, State } from '@spaced/fsrs';
import { MemoryRepo, SqlRepo, StudyService, importCsv, type Repo, type SqlDb } from '../src';

/** node:sqlite adapter so the real SQL runs in tests. */
function nodeDb(db = new DatabaseSync(':memory:')): SqlDb {
  return {
    async exec(sql) { db.exec(sql); },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async all(sql, params = []) { return db.prepare(sql).all(...params) as never; },
    async transaction(fn) {
      db.exec('BEGIN');
      try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const T0 = new Date(2026, 5, 10, 10, 0).getTime();
const DAY = 86_400_000;

const makers: [string, () => Promise<Repo>][] = [
  ['MemoryRepo', async () => new MemoryRepo()],
  ['SqlRepo (node:sqlite)', async () => { const r = new SqlRepo(nodeDb()); await r.init(); return r; }],
];

describe.each(makers)('%s contract', (_name, make) => {
  let repo: Repo;
  let svc: StudyService;
  let deckId: number;
  beforeEach(async () => {
    repo = await make();
    svc = new StudyService(repo);
    deckId = (await repo.addDeck('Spanish', T0)).id;
    await repo.addCards(deckId, [
      { front: 'hola', back: 'hello', tags: ['es'] },
      { front: 'adios', back: 'bye', tags: [] },
      { front: 'gracias', back: 'thanks', tags: ['es', 'polite'] },
    ], T0);
  });

  it('stores decks and cards', async () => {
    const cards = await repo.listCards(deckId);
    expect(cards.map((c) => c.front)).toEqual(['hola', 'adios', 'gracias']);
    expect(cards[2].tags).toEqual(['es', 'polite']);
    expect(cards.every((c) => c.state === State.New)).toBe(true);
    await expect(repo.addDeck('Spanish', T0)).rejects.toThrow();
  });

  it('edits and deletes cards; deleting a deck cascades', async () => {
    const [a] = await repo.listCards();
    await repo.updateCardContent(a.id, 'HOLA', 'hi', ['x']);
    expect(await repo.getCard(a.id)).toMatchObject({ front: 'HOLA', back: 'hi', tags: ['x'] });
    await repo.deleteCard(a.id);
    expect(await repo.getCard(a.id)).toBeNull();
    await repo.deleteDeck(deckId);
    expect(await repo.listCards()).toEqual([]);
  });

  it('rate -> persists schedule and log; undo restores exactly', async () => {
    const [c] = await repo.listCards();
    const before = await repo.getCard(c.id);
    const next = await svc.rate(c.id, Rating.Good, T0);
    expect(next.state).toBe(State.Learning);
    expect(await repo.getCard(c.id)).toMatchObject({ state: State.Learning, reps: 1 });
    expect(await repo.listReviewLog()).toHaveLength(1);
    expect(await svc.undo()).toBe(c.id);
    expect(await repo.getCard(c.id)).toEqual(before);
    expect(await repo.listReviewLog()).toHaveLength(0);
    expect(await svc.undo()).toBeNull();
  });

  it('a failed review write leaves nothing behind', async () => {
    const [c] = await repo.listCards();
    await expect(repo.applyReview(99999, { ...c }, { cardId: 99999, rating: Rating.Good, stateBefore: State.New, reviewedAt: T0, prev: c })).rejects.toThrow();
    expect(await repo.listReviewLog()).toHaveLength(0);
  });

  it('daily new-card limit counts reviews done today, and undo gives the slot back', async () => {
    await repo.setSettings({ newPerDay: 2 });
    expect(await svc.queue(T0)).toHaveLength(2);
    const [first] = await svc.queue(T0);
    await svc.rate(first, Rating.Easy, T0);
    expect((await svc.counts(T0)).new).toBe(1);
    await svc.undo();
    expect((await svc.counts(T0)).new).toBe(2);
  });

  it('full day cycle: review due next day, with preview labels', async () => {
    const [c] = await repo.listCards();
    const card = (await repo.getCard(c.id))!;
    const labels = (await svc.previews(card, T0)).map((p) => p.label);
    expect(labels).toEqual(['1m', '5m', '10m', '16d']);
    await svc.rate(c.id, Rating.Easy, T0);
    expect((await svc.queue(T0 + DAY)).includes(c.id)).toBe(false);
    expect((await svc.queue(T0 + 17 * DAY)).includes(c.id)).toBe(true);
  });

  it('settings round-trip', async () => {
    expect(await repo.getSettings()).toMatchObject({ newPerDay: 20, reviewsPerDay: 200, requestRetention: 0.9 });
    await repo.setSettings({ requestRetention: 0.85, newPerDay: 5 });
    expect(await repo.getSettings()).toMatchObject({ newPerDay: 5, requestRetention: 0.85 });
  });

  it('stats, import and export', async () => {
    const [c] = await repo.listCards();
    await svc.rate(c.id, Rating.Good, T0);
    const st = await svc.stats(T0, 3);
    expect(st).toMatchObject({ totalReviews: 1, totalCards: 3, streak: 1 });
    const d2 = await svc.ensureDeck('French', T0);
    expect((await svc.ensureDeck('French', T0)).id).toBe(d2.id);
    const rep = importCsv('front,back\nbonjour,hello\n,x');
    expect(await svc.importInto(d2.id, rep, T0)).toBe(1);
    const csv = await svc.exportAsCsv();
    expect(csv).toContain('French,bonjour,hello');
    const json = JSON.parse(await svc.exportAsJson());
    expect(json.cards).toHaveLength(4);
    expect(json.reviewLog).toHaveLength(1);
  });
});
