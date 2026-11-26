import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { importAnkiText, importCsv, type ImportReport } from '@spaced/core';
import { useStore } from '../lib/store';
import { useLoad } from '../lib/useLoad';
import { useTheme } from '../lib/theme';
import { Button, Card, Label } from '../components/ui';
import { pickText } from '../lib/share';

export default function Import() {
  const { deckId } = useLocalSearchParams<{ deckId?: string }>();
  const { svc, repo } = useStore();
  const t = useTheme();
  const [decks] = useLoad(() => repo.listDecks());
  const [target, setTarget] = React.useState<number | null>(deckId ? Number(deckId) : null);
  const [file, setFile] = React.useState<{ name: string; report: ImportReport } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);

  async function choose(kind: 'csv' | 'anki') {
    setError(null); setResult(null);
    try {
      const f = await pickText();
      if (!f) return;
      const report = kind === 'csv' ? importCsv(f.text) : importAnkiText(f.text);
      setFile({ name: f.name, report });
    } catch (e) { setError(String((e as Error).message)); }
  }

  async function run() {
    if (!file) return;
    const now = Date.now();
    const base = file.name.replace(/\.[^.]+$/, '') || 'Imported';
    const id = target ?? (await svc.ensureDeck(base, now)).id;
    const n = await svc.importInto(id, file.report, now);
    setResult(`Imported ${n} card${n === 1 ? '' : 's'}.`);
    setFile(null);
  }

  const r = file?.report;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card style={{ gap: 10 }}>
        <Label>1. Choose a file</Label>
        <Button title="CSV file (front, back, tags)" onPress={() => choose('csv')} />
        <Button kind="secondary" title="Anki export (Notes in Plain Text)" onPress={() => choose('anki')} />
        <Text style={{ color: t.sub, fontSize: 12 }}>In Anki: File → Export → "Notes in Plain Text". CSV may have a header row with front/back/tags columns.</Text>
      </Card>
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      {r && (
        <Card style={{ gap: 8 }}>
          <Label>2. Review report for {file!.name}</Label>
          <Text style={{ color: t.text, fontWeight: '600' }}>{r.cards.length} cards ready to import</Text>
          {r.skipped.length > 0 && (
            <View>
              <Text style={{ color: t.hard, fontWeight: '600' }}>{r.skipped.length} rows skipped</Text>
              {r.skipped.slice(0, 8).map((s, i) => <Text key={i} style={{ color: t.sub }}>Line {s.line}: {s.reason}</Text>)}
              {r.skipped.length > 8 && <Text style={{ color: t.sub }}>…and {r.skipped.length - 8} more</Text>}
            </View>
          )}
          {r.warnings.map((w, i) => <Text key={i} style={{ color: t.sub }}>• {w}</Text>)}
          <Label>Into deck</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Button kind={target === null ? 'primary' : 'secondary'} title="New deck" onPress={() => setTarget(null)} />
            {decks?.map((d) => <Button key={d.id} kind={target === d.id ? 'primary' : 'secondary'} title={d.name} onPress={() => setTarget(d.id)} />)}
          </View>
          <Button title={`Import ${r.cards.length} cards`} disabled={r.cards.length === 0} onPress={run} />
        </Card>
      )}
      {result && (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: t.good, fontWeight: '600' }}>{result}</Text>
          <Button title="Done" onPress={() => router.replace('/')} />
        </Card>
      )}
    </ScrollView>
  );
}
