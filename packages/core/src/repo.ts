import type { Card, Rating, State } from '@spaced/fsrs';
import type { ImportedCard } from './types';
import type { Limits } from './queue';

export interface Deck {
  id: number;
  name: string;
  createdAt: number;
}

export interface StoredCard extends Card {
  id: number;
  deckId: number;
  front: string;
  back: string;
  tags: string[];
  createdAt: number;
}

export interface ReviewLogRow {
  id: number;
  cardId: number;
  rating: Rating;
  stateBefore: State;
  reviewedAt: number;
  /** Scheduling fields of the card before this review (used for undo). */
  prev: Card;
}

export interface Settings extends Limits {
  requestRetention: number;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20,
  reviewsPerDay: 200,
  requestRetention: 0.9,
};

/** Storage boundary. Every mutating method must be atomic (all-or-nothing). */
export interface Repo {
  listDecks(): Promise<Deck[]>;
  addDeck(name: string, now: number): Promise<Deck>;
  renameDeck(id: number, name: string): Promise<void>;
  deleteDeck(id: number): Promise<void>;

  listCards(deckId?: number): Promise<StoredCard[]>;
  getCard(id: number): Promise<StoredCard | null>;
  addCards(deckId: number, cards: ImportedCard[], now: number): Promise<number>;
  updateCardContent(id: number, front: string, back: string, tags: string[]): Promise<void>;
  deleteCard(id: number): Promise<void>;

  /** Persist the rescheduled card and its log row in ONE transaction. */
  applyReview(cardId: number, next: Card, log: Omit<ReviewLogRow, 'id'>): Promise<void>;
  /** Restore the most recent review's previous card state and drop its log row. */
  undoLastReview(): Promise<{ cardId: number } | null>;
  listReviewLog(since?: number): Promise<ReviewLogRow[]>;

  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<void>;
}
