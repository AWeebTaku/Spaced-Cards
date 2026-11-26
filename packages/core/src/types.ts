export interface ImportedCard {
  front: string;
  back: string;
  tags: string[];
}

export interface ImportReport {
  cards: ImportedCard[];
  /** Rows that were not imported, with a human-readable reason. */
  skipped: { line: number; reason: string }[];
  /** Things that were converted or dropped but did not stop the import. */
  warnings: string[];
}
