import { Scheduler, Rating, formatInterval, newCard, type Card } from '@spaced/fsrs';
import type { Repo, StoredCard } from './repo';
import { buildQueue, dueCounts, studyDayStart, type DueCounts } from './queue';
import { reviewsPerDay, retention, streak, type DayStat } from './stats';
import { exportCsv, exportJson } from './exporters';
import type { ImportReport } from './types';

export interface RatingPreview {
  rating: Rating;
  label: string;
}

export interface Stats {
  reviewsPerDay: DayStat[];
  retention: number | null;
  streak: number;
  totalReviews: number;
  totalCards: number;
}

/** Application logic over a Repo: study queue, rating, undo, stats, import/export. */
export class StudyService {
  private scheduler: Scheduler | null = null;
  private retentionUsed = 0;

  constructor(private repo: Repo) {}

  private async sched() {
    const { requestRetention } = await this.repo.getSettings();
    if (!this.scheduler || this.retentionUsed !== requestRetention) {
      this.scheduler = new Scheduler({ requestRetention });
      this.retentionUsed = requestRetention;
    }
    return this.scheduler;
  }

  private async doneToday(now: number) {
    const log = await this.repo.listReviewLog(studyDayStart(now));
    // "new done" = first-ever review of a card today
    const newDone = log.filter((l) => l.prev.state === 0 /* New */).length;
    return { newDone, reviewsDone: log.length - newDone };
  }

  async counts(now: number, deckId?: number): Promise<DueCounts> {
    const [cards, settings, done] = await Promise.all([this.repo.listCards(deckId), this.repo.getSettings(), this.doneToday(now)]);
    return dueCounts(cards, now, settings, done);
  }

  /** Card ids to study now, in order. */
  async queue(now: number, deckId?: number): Promise<number[]> {
    const [cards, settings, done] = await Promise.all([this.repo.listCards(deckId), this.repo.getSettings(), this.doneToday(now)]);
    return buildQueue(cards, now, settings, done);
  }

  /** Next-interval labels shown on the four rating buttons. */
  async previews(card: StoredCard, now: number): Promise<RatingPreview[]> {
    const s = await this.sched();
    const p = s.preview(card, now);
    return ([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const).map((rating) => ({
      rating,
      label: formatInterval(p[rating].due - now),
    }));
  }

  async rate(cardId: number, rating: Rating, now: number): Promise<Card> {
    const card = await this.repo.getCard(cardId);
    if (!card) throw new Error('No such card');
    const s = await this.sched();
    const next = s.review(card, rating, now);
    const prev: Card = {
      state: card.state, due: card.due, stability: card.stability, difficulty: card.difficulty,
      lastReview: card.lastReview, reps: card.reps, lapses: card.lapses, scheduledDays: card.scheduledDays,
    };
    await this.repo.applyReview(cardId, next, { cardId, rating, stateBefore: card.state, reviewedAt: now, prev });
    return next;
  }

  /** Undo the last rating. Returns the id of the card that should be shown again. */
  async undo(): Promise<number | null> {
    const r = await this.repo.undoLastReview();
    return r ? r.cardId : null;
  }

  async stats(now: number, days = 14): Promise<Stats> {
    const [log, cards] = await Promise.all([this.repo.listReviewLog(), this.repo.listCards()]);
    return {
      reviewsPerDay: reviewsPerDay(log, now, days),
      retention: retention(log),
      streak: streak(log, now),
      totalReviews: log.length,
      totalCards: cards.length,
    };
  }

  async importInto(deckId: number, report: ImportReport, now: number): Promise<number> {
    return this.repo.addCards(deckId, report.cards, now);
  }

  async exportAsCsv(): Promise<string> {
    const [decks, cards] = await Promise.all([this.repo.listDecks(), this.repo.listCards()]);
    const name = new Map(decks.map((d) => [d.id, d.name]));
    return exportCsv(cards.map((c) => ({ deck: name.get(c.deckId) ?? '', front: c.front, back: c.back, tags: c.tags })));
  }

  async exportAsJson(): Promise<string> {
    const [decks, cards, log, settings] = await Promise.all([
      this.repo.listDecks(), this.repo.listCards(), this.repo.listReviewLog(), this.repo.getSettings(),
    ]);
    return exportJson({ version: 1, exportedAt: Date.now(), settings, decks, cards, reviewLog: log });
  }

  /** Create a deck, or return the existing one with that name. */
  async ensureDeck(name: string, now: number) {
    const existing = (await this.repo.listDecks()).find((d) => d.name === name);
    return existing ?? this.repo.addDeck(name, now);
  }
}

export { newCard };
