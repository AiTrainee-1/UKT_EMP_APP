import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Image, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  GestureHandlerRootView,
  GestureDetector,
  usePinchGesture,
  usePanGesture,
  useTapGesture,
  useSimultaneousGestures,
  useExclusiveGestures,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { FontFamily } from '../../constants/typography';

const MIN = 1;
const MAX = 5;

function clamp(v: number, lo: number, hi: number) {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Full-screen photo viewer for a document scan: pinch to zoom (up to 5x), drag to move around
 * when zoomed, double-tap to zoom in / back out. The + / − / fit buttons do the same for anyone
 * who cannot pinch, and work for screen-reader users.
 */
export function ImagePreviewModal({
  uri,
  title,
  onClose,
  onSave,
  onShare,
  busy,
}: {
  uri: string | null;
  title: string;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  busy: 'save' | 'share' | null;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const reset = (animated = true) => {
    const t = animated ? (v: number) => withTiming(v, { duration: 220 }) : (v: number) => v;
    scale.value = t(1);
    tx.value = t(0);
    ty.value = t(0);
    savedScale.value = 1;
    savedTx.value = 0;
    savedTy.value = 0;
  };

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    reset(false);
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomTo = (next: number) => {
    const s = clamp(next, MIN, MAX);
    scale.value = withTiming(s, { duration: 220 });
    savedScale.value = s;
    if (s === 1) {
      tx.value = withTiming(0, { duration: 220 });
      ty.value = withTiming(0, { duration: 220 });
      savedTx.value = 0;
      savedTy.value = 0;
    }
  };

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      scale.value = clamp(savedScale.value * e.scale, MIN * 0.9, MAX);
    },
    onDeactivate: () => {
      'worklet';
      const s = clamp(scale.value, MIN, MAX);
      scale.value = withTiming(s, { duration: 160 });
      savedScale.value = s;
      if (s === 1) {
        tx.value = withTiming(0, { duration: 160 });
        ty.value = withTiming(0, { duration: 160 });
        savedTx.value = 0;
        savedTy.value = 0;
      }
    },
  });

  const pan = usePanGesture({
    minDistance: 4,
    onUpdate: (e) => {
      'worklet';
      if (savedScale.value <= 1 && scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    },
    onDeactivate: () => {
      'worklet';
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: () => {
      'worklet';
      const next = savedScale.value > 1 ? 1 : 2.5;
      scale.value = withTiming(next, { duration: 220 });
      savedScale.value = next;
      if (next === 1) {
        tx.value = withTiming(0, { duration: 220 });
        ty.value = withTiming(0, { duration: 220 });
        savedTx.value = 0;
        savedTy.value = 0;
      }
    },
  });

  const gesture = useExclusiveGestures(doubleTap, useSimultaneousGestures(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const visible = !!uri;

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <View style={styles.topBar}>
            <Pressable
              onPress={onClose}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Close photo"
              hitSlop={8}
            >
              <MaterialCommunityIcons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={onShare}
              disabled={!!busy}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Share this file"
              hitSlop={8}
            >
              {busy === 'share' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialCommunityIcons name="share-variant-outline" size={21} color="#fff" />
              )}
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={!!busy}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Save a copy to your phone"
              hitSlop={8}
            >
              {busy === 'save' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialCommunityIcons name="tray-arrow-down" size={21} color="#fff" />
              )}
            </Pressable>
          </View>

          <View style={styles.stage}>
            {uri && !failed && (
              <GestureDetector gesture={gesture}>
                <Animated.View style={[styles.imageWrap, imageStyle]}>
                  <Image
                    source={{ uri }}
                    style={styles.image}
                    resizeMode="contain"
                    onLoad={() => setLoaded(true)}
                    onError={() => setFailed(true)}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={`Photo of ${title}`}
                  />
                </Animated.View>
              </GestureDetector>
            )}
            {!loaded && !failed && <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" size="large" />}
            {failed && (
              <View style={styles.failed}>
                <MaterialCommunityIcons name="image-broken-variant" size={40} color="rgba(255,255,255,0.7)" />
                <Text style={styles.failedText}>This photo could not be shown. Try Save or Share instead.</Text>
              </View>
            )}
          </View>

          <View style={styles.bottomBar}>
            <Text style={styles.hint}>Pinch or double-tap to zoom</Text>
            <View style={styles.zoomRow}>
              <Pressable
                onPress={() => zoomTo(savedScale.value / 1.5)}
                style={styles.zoomBtn}
                accessibilityRole="button"
                accessibilityLabel="Zoom out"
              >
                <MaterialCommunityIcons name="magnify-minus-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => reset(true)}
                style={styles.zoomBtn}
                accessibilityRole="button"
                accessibilityLabel="Fit to screen"
              >
                <MaterialCommunityIcons name="fit-to-screen-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => zoomTo(savedScale.value * 1.5)}
                style={styles.zoomBtn}
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
              >
                <MaterialCommunityIcons name="magnify-plus-outline" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// A photo viewer is dark in both themes, like every phone's gallery.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05080F' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 15, marginHorizontal: 4 },
  stage: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  imageWrap: { width: '100%', height: '100%' },
  image: { width: '100%', height: '100%' },
  failed: { alignItems: 'center', gap: 10, padding: 32 },
  failedText: { color: 'rgba(255,255,255,0.8)', fontFamily: FontFamily.bodyRegular, fontSize: 14, textAlign: 'center' },
  bottomBar: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  hint: { color: 'rgba(255,255,255,0.6)', fontFamily: FontFamily.bodyRegular, fontSize: 12 },
  zoomRow: { flexDirection: 'row', gap: 14 },
  zoomBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
