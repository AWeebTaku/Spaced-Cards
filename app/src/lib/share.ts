import { Platform } from 'react-native';

/** Save text as a file: browser download on web, share sheet on devices. */
export async function saveText(filename: string, mime: string, content: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: filename });
}

/** Let the user choose a text file and return its content (null if cancelled). */
export async function pickText(): Promise<{ name: string; text: string } | null> {
  const DocumentPicker = await import('expo-document-picker');
  const res = await DocumentPicker.getDocumentAsync({ type: ['text/*', 'application/csv', 'application/octet-stream'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  const asset = res.assets[0];
  if (Platform.OS === 'web' && asset.file) return { name: asset.name, text: await asset.file.text() };
  const { File } = await import('expo-file-system');
  return { name: asset.name, text: await new File(asset.uri).text() };
}
