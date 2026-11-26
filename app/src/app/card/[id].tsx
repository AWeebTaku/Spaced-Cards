import React from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { Button, Label } from '../../components/ui';
import { Markdown } from '../../components/Markdown';

export default function CardScreen() {
  const { id, deckId } = useLocalSearchParams<{ id: string; deckId?: string }>();
  const isNew = id === 'new';
  const { repo } = useStore();
  const t = useTheme();
  const [front, setFront] = React.useState('');
  const [back, setBack] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [loaded, setLoaded] = React.useState(isNew);
  const [cardDeck, setCardDeck] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (isNew) return;
    repo.getCard(Number(id)).then((c) => {
      if (c) { setFront(c.front); setBack(c.back); setTags(c.tags.join(' ')); setCardDeck(c.deckId); }
      setLoaded(true);
    });
  }, [id, isNew, repo]);

  const parsedTags = tags.split(/[\s,;]+/).filter(Boolean);
  const valid = front.trim() !== '' && back.trim() !== '';
  const input = { backgroundColor: t.card, color: t.text, borderColor: t.border, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 } as const;

  async function save(another: boolean) {
    try {
      if (isNew) {
        await repo.addCards(Number(deckId), [{ front: front.trim(), back: back.trim(), tags: parsedTags }], Date.now());
        if (another) { setFront(''); setBack(''); return; }
      } else {
        await repo.updateCardContent(Number(id), front.trim(), back.trim(), parsedTags);
      }
      router.back();
    } catch (e) { Alert.alert('Could not save', String((e as Error).message)); }
  }
  async function remove() {
    await repo.deleteCard(Number(id));
    router.back();
  }
  if (!loaded) return null;
  void cardDeck;
  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New card' : 'Edit card' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <View><Label>Front (Markdown)</Label><TextInput value={front} onChangeText={setFront} multiline style={[input, { minHeight: 80 }]} placeholder="Question" placeholderTextColor={t.sub} /></View>
        <View><Label>Back (Markdown)</Label><TextInput value={back} onChangeText={setBack} multiline style={[input, { minHeight: 100 }]} placeholder="Answer. Use **bold**, - lists, ![](image-url)" placeholderTextColor={t.sub} /></View>
        <View><Label>Tags</Label><TextInput value={tags} onChangeText={setTags} autoCapitalize="none" style={input} placeholder="space separated" placeholderTextColor={t.sub} /></View>
        {valid && (
          <View style={{ gap: 4 }}>
            <Label>Preview</Label>
            <Markdown source={front} style={{ color: t.text, fontSize: 16, fontWeight: '600' }} />
            <Markdown source={back} style={{ color: t.text, fontSize: 16 }} />
          </View>
        )}
        <Button title="Save" disabled={!valid} onPress={() => save(false)} />
        {isNew && <Button title="Save and add another" kind="secondary" disabled={!valid} onPress={() => save(true)} />}
        {!isNew && <Button title="Delete card" kind="danger" onPress={remove} />}
      </ScrollView>
    </>
  );
}
