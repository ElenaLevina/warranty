import React from 'react';
import { Text, StyleSheet } from 'react-native';
import type { UploadStatus } from '../types';

const ICONS: Record<UploadStatus, string> = {
  pending: '☁︎',
  uploading: '↑',
  uploaded: '✓',
  error: '⚠',
};

const COLORS: Record<UploadStatus, string> = {
  pending: '#90a4ae',
  uploading: '#1565c0',
  uploaded: '#2e7d32',
  error: '#c62828',
};

export function UploadBadge({ status }: { status: UploadStatus }): React.JSX.Element {
  return (
    <Text style={[styles.badge, { color: COLORS[status] }]} testID={`upload-${status}`}>
      {ICONS[status]}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: { fontSize: 14, fontWeight: '700' },
});
