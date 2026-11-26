import type { ImportedCard } from '@spaced/core';

export const SAMPLE_DECK = 'Sample: Spanish basics';
export const SAMPLE_CARDS: ImportedCard[] = [
  ['hola', 'hello'], ['adiós', 'goodbye'], ['gracias', 'thank you'], ['por favor', 'please'],
  ['¿cómo estás?', 'how are you?'], ['buenos días', 'good morning'], ['buenas noches', 'good night'],
  ['el agua', '**water** (feminine noun, but takes "el")'], ['la casa', 'the house'], ['el perro', 'the dog'],
].map(([front, back]) => ({ front, back, tags: ['spanish'] }));
