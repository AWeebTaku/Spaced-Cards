import { useColorScheme } from 'react-native';

const light = {
  bg: '#f6f7f9', card: '#ffffff', text: '#14171c', sub: '#5d6675', border: '#e2e5ea',
  primary: '#3b5bdb', onPrimary: '#ffffff',
  again: '#d6336c', hard: '#e8890c', good: '#2f9e44', easy: '#1c7ed6', danger: '#c92a2a',
};
const dark: typeof light = {
  bg: '#0e1013', card: '#171a1f', text: '#eceff4', sub: '#98a1b0', border: '#272c34',
  primary: '#748ffc', onPrimary: '#0e1013',
  again: '#f06595', hard: '#ffa94d', good: '#69db7c', easy: '#74c0fc', danger: '#ff8787',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
export const space = { xs: 4, sm: 8, md: 16, lg: 24 };
