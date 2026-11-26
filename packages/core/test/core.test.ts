import { describe, it, expect } from 'vitest';
import { Rating, State } from '@spaced/fsrs';
import {
  parseDelimited, serializeCsv, importCsv, importAnkiText, htmlToText, exportCsv,
  buildQueue, dueCounts, studyDayStart, reviewsPerDay, retention, streak,
} from '../src';

describe('csv', () => {
  it('handles quotes, commas, newlines and CRLF', () => {
    const rows = parseDelimited('a,"b,1","say ""hi"""\r\nx,"line1\nline2",z\n');
    expect(rows).toEqual([['a', 'b,1', 'say "hi"'], ['x', 'line1\nline2', 'z']]);
  });
  it('round-trips', () => {
    const rows = [['a,b', 'c"d', 'e\nf'], ['', 'x', 'y']];
    expect(parseDelimited(serializeCsv(rows))).toEqual(rows);
  });
  it('strips BOM', () => expect(parseDelimited('﻿a,b')).toEqual([['a', 'b']]));
});

describe('importCsv', () => {
  it('reads header, tags and reports skipped rows', () => {
    const r = importCsv('Front,Back,Tags\nhola,hello,es greetings\n,empty front,\nadios,,\n\ngracias,thanks,es\n');
    expect(r.cards).toEqual([
      { front: 'hola', back: 'hello', tags: ['es', 'greetings'] },
      { front: 'gracias', back: 'thanks', tags: ['es'] },
    ]);
    expect(r.skipped).toEqual([{ line: 3, reason: 'empty front' }, { line: 4, reason: 'empty back' }]);
  });
  it('works without a header', () => {
    expect(importCsv('a,b\nc,d').cards).toHaveLength(2);
  });
  it('detects reordered header columns', () => {
    expect(importCsv('answer,question\nB,A').cards[0]).toMatchObject({ front: 'A', back: 'B' });
  });
});

describe('importAnkiText', () => {
  const sample = [
    '#separator:tab', '#html:true', '#tags column:3',
    'What is <b>2+2</b>?\t4<br>four\tmath easy',
    'cap of France\tParis<img src="paris.jpg">\tgeo',
    'only one field',
    '{{c1::Mitochondria}} make ATP\tcell\t',
    'sound\tword[sound:a.mp3]\t',
  ].join('\n');
  const r = importAnkiText(sample);
  it('imports cards, tags and converts html', () => {
    expect(r.cards[0]).toEqual({ front: 'What is **2+2**?', back: '4\nfour', tags: ['math', 'easy'] });
    expect(r.cards[1].back).toBe('Paris![](paris.jpg)');
    expect(r.cards[2].front).toBe('Mitochondria make ATP');
    expect(r.cards[3].back).toBe('word');
  });
  it('reports skipped rows and warnings', () => {
    expect(r.skipped).toEqual([{ line: 6, reason: 'fewer than 2 fields' }]);
    expect(r.warnings.join(' ')).toMatch(/cloze/);
    expect(r.warnings.join(' ')).toMatch(/audio/);
  });
  it('honours custom separators', () => {
    const c = importAnkiText('#separator:semicolon\na;b\nc;d');
    expect(c.cards.map((x) => x.front)).toEqual(['a', 'c']);
  });
  it('htmlToText decodes entities', () => expect(htmlToText('a&nbsp;&amp;&lt;b')).toBe('a &<b'));
});

describe('exportCsv', () => {
  it('writes header and rows', () => {
    expect(exportCsv([{ deck: 'D', front: 'f', back: 'b,c', tags: ['x', 'y'] }])).toBe('deck,front,back,tags\nD,f,"b,c",x y\n');
  });
});

describe('queue', () => {
  const now = new Date(2026, 5, 10, 12, 0).getTime();
  const H = 3_600_000;
  const cards = [
    { id: 1, state: State.Review, due: now - 5 * H },
    { id: 2, state: State.Review, due: now - 50 * H },
    { id: 3, state: State.Review, due: now + 30 * H }, // tomorrow
    { id: 4, state: State.Learning, due: now - 1000 },
    { id: 5, state: State.Learning, due: now + 5 * 60_000 }, // not yet
    { id: 6, state: State.New, due: now },
    { id: 7, state: State.New, due: now },
    { id: 8, state: State.New, due: now },
  ];
  it('orders learning, reviews, then new', () => {
    expect(buildQueue(cards, now, { newPerDay: 2, reviewsPerDay: 10 }, { newDone: 0, reviewsDone: 0 })).toEqual([4, 2, 1, 6, 7]);
  });
  it('applies remaining daily limits', () => {
    expect(buildQueue(cards, now, { newPerDay: 2, reviewsPerDay: 1 }, { newDone: 1, reviewsDone: 0 })).toEqual([4, 2, 6]);
    expect(buildQueue(cards, now, { newPerDay: 2, reviewsPerDay: 1 }, { newDone: 2, reviewsDone: 1 })).toEqual([4]);
  });
  it('counts match queue', () => {
    const lim = { newPerDay: 2, reviewsPerDay: 10 };
    const done = { newDone: 0, reviewsDone: 0 };
    const c = dueCounts(cards, now, lim, done);
    expect(c).toEqual({ new: 2, learning: 1, review: 2, total: 5 });
    expect(c.total).toBe(buildQueue(cards, now, lim, done).length);
  });
  it('study day rolls over at 4am', () => {
    const at3 = new Date(2026, 5, 10, 3, 0).getTime();
    expect(new Date(studyDayStart(at3)).getDate()).toBe(9);
    expect(new Date(studyDayStart(now)).getDate()).toBe(10);
  });
});

describe('stats', () => {
  const now = new Date(2026, 5, 10, 12, 0).getTime();
  const D = 86_400_000;
  const log = [
    { reviewedAt: now, rating: Rating.Good, stateBefore: State.Review },
    { reviewedAt: now - 1000, rating: Rating.Again, stateBefore: State.Review },
    { reviewedAt: now - D, rating: Rating.Good, stateBefore: State.New },
    { reviewedAt: now - 2 * D, rating: Rating.Easy, stateBefore: State.Review },
    { reviewedAt: now - 4 * D, rating: Rating.Easy, stateBefore: State.Review },
  ];
  it('reviews per day zero-fills', () => {
    const s = reviewsPerDay(log, now, 5);
    expect(s.map((d) => d.reviews)).toEqual([1, 0, 1, 1, 2]);
  });
  it('retention counts only review-state answers', () => {
    expect(retention(log)).toBeCloseTo(3 / 4);
    expect(retention([])).toBeNull();
  });
  it('streak', () => expect(streak(log, now)).toBe(3));
});
