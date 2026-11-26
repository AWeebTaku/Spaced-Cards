import React from 'react';
import { Image, Text, View, type TextStyle } from 'react-native';

/** Tiny Markdown renderer: **bold**, *italic*, `code`, "- " bullets, ![](image). */
function inline(text: string, base: TextStyle, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<Text key={`${key}${i++}`} style={{ fontWeight: '700' }}>{t.slice(2, -2)}</Text>);
    else if (t.startsWith('`')) out.push(<Text key={`${key}${i++}`} style={{ fontFamily: 'monospace' }}>{t.slice(1, -1)}</Text>);
    else out.push(<Text key={`${key}${i++}`} style={{ fontStyle: 'italic' }}>{t.slice(1, -1)}</Text>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, style }: { source: string; style: TextStyle }) {
  return (
    <View style={{ gap: 6 }}>
      {source.split('\n').map((line, i) => {
        const img = /^!\[[^\]]*\]\(([^)]+)\)$/.exec(line.trim());
        if (img) return <Image key={i} source={{ uri: img[1] }} style={{ width: '100%', height: 160 }} resizeMode="contain" />;
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        const body = bullet ? bullet[1] : line;
        return (
          <Text key={i} style={style}>
            {bullet ? '•  ' : ''}
            {inline(body, style, `l${i}`)}
          </Text>
        );
      })}
    </View>
  );
}
