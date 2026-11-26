import { State, type Card, type Rating } from '@spaced/fsrs';
import type { Deck, Repo, ReviewLogRow, Settings, StoredCard } from './repo';
import { DEFAULT_SETTINGS } from './repo';
import type { ImportedCard } from './types';

/** Minimal async SQL surface. Implemented by expo-sqlite (app) and node:sqlite (tests). */
export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: (string | number | null)[]): Promise<{ lastInsertRowId: number; changes: number }>;
  all<T = Record<string, unknown>>(sql: string, params?: (string | number | null)[]): Promise<T[]>;
  /** Run fn inside a transaction; roll back if it throws. */
  transaction(fn: () => Promise<void>): Promise<void>;
}

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  state INTEGER NOT NULL DEFAULT 0,
  due INTEGER NOT NULL,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  last_review INTEGER,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  scheduled_days REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(state, due);
CREATE TABLE IF NOT EXISTS review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  state_before INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL,
  prev_card TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_time ON review_log(reviewed_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

interface CardRow {
  id: number; deck_id: number; front: string; back: string; tags: string; state: number;
  due: number; stability: number; difficulty: number; last_review: number | null;
  reps: number; lapses: number; scheduled_days: number; created_at: number;
}

const toCard = (r: CardRow): StoredCard => ({
  id: r.id, deckId: r.deck_id, front: r.front, back: r.back,
  tags: r.tags ? r.tags.split(' ').filter(Boolean) : [],
  state: r.state as State, due: r.due, stability: r.stability, difficulty: r.difficulty,
  lastReview: r.last_review, reps: r.reps, lapses: r.lapses, scheduledDays: r.scheduled_days,
  createdAt: r.created_at,
});

const SCHED_SET = 'state=?, due=?, stability=?, difficulty=?, last_review=?, reps=?, lapses=?, scheduled_days=?';
const schedParams = (c: Card) => [c.state, c.due, c.stability, c.difficulty, c.lastReview, c.reps, c.lapses, c.scheduledDays];

export class SqlRepo implements Repo {
  constructor(private db: SqlDb) {}

  async init() {
    await this.db.exec('PRAGMA foreign_keys = ON;');
    await this.db.exec('PRAGMA journal_mode = WAL;');
    await this.db.exec(SCHEMA);
    await this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  async listDecks() {
    const rows = await this.db.all<{ id: number; name: string; created_at: number }>('SELECT * FROM decks ORDER BY name COLLATE NOCASE');
    return rows.map((r): Deck => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }
  async addDeck(name: string, now: number) {
    const r = await this.db.run('INSERT INTO decks(name, created_at) VALUES (?, ?)', [name, now]);
    return { id: r.lastInsertRowId, name, createdAt: now };
  }
  async renameDeck(id: number, name: string) {
    await this.db.run('UPDATE decks SET name=? WHERE id=?', [name, id]);
  }
  async deleteDeck(id: number) {
    await this.db.run('DELETE FROM decks WHERE id=?', [id]); // cards + log cascade
  }

  async listCards(deckId?: number) {
    const rows = deckId === undefined
      ? await this.db.all<CardRow>('SELECT * FROM cards ORDER BY id')
      : await this.db.all<CardRow>('SELECT * FROM cards WHERE deck_id=? ORDER BY id', [deckId]);
    return rows.map(toCard);
  }
  async getCard(id: number) {
    const rows = await this.db.all<CardRow>('SELECT * FROM cards WHERE id=?', [id]);
    return rows[0] ? toCard(rows[0]) : null;
  }
  async addCards(deckId: number, cards: ImportedCard[], now: number) {
    await this.db.transaction(async () => {
      for (const c of cards) {
        await this.db.run(
          'INSERT INTO cards(deck_id, front, back, tags, due, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [deckId, c.front, c.back, c.tags.join(' '), now, now],
        );
      }
    });
    return cards.length;
  }
  async updateCardContent(id: number, front: string, back: string, tags: string[]) {
    await this.db.run('UPDATE cards SET front=?, back=?, tags=? WHERE id=?', [front, back, tags.join(' '), id]);
  }
  async deleteCard(id: number) {
    await this.db.run('DELETE FROM cards WHERE id=?', [id]);
  }

  async applyReview(cardId: number, next: Card, log: Omit<ReviewLogRow, 'id'>) {
    await this.db.transaction(async () => {
      await this.db.run(`UPDATE cards SET ${SCHED_SET} WHERE id=?`, [...schedParams(next), cardId]);
      await this.db.run(
        'INSERT INTO review_log(card_id, rating, state_before, reviewed_at, prev_card) VALUES (?, ?, ?, ?, ?)',
        [cardId, log.rating, log.stateBefore, log.reviewedAt, JSON.stringify(log.prev)],
      );
    });
  }

  async undoLastReview() {
    let result: { cardId: number } | null = null;
    await this.db.transaction(async () => {
      const rows = await this.db.all<{ id: number; card_id: number; prev_card: string }>(
        'SELECT id, card_id, prev_card FROM review_log ORDER BY id DESC LIMIT 1',
      );
      if (!rows[0]) return;
      const prev = JSON.parse(rows[0].prev_card) as Card;
      await this.db.run(`UPDATE cards SET ${SCHED_SET} WHERE id=?`, [...schedParams(prev), rows[0].card_id]);
      await this.db.run('DELETE FROM review_log WHERE id=?', [rows[0].id]);
      result = { cardId: rows[0].card_id };
    });
    return result;
  }

  async listReviewLog(since = 0) {
    const rows = await this.db.all<{ id: number; card_id: number; rating: number; state_before: number; reviewed_at: number; prev_card: string }>(
      'SELECT * FROM review_log WHERE reviewed_at >= ? ORDER BY id', [since],
    );
    return rows.map((r): ReviewLogRow => ({
      id: r.id, cardId: r.card_id, rating: r.rating as Rating, stateBefore: r.state_before as State,
      reviewedAt: r.reviewed_at, prev: JSON.parse(r.prev_card) as Card,
    }));
  }

  async getSettings(): Promise<Settings> {
    const rows = await this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    const out: Settings = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (r.key in out) (out as unknown as Record<string, number>)[r.key] = Number(r.value);
    }
    return out;
  }
  async setSettings(patch: Partial<Settings>) {
    await this.db.transaction(async () => {
      for (const [k, v] of Object.entries(patch)) {
        await this.db.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
      }
    });
  }
}
