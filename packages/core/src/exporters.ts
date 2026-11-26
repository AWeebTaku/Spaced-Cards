import { serializeCsv } from './csv';

export interface ExportCard {
  deck: string;
  front: string;
  back: string;
  tags: string[];
}

export function exportCsv(cards: ExportCard[]): string {
  return serializeCsv([
    ['deck', 'front', 'back', 'tags'],
    ...cards.map((c) => [c.deck, c.front, c.back, c.tags.join(' ')]),
  ]);
}

export function exportJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
