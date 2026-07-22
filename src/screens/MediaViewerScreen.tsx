/**
 * MediaViewerScreen — full-screen viewer for a case file (open session only).
 *  - photo: zoomless full view + green-pencil markup mode (strokes over the
 *    image, composited via react-native-view-shot and saved OVER the original
 *    through FilesService.replacePhoto — product decision, no copy kept);
 *  - video: playback via react-native-video.
 *
 * The decrypted copy exists only while this screen is mounted; it is deleted
 * on unmount (releaseReadable). Keystore crypto decrypts to a temp path;
 * passthrough (dev) returns the sealed path itself, which is never deleted.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Video from 'react-native-video';
import Svg, { Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices, useSessionActions } from '../store/StoreProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'MediaViewer'>;

const STROKE_COLOR = '#00c853'; // green pencil
const STROKE_WIDTH = 6;

interface Point {
  x: number;
  y: number;
}

function toSvgPath(points: Point[]): string {
  if (points.length === 0) {
    return '';
  }
  const [first, ...rest] = points;
  return `M ${first!.x} ${first!.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(' ');
}

/** Rect of an image displayed with resizeMode="contain" inside a container. */
function containRect(
  container: { width: number; height: number },
  natural: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(container.width / natural.width, container.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

export function MediaViewerScreen({ navigation, route }: Props): React.JSX.Element {
  const { caseId, fileName, fileType } = route.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preview, fs } = useServices();
  const actions = useSessionActions();

  const [readable, setReadable] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [container, setContainer] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [current, setCurrent] = useState<Point[]>([]);
  const [saving, setSaving] = useState(false);
  // view-shot's default export is not usable as a type; only capture() is needed.
  const shotRef = useRef<{ capture?: () => Promise<string> }>(null);

  // Decrypt on mount, delete the temp copy on unmount.
  useEffect(() => {
    let alive = true;
    let path: string | null = null;
    preview
      .getReadable(caseId, fileName)
      .then(p => {
        path = p;
        if (!alive) {
          return;
        }
        setReadable(p);
        if (fileType === 'photo') {
          Image.getSize(
            `file://${p}`,
            (width, height) => alive && setNatural({ width, height }),
            () => alive && setFailed(true),
          );
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (path !== null) {
        preview.releaseReadable(caseId, fileName, path).catch(() => undefined);
      }
    };
  }, [preview, caseId, fileName, fileType]);

  const onLayout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    setContainer({ width, height });
  };

  const rect =
    fileType === 'photo' && natural !== null && container !== null
      ? containRect(container, natural)
      : null;

  const save = async (): Promise<void> => {
    if (shotRef.current?.capture === undefined || natural === null || saving) {
      return;
    }
    setSaving(true);
    try {
      // Capture the image+strokes view scaled back to the photo's native size.
      const shot = await shotRef.current.capture();
      await actions.replacePhoto(fileName, shot);
      await fs.unlink(shot).catch(() => undefined);
      navigation.goBack(); // grid thumbnail re-generates (cache invalidated)
    } catch (e) {
      Alert.alert(t('viewer.saveFailedTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (): void => {
    Alert.alert(t('session.deleteTitle'), t('session.deleteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('session.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await actions.deleteFile(fileName);
            navigation.goBack();
          } catch (e) {
            Alert.alert(t('viewer.saveFailedTitle'), e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const content = (): React.JSX.Element => {
    if (failed) {
      return <Text style={styles.error}>{t('viewer.loadFailed')}</Text>;
    }
    if (readable === null || (fileType === 'photo' && natural === null)) {
      return <ActivityIndicator size="large" color="#fff" />;
    }
    if (fileType === 'video') {
      return (
        <Video
          source={{ uri: `file://${readable}` }}
          style={StyleSheet.absoluteFill}
          controls
          resizeMode="contain"
        />
      );
    }
    // Photo: the ViewShot wraps EXACTLY the displayed image rect, so the saved
    // composite has no letterbox bars; capture rescales to native resolution.
    return (
      <View style={styles.flex} onLayout={onLayout}>
        {rect !== null && (
          <ViewShot
            ref={shotRef as never}
            options={{
              format: 'jpg',
              quality: 0.9,
              width: natural!.width,
              height: natural!.height,
            }}
            style={[
              styles.shot,
              { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
            ]}>
            <Image
              source={{ uri: `file://${readable}` }}
              style={StyleSheet.absoluteFill}
              resizeMode="stretch"
            />
            <View
              style={StyleSheet.absoluteFill}
              pointerEvents={drawing ? 'auto' : 'none'}
              onStartShouldSetResponder={() => drawing}
              onMoveShouldSetResponder={() => drawing}
              onResponderGrant={e => {
                const { locationX, locationY } = e.nativeEvent;
                setCurrent([{ x: locationX, y: locationY }]);
              }}
              onResponderMove={e => {
                const { locationX, locationY } = e.nativeEvent;
                setCurrent(prev => [...prev, { x: locationX, y: locationY }]);
              }}
              onResponderRelease={() => {
                setStrokes(prev => (current.length > 1 ? [...prev, current] : prev));
                setCurrent([]);
              }}>
              <Svg style={StyleSheet.absoluteFill}>
                {[...strokes, current].map((s, i) => (
                  <Path
                    key={i}
                    d={toSvgPath(s)}
                    stroke={STROKE_COLOR}
                    strokeWidth={STROKE_WIDTH}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </Svg>
            </View>
          </ViewShot>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.stage}>{content()}</View>

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 12 }]}>
        {fileType === 'photo' && !drawing && (
          <Pressable testID="start-draw" style={styles.btn} onPress={() => setDrawing(true)}>
            <Text style={styles.btnText}>{t('viewer.draw')}</Text>
          </Pressable>
        )}
        {/* The plate photo is the case anchor and cannot be deleted. */}
        {!drawing && fileName !== 'plate.jpg' && (
          <Pressable testID="delete-file" style={[styles.btn, styles.btnDanger]} onPress={remove}>
            <Text style={styles.btnText}>{t('viewer.delete')}</Text>
          </Pressable>
        )}
        {drawing && (
          <>
            <Pressable
              testID="undo-stroke"
              style={styles.btn}
              disabled={strokes.length === 0}
              onPress={() => setStrokes(prev => prev.slice(0, -1))}>
              <Text style={styles.btnText}>{t('viewer.undo')}</Text>
            </Pressable>
            <Pressable
              testID="clear-strokes"
              style={styles.btn}
              disabled={strokes.length === 0}
              onPress={() => setStrokes([])}>
              <Text style={styles.btnText}>{t('viewer.clear')}</Text>
            </Pressable>
            <Pressable
              testID="cancel-draw"
              style={styles.btn}
              onPress={() => {
                setStrokes([]);
                setCurrent([]);
                setDrawing(false);
              }}>
              <Text style={styles.btnText}>{t('viewer.exitDraw')}</Text>
            </Pressable>
            <Pressable
              testID="save-draw"
              style={[styles.btn, styles.btnPrimary, strokes.length === 0 && styles.btnDisabled]}
              disabled={strokes.length === 0 || saving}
              onPress={save}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnText}>{t('viewer.save')}</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  stage: { flex: 1 },
  shot: { position: 'absolute', backgroundColor: '#000' },
  error: { color: '#ff8a80', fontSize: 16, textAlign: 'center', marginTop: 40 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 10,
    paddingHorizontal: 12,
    backgroundColor: '#000',
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#263238',
  },
  btnPrimary: { backgroundColor: '#2e7d32' },
  btnDanger: { backgroundColor: '#c62828' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
