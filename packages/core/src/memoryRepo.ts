import { newCard, type Card } from '@spaced/fsrs';
import type { Deck, Repo, ReviewLogRow, Settings, StoredCard } from './repo';
import { DEFAULT_SETTINGS } from './repo';
import type { ImportedCard } from './types';

export interface MemorySnapshot {
  decks: Deck[];
  cards: StoredCard[];
  log: ReviewLogRow[];
  settings: Settings;
  nextId: { deck: number; card: number; log: number };
}

/**
 * In-memory Repo with an optional `persist` hook (the web build writes the snapshot
 * to localStorage). Mutations run on a copy and are committed only if they succeed.
 */
export class MemoryRepo implements Repo {
  private s: MemorySnapshot;
  constructor(snapshot?: MemorySnapshot, private persist?: (s: MemorySnapshot) => void) {
    this.s = snapshot ?? {
      decks: [], cards: [], log: [], settings: { ...DEFAULT_SETTINGS },
      nextId: { deck: 1, card: 1, log: 1 },
    };
  }

  private commit(next: MemorySnapshot) {
    this.s = next;
    this.persist?.(next);
  }
  private draft(): MemorySnapshot {
    return structuredClone(this.s);
  }

  async listDecks() { return structuredClone(this.s.decks); }
  async addDeck(name: string, now: number) {
    const d = this.draft();
    if (d.decks.some((x) => x.name === name)) throw new Error(`Deck "${name}" already exists`);
    const deck = { id: d.nextId.deck++, name, createdAt: now };
    d.decks.push(deck);
    this.commit(d);
    return { ...deck };
  }
  async renameDeck(id: number, name: string) {
    const d = this.draft();
    const deck = d.decks.find((x) => x.id === id);
    if (!deck) throw new Error('No such deck');
    if (d.decks.some((x) => x.name === name && x.id !== id)) throw new Error(`Deck "${name}" already exists`);
    deck.name = name;
    this.commit(d);
  }
  async deleteDeck(id: number) {
    const d = this.draft();
    const ids = new Set(d.cards.filter((c) => c.deckId === id).map((c) => c.id));
    d.decks = d.decks.filter((x) => x.id !== id);
    d.cards = d.cards.filter((c) => c.deckId !== id);
    d.log = d.log.filter((l) => !ids.has(l.cardId));
    this.commit(d);
  }

  async listCards(deckId?: number) {
    return structuredClone(deckId === undefined ? this.s.cards : this.s.cards.filter((c) => c.deckId === deckId));
  }
  async getCard(id: number) {
    const c = this.s.cards.find((x) => x.id === id);
    return c ? structuredClone(c) : null;
  }
  async addCards(deckId: number, cards: ImportedCard[], now: number) {
    const d = this.draft();
    if (!d.decks.some((x) => x.id === deckId)) throw new Error('No such deck');
    for (const c of cards) {
      d.cards.push({ ...newCard(now), id: d.nextId.card++, deckId, front: c.front, back: c.back, tags: c.tags, createdAt: now });
    }
    this.commit(d);
    return cards.length;
  }
  async updateCardContent(id: number, front: string, back: string, tags: string[]) {
    const d = this.draft();
    const c = d.cards.find((x) => x.id === id);
    if (!c) throw new Error('No such card');
    Object.assign(c, { front, back, tags });
    this.commit(d);
  }
  async deleteCard(id: number) {
    const d = this.draft();
    d.cards = d.cards.filter((c) => c.id !== id);
    d.log = d.log.filter((l) => l.cardId !== id);
    this.commit(d);
  }

  async applyReview(cardId: number, next: Card, log: Omit<ReviewLogRow, 'id'>) {
    const d = this.draft();
    const c = d.cards.find((x) => x.id === cardId);
    if (!c) throw new Error('No such card');
    Object.assign(c, next);
    d.log.push({ ...log, id: d.nextId.log++ });
    this.commit(d);
  }
  async undoLastReview() {
    if (this.s.log.length === 0) return null;
    const d = this.draft();
    const last = d.log.reduce((a, b) => (b.id > a.id ? b : a));
    const c = d.cards.find((x) => x.id === last.cardId);
    if (c) Object.assign(c, last.prev);
    d.log = d.log.filter((l) => l.id !== last.id);
    this.commit(d);
    return { cardId: last.cardId };
  }
  async listReviewLog(since = 0) {
    return structuredClone(this.s.log.filter((l) => l.reviewedAt >= since));
  }

  async getSettings() { return { ...this.s.settings }; }
  async setSettings(patch: Partial<Settings>) {
    const d = this.draft();
    d.settings = { ...d.settings, ...patch };
    this.commit(d);
  }
}
