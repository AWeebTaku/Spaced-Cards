import React from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useStore } from '../lib/store';
import { useLoad } from '../lib/useLoad';
import { useTheme } from '../lib/theme';
import { Button, Card } from '../components/ui';
import { SAMPLE_CARDS, SAMPLE_DECK } from '../lib/sample';

export default function Home() {
  const { svc, repo } = useStore();
  const t = useTheme();
  const [name, setName] = React.useState('');
  const [data, reload] = useLoad(async () => {
    const now = Date.now();
    const decks = await repo.listDecks();
    const rows = await Promise.all(decks.map(async (d) => ({ deck: d, counts: await svc.counts(now, d.id) })));
    return { rows, total: await svc.counts(now) };
  });

  async function addDeck() {
    const n = name.trim();
    if (!n) return;
    try { await repo.addDeck(n, Date.now()); setName(''); reload(); } catch (e) { Alert.alert('Could not add deck', String((e as Error).message)); }
  }
  async function addSample() {
    const d = await svc.ensureDeck(SAMPLE_DECK, Date.now());
    await repo.addCards(d.id, SAMPLE_CARDS, Date.now());
    reload();
  }

  if (!data) return null;
  const { rows, total } = data;
  return (
    <FlatList
      contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      data={rows}
      keyExtractor={(r) => String(r.deck.id)}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <Card>
            <Text style={{ color: t.sub, fontSize: 13 }}>Due today</Text>
            <Text style={{ color: t.text, fontSize: 40, fontWeight: '700' }} accessibilityLabel={`${total.total} cards due`}>{total.total}</Text>
            <Text style={{ color: t.sub, marginBottom: 12 }}>{total.new} new · {total.learning} learning · {total.review} review</Text>
            <Button title={total.total ? 'Study all decks' : 'Nothing due'} disabled={!total.total} onPress={() => router.push('/study/all')} />
          </Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button style={{ flex: 1 }} kind="secondary" title="Stats" onPress={() => router.push('/stats')} />
            <Button style={{ flex: 1 }} kind="secondary" title="Import" onPress={() => router.push('/import')} />
            <Button style={{ flex: 1 }} kind="secondary" title="Settings" onPress={() => router.push('/settings')} />
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: '/deck/[id]', params: { id: item.deck.id } }} asChild>
          <Pressable accessibilityRole="button">
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '600', flexShrink: 1 }}>{item.deck.name}</Text>
                <Text style={{ color: item.counts.total ? t.primary : t.sub, fontWeight: '700' }}>{item.counts.total} due</Text>
              </View>
              <Text style={{ color: t.sub, marginTop: 4 }}>{item.counts.new} new · {item.counts.learning} learning · {item.counts.review} review</Text>
            </Card>
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={
        <Card style={{ gap: 12 }}>
          <Text style={{ color: t.text, fontWeight: '600' }}>No decks yet</Text>
          <Text style={{ color: t.sub }}>Create a deck below, import cards from CSV or Anki, or try a sample deck.</Text>
          <Button title="Add sample deck" kind="secondary" onPress={addSample} />
        </Card>
      }
      ListFooterComponent={
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <TextInput
            value={name} onChangeText={setName} placeholder="New deck name" placeholderTextColor={t.sub} onSubmitEditing={addDeck}
            style={{ flex: 1, backgroundColor: t.card, color: t.text, borderColor: t.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 }}
          />
          <Button title="Add" onPress={addDeck} disabled={!name.trim()} />
        </View>
      }
    />
  );
}
