import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { BorderRadius } from '../../constants/theme';

interface SuccessOverlayProps {
  visible: boolean;
  title?: string;
  message?: string;
  onDone: () => void;
  autoDismissMs?: number;
}

export function SuccessOverlay({
  visible,
  title = 'Success!',
  message,
  onDone,
  autoDismissMs = 1400,
}: SuccessOverlayProps) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDone, autoDismissMs);
    return () => clearTimeout(t);
  }, [visible, autoDismissMs, onDone]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <MotiView
          from={{ opacity: 0, scale: 0.85, translateY: 12 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 220 }}
          style={styles.card}
        >
          <MotiView
            from={{ scale: 0, rotate: '-40deg' }}
            animate={{ scale: 1, rotate: '0deg' }}
            transition={{ type: 'spring', damping: 9, stiffness: 160, delay: 80 }}
            style={styles.iconWrap}
          >
            <MaterialCommunityIcons name="check-bold" size={34} color="#fff" />
          </MotiView>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
        </MotiView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xxl,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 300,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.statusGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' },
  message: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
