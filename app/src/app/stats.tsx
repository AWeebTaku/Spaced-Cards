import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from '../lib/store';
import { useLoad } from '../lib/useLoad';
import { useTheme } from '../lib/theme';
import { Card, Label } from '../components/ui';

export default function Stats() {
  const { svc } = useStore();
  const t = useTheme();
  const [s] = useLoad(() => svc.stats(Date.now(), 14));
  if (!s) return null;
  const max = Math.max(1, ...s.reviewsPerDay.map((d) => d.reviews));
  const tile = (label: string, value: string) => (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <Label>{label}</Label>
      <Text style={{ color: t.text, fontSize: 28, fontWeight: '700' }}>{value}</Text>
    </Card>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {tile('Retention', s.retention === null ? '—' : `${Math.round(s.retention * 100)}%`)}
        {tile('Streak', `${s.streak} day${s.streak === 1 ? '' : 's'}`)}
        {tile('Total reviews', String(s.totalReviews))}
        {tile('Cards', String(s.totalCards))}
      </View>
      <Card>
        <Label>Reviews per day (last 14 days)</Label>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 }} accessibilityLabel="Bar chart of reviews per day">
          {s.reviewsPerDay.map((d) => (
            <View key={d.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <Text style={{ color: t.sub, fontSize: 10 }}>{d.reviews || ''}</Text>
              <View style={{ width: '100%', height: `${(d.reviews / max) * 80}%`, minHeight: d.reviews ? 2 : 0, backgroundColor: t.primary, borderRadius: 3 }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: t.sub, fontSize: 11 }}>{s.reviewsPerDay[0]?.day.slice(5)}</Text>
          <Text style={{ color: t.sub, fontSize: 11 }}>{s.reviewsPerDay[s.reviewsPerDay.length - 1]?.day.slice(5)}</Text>
        </View>
      </Card>
      <Text style={{ color: t.sub, fontSize: 12 }}>Retention is the share of reviews of mature cards answered Hard, Good or Easy.</Text>
    </ScrollView>
  );
}
