import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Rating } from '@spaced/fsrs';
import type { RatingPreview, StoredCard } from '@spaced/core';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { Button } from '../../components/ui';
import { Markdown } from '../../components/Markdown';

const LABELS: Record<Rating, string> = { [Rating.Again]: 'Again', [Rating.Hard]: 'Hard', [Rating.Good]: 'Good', [Rating.Easy]: 'Easy' };

export default function Study() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const deck = deckId === 'all' ? undefined : Number(deckId);
  const { svc, repo } = useStore();
  const t = useTheme();
  const [card, setCard] = React.useState<StoredCard | null>(null);
  const [previews, setPreviews] = React.useState<RatingPreview[]>([]);
  const [flipped, setFlipped] = React.useState(false);
  const [remaining, setRemaining] = React.useState(0);
  const [done, setDone] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const busy = React.useRef(false);

  const show = React.useCallback(async (forceId?: number) => {
    const now = Date.now();
    const q = await svc.queue(now, deck);
    const id = forceId ?? q[0];
    setRemaining(forceId !== undefined && !q.includes(forceId) ? q.length + 1 : q.length);
    if (id === undefined) { setCard(null); setLoading(false); return; }
    const c = await repo.getCard(id);
    setCard(c);
    setPreviews(c ? await svc.previews(c, now) : []);
    setFlipped(false);
    setLoading(false);
  }, [svc, repo, deck]);

  React.useEffect(() => { void show(); }, [show]);

  const rate = React.useCallback(async (r: Rating) => {
    if (!card || !flipped || busy.current) return;
    busy.current = true;
    try {
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await svc.rate(card.id, r, Date.now());
      setDone((d) => d + 1);
      await show();
    } finally { busy.current = false; }
  }, [card, flipped, svc, show]);

  const undo = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const id = await svc.undo();
      if (id !== null) { setDone((d) => Math.max(0, d - 1)); await show(id); }
    } finally { busy.current = false; }
  }, [svc, show]);

  const flip = React.useCallback(() => { if (card) setFlipped(true); }, [card]);

  // Keyboard: Space/Enter flip, 1-4 rate, Z/U undo, Esc exit (web / hardware keyboards)
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!flipped) flip(); else void rate(Rating.Good); }
      else if (['1', '2', '3', '4'].includes(e.key)) void rate(Number(e.key) as Rating);
      else if (e.key === 'z' || e.key === 'u') void undo();
      else if (e.key === 'Escape') router.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, flip, rate, undo]);

  const color = (r: Rating) => ({ [Rating.Again]: t.again, [Rating.Hard]: t.hard, [Rating.Good]: t.good, [Rating.Easy]: t.easy })[r];

  if (loading) return null;
  if (!card) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Stack.Screen options={{ title: 'Done' }} />
        <Text style={{ fontSize: 28, fontWeight: '700', color: t.text }}>All caught up</Text>
        <Text style={{ color: t.sub }}>{done ? `You reviewed ${done} card${done === 1 ? '' : 's'}.` : 'No cards are due.'}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {done > 0 && <Button kind="secondary" title="Undo last" onPress={undo} />}
          <Button title="Back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: `${remaining} left` }} />
      <Pressable accessibilityLabel="Card, tap to reveal answer" onPress={flip} style={{ flex: 1, backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 20 }}>
        <View style={{ flex: 1 }}>
          <Markdown source={card.front} style={{ color: t.text, fontSize: 24, fontWeight: '600' }} />
        </View>
        <View style={{ height: 1, backgroundColor: t.border, marginVertical: 12, opacity: flipped ? 1 : 0 }} />
        {/* Answer is always laid out; only its opacity changes, so flipping never shifts the layout. */}
        <View style={{ flex: 1, opacity: flipped ? 1 : 0 }} pointerEvents={flipped ? 'auto' : 'none'} accessibilityElementsHidden={!flipped}>
          <Markdown source={card.back} style={{ color: t.text, fontSize: 20 }} />
        </View>
      </Pressable>
      <View style={{ height: 64 }}>
        {flipped ? (
          <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
            {previews.map((p) => (
              <Pressable key={p.rating} accessibilityRole="button" accessibilityLabel={`${LABELS[p.rating]}, next in ${p.label}`} onPress={() => rate(p.rating)}
                style={({ pressed }) => ({ flex: 1, borderRadius: 12, backgroundColor: color(p.rating), alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{LABELS[p.rating]}</Text>
                <Text style={{ color: '#fff', fontSize: 12, opacity: 0.9 }}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Button style={{ flex: 1, justifyContent: 'center' }} title="Show answer" onPress={flip} />
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={undo} disabled={done === 0}><Text style={{ color: done ? t.primary : t.sub }}>↶ Undo</Text></Pressable>
        {Platform.OS === 'web' && <Text style={{ color: t.sub, fontSize: 12 }}>Space flip · 1–4 rate · Z undo</Text>}
      </View>
    </View>
  );
}
