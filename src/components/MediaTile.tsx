/**
 * MediaTile — one cell of the session media grid. Shows a real thumbnail
 * (decrypted+downscaled by PreviewService) with an icon fallback while loading
 * or when no native thumbnailer is available (emulator/tests).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useServices } from '../store/StoreProvider';
import type { CaseFileEntry } from '../types';

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  caseId: string;
  entry: CaseFileEntry;
  onPress?: (entry: CaseFileEntry) => void;
  /** Bump to force re-reading the thumbnail (after the photo was redrawn). */
  version?: number;
}

export function MediaTile({ caseId, entry, onPress, version = 0 }: Props): React.JSX.Element {
  const { preview } = useServices();
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    preview
      .getPreview(caseId, entry)
      .then(p => {
        if (alive) {
          setThumb(p);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [preview, caseId, entry, version]);

  return (
    <Pressable
      testID={`media-${entry.name}`}
      style={styles.tile}
      onPress={onPress === undefined ? undefined : () => onPress(entry)}>
      {thumb !== null ? (
        <Image
          // timestamp busts the RN image cache after the photo was redrawn
          source={{ uri: `file://${thumb}?v=${entry.timestamp}-${version}` }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <Text style={styles.icon}>{entry.type === 'video' ? '🎬' : '🖼'}</Text>
      )}
      {entry.type === 'video' && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            🎥 {entry.duration_sec !== undefined ? mmss(entry.duration_sec) : ''}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  icon: { fontSize: 26 },
  badge: {
    position: 'absolute',
    bottom: 4,
    start: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
