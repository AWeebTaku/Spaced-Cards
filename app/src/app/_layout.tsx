import React from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function Layout() {
  const t = useTheme();
  return (
    <StoreProvider fallback={<View style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Text>Could not open the database.</Text></View>}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg }, headerShadowVisible: false }}>
        <Stack.Screen name="index" options={{ title: 'Spaced Cards' }} />
        <Stack.Screen name="stats" options={{ title: 'Stats' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="import" options={{ title: 'Import' }} />
        <Stack.Screen name="deck/[id]" options={{ title: 'Deck' }} />
        <Stack.Screen name="card/[id]" options={{ title: 'Card' }} />
        <Stack.Screen name="study/[deckId]" options={{ title: 'Study' }} />
      </Stack>
    </StoreProvider>
  );
}
