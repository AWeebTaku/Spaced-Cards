import React from 'react';
import { Alert, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useStore } from '../../lib/store';
import { useLoad } from '../../lib/useLoad';
import { useTheme } from '../../lib/theme';
import { Button, Card } from '../../components/ui';

export default function DeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const { svc, repo } = useStore();
  const t = useTheme();
  const [data] = useLoad(async () => {
    const deck = (await repo.listDecks()).find((d) => d.id === deckId) ?? null;
    return { deck, cards: await repo.listCards(deckId), counts: await svc.counts(Date.now(), deckId) };
  }, [deckId]);

  if (!data) return null;
  if (!data.deck) return <Text style={{ padding: 16, color: t.text }}>Deck not found.</Text>;
  const { deck, cards, counts } = data;

  function confirmDelete() {
    const go = async () => { await repo.deleteDeck(deckId); router.replace('/'); };
    if (Platform.OS === 'web') { if (confirm(`Delete "${deck!.name}" and its ${cards.length} cards?`)) void go(); return; }
    Alert.alert('Delete deck', `Delete "${deck!.name}" and its ${cards.length} cards?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  }

  return (
    <>
      <Stack.Screen options={{ title: deck.name }} />
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        data={cards}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            <Button title={counts.total ? `Study ${counts.total} due` : 'Nothing due'} disabled={!counts.total} onPress={() => router.push({ pathname: '/study/[deckId]', params: { deckId: String(deckId) } })} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button style={{ flex: 1 }} kind="secondary" title="Add card" onPress={() => router.push({ pathname: '/card/[id]', params: { id: 'new', deckId: String(deckId) } })} />
              <Button style={{ flex: 1 }} kind="secondary" title="Import" onPress={() => router.push({ pathname: '/import', params: { deckId: String(deckId) } })} />
              <Button style={{ flex: 1 }} kind="danger" title="Delete" onPress={confirmDelete} />
            </View>
            <Text style={{ color: t.sub }}>{cards.length} cards</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(item.id) } })}>
            <Card>
              <Text numberOfLines={2} style={{ color: t.text, fontWeight: '600' }}>{item.front}</Text>
              <Text numberOfLines={2} style={{ color: t.sub, marginTop: 2 }}>{item.back}</Text>
              {item.tags.length > 0 && <Text style={{ color: t.primary, marginTop: 4, fontSize: 12 }}>{item.tags.join(' · ')}</Text>}
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={{ color: t.sub }}>No cards yet.</Text>}
      />
    </>
  );
}
