import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { BottomSheet } from '../ui/BottomSheet';
import { SupportContactCard } from './SupportContactCard';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { FontFamily } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { useServerStatus } from '../../hooks/useServerStatus';
import { dismissServerBanner } from '../../lib/serverStatus';

// A fixed warm colour with white text, not a palette entry: the bar also fills the strip behind the
// status bar, whose icons are white in both themes (see the StatusBar in app/_layout.tsx).
const BAR_BG = '#B45309';

/**
 * "Can't reach the server" notice for signed-in screens, with a "Contact support" action that opens the
 * software-support contact. Shown while the shared API client (src/lib/api.ts) is getting no answers;
 * gone as soon as a request succeeds again; can be dismissed for the current outage.
 *
 * It sits above the navigator in normal layout flow, not floating over it, so it can never cover the
 * tab bar or an input: the screens simply start below it. (Each screen's SafeAreaView works out its
 * own top inset from where it actually is, so the strip the bar fills behind the status bar is not
 * padded a second time.) The login screens show the same contact inline instead, so the bar only
 * appears while someone is signed in.
 */
export function ServerStatusBanner() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { offline, dismissed } = useServerStatus();
  const [sheetOpen, setSheetOpen] = useState(false);

  const showBar = !!user && offline && !dismissed;

  return (
    <>
      {showBar && (
        <View
          style={[styles.bar, { paddingTop: insets.top }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="server-status-banner"
        >
          <View style={styles.row}>
            <MaterialCommunityIcons name="cloud-off-outline" size={16} color="#fff" />
            <Text style={styles.text} numberOfLines={1}>Can't reach the server</Text>
            <TouchableOpacity
              onPress={() => setSheetOpen(true)}
              style={styles.action}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Contact support"
              testID="server-status-contact"
            >
              <Text style={styles.actionText}>Contact support</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={dismissServerBanner}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              testID="server-status-dismiss"
            >
              <MaterialCommunityIcons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!!user && (
        <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Can't reach the server">
          <Text style={styles.sheetText}>
            Check that your phone is connected to the internet. If other apps work but this one does not, the
            server may be down.
          </Text>
          <SupportContactCard situation="server" showNote={false} style={styles.sheetCard} />
        </BottomSheet>
      )}
    </>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  bar: { backgroundColor: BAR_BG, paddingHorizontal: 14, paddingBottom: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 },
  text: { flex: 1, color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
  action: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },

  sheetText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  sheetCard: { marginTop: 14 },
});
