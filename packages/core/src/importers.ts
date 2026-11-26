import { parseDelimited } from './csv';
import type { ImportReport, ImportedCard } from './types';

const HEADER_FRONT = ['front', 'question', 'q', 'term'];
const HEADER_BACK = ['back', 'answer', 'a', 'definition'];

/** Import cards from CSV. Detects a header row (front/back/tags) and the delimiter. */
export function importCsv(text: string): ImportReport {
  const report: ImportReport = { cards: [], skipped: [], warnings: [] };
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = first.includes('\t') && !first.includes(',') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) return report;

  let frontIdx = 0, backIdx = 1, tagsIdx = 2, start = 0;
  const head = rows[0].map((c) => c.trim().toLowerCase());
  const f = head.findIndex((h) => HEADER_FRONT.includes(h));
  const b = head.findIndex((h) => HEADER_BACK.includes(h));
  if (f !== -1 && b !== -1) {
    frontIdx = f; backIdx = b; start = 1;
    tagsIdx = head.findIndex((h) => h === 'tags' || h === 'tag');
  }

  rows.forEach((row, i) => {
    if (i < start) return;
    const line = i + 1;
    if (row.every((c) => c.trim() === '')) return; // blank line, not worth reporting
    const front = (row[frontIdx] ?? '').trim();
    const back = (row[backIdx] ?? '').trim();
    if (!front) return void report.skipped.push({ line, reason: 'empty front' });
    if (!back) return void report.skipped.push({ line, reason: 'empty back' });
    const tags = tagsIdx >= 0 && row[tagsIdx] ? splitTags(row[tagsIdx]) : [];
    report.cards.push({ front, back, tags });
  });
  return report;
}

function splitTags(s: string): string[] {
  return s.split(/[\s;,]+/).map((t) => t.trim()).filter(Boolean);
}

/** Convert the small subset of HTML that Anki fields use into Markdown-ish plain text. */
export function htmlToText(html: string, warnings?: Set<string>): string {
  let s = html;
  if (/\[sound:[^\]]+\]/.test(s)) { warnings?.add('audio ([sound:]) references were dropped'); s = s.replace(/\[sound:[^\]]+\]/g, ''); }
  s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_m, src) => `![](${src})`);
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n').replace(/<li[^>]*>/gi, '- ');
  s = s.replace(/<(b|strong)>(.*?)<\/\1>/gis, '**$2**').replace(/<(i|em)>(.*?)<\/\1>/gis, '*$2*');
  if (/\{\{c\d+::/.test(s)) {
    warnings?.add('cloze deletions were flattened to plain text');
    s = s.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1');
  }
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Import Anki's "Notes in Plain Text" export. Supports the `#separator:`, `#html:`
 * and `#tags column:` header lines. The first field is the front, the second the back.
 */
export function importAnkiText(text: string): ImportReport {
  const report: ImportReport = { cards: [], skipped: [], warnings: [] };
  const warn = new Set<string>();
  let sep = '\t';
  let html = false;
  let tagsColumn = -1;
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const body: { line: number; text: string }[] = [];

  lines.forEach((raw, i) => {
    if (raw.startsWith('#')) {
      const m = /^#(\w[\w ]*):(.*)$/.exec(raw);
      if (m) {
        const key = m[1].trim().toLowerCase();
        const val = m[2].trim();
        if (key === 'separator') sep = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|', colon: ':' }[val.toLowerCase()] ?? (val || '\t');
        else if (key === 'html') html = val.toLowerCase() === 'true';
        else if (key === 'tags column') tagsColumn = parseInt(val, 10) - 1;
      }
      return;
    }
    if (raw.trim() === '') return;
    body.push({ line: i + 1, text: raw });
  });

  if (sep === ',' || sep === ';') {
    // quoted fields may contain newlines; re-parse the body as delimited text
    const rows = parseDelimited(body.map((b) => b.text).join('\n'), sep);
    rows.forEach((r, i) => addRow(r, body[i]?.line ?? i + 1));
  } else {
    body.forEach((b) => addRow(b.text.split(sep), b.line));
  }

  function addRow(fields: string[], line: number) {
    const tagCol = tagsColumn >= 0 ? tagsColumn : -1;
    const content = fields.filter((_, idx) => idx !== tagCol);
    if (content.length < 2) return void report.skipped.push({ line, reason: 'fewer than 2 fields' });
    const conv = (s: string) => (html || /<[a-z/][^>]*>/i.test(s) ? htmlToText(s, warn) : s.replace(/\[sound:[^\]]+\]/g, () => { warn.add('audio ([sound:]) references were dropped'); return ''; }).trim());
    const front = conv(content[0]);
    const back = conv(content[1]);
    if (!front || !back) return void report.skipped.push({ line, reason: 'empty front or back' });
    if (content.length > 2) warn.add('notes with more than 2 fields: extra fields were ignored');
    const tags = tagCol >= 0 && fields[tagCol] ? splitTags(fields[tagCol]) : [];
    report.cards.push({ front, back, tags } as ImportedCard);
  }

  report.warnings = [...warn];
  return report;
}
