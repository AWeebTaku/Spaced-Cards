import React from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useStore } from '../lib/store';
import { useLoad } from '../lib/useLoad';
import { useTheme } from '../lib/theme';
import { Button, Card, Label } from '../components/ui';
import { saveText } from '../lib/share';

export default function Settings() {
  const { repo, svc } = useStore();
  const t = useTheme();
  const [loaded] = useLoad(() => repo.getSettings());
  const [vals, setVals] = React.useState<{ n: string; r: string; ret: string } | null>(null);
  React.useEffect(() => {
    if (loaded && !vals) setVals({ n: String(loaded.newPerDay), r: String(loaded.reviewsPerDay), ret: String(Math.round(loaded.requestRetention * 100)) });
  }, [loaded, vals]);
  if (!vals) return null;

  const input = { backgroundColor: t.card, color: t.text, borderColor: t.border, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 } as const;
  const field = (label: string, key: 'n' | 'r' | 'ret', hint: string) => (
    <View style={{ gap: 2 }}>
      <Label>{label}</Label>
      <TextInput value={vals[key]} onChangeText={(v) => setVals({ ...vals, [key]: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" style={input} />
      <Text style={{ color: t.sub, fontSize: 12 }}>{hint}</Text>
    </View>
  );
  const notify = (m: string) => (Platform.OS === 'web' ? alert(m) : Alert.alert(m));

  async function save() {
    const n = parseInt(vals!.n, 10), r = parseInt(vals!.r, 10), ret = parseInt(vals!.ret, 10);
    if (!(n >= 0 && r >= 0 && ret >= 70 && ret <= 99)) return notify('Limits must be numbers and retention must be between 70 and 99.');
    await repo.setSettings({ newPerDay: n, reviewsPerDay: r, requestRetention: ret / 100 });
    notify('Saved');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card style={{ gap: 14 }}>
        {field('New cards per day', 'n', 'Maximum new cards introduced each day.')}
        {field('Reviews per day', 'r', 'Maximum due reviews each day. The day rolls over at 4 am.')}
        {field('Desired retention (%)', 'ret', 'Higher means shorter intervals and more reviews. 90 is a good default.')}
        <Button title="Save" onPress={save} />
      </Card>
      <Card style={{ gap: 10 }}>
        <Label>Export</Label>
        <Button kind="secondary" title="Export cards (CSV)" onPress={() => svc.exportAsCsv().then((c) => saveText('spaced-cards.csv', 'text/csv', c))} />
        <Button kind="secondary" title="Export everything (JSON, with review history)" onPress={() => svc.exportAsJson().then((c) => saveText('spaced-cards.json', 'application/json', c))} />
      </Card>
    </ScrollView>
  );
}
