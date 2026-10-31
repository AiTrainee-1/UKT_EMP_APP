import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, AccessibilityInfo } from 'react-native';
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
import { useNetworkBanner } from '../../lib/networkStatus';
import { BANNER_TEXT, bannerView, type BannerView } from '../../lib/networkBanner';
import { useReduceMotion } from '../../lib/motionPrefs';

// Fixed colours with white text, not palette entries: the bar also fills the strip behind the status bar, whose icons
// are white in both themes (see the StatusBar in app/_layout.tsx). Each keeps white text above 4.5:1.
const BAR_BG: Record<Exclude<BannerView, 'none'>, string> = {
  offline: '#334155', // calm slate: the phone has no internet, nothing is broken
  reconnecting: '#1D4ED8',
  connected: '#15803D',
  'server-down': '#B45309', // warm amber: the server is not answering
};

const ICON: Record<Exclude<BannerView, 'none'>, keyof typeof MaterialCommunityIcons.glyphMap> = {
  offline: 'wifi-off',
  reconnecting: 'sync',
  connected: 'check-circle-outline',
  'server-down': 'cloud-off-outline',
};

/**
 * The connection bar, one strip above the navigator (so it never covers the tab bar or an input; the screens simply
 * start below it). Four states (src/lib/networkBanner.ts decides which):
 *
 *  - "No internet connection. Please turn on your internet." while the phone is offline. Persistent, not dismissable,
 *    shown on every screen including Login.
 *  - "Reconnecting..." with a spinner once the internet is back, while the session is re-checked and screens refetch.
 *  - "Connected" briefly once the server has answered, then the bar goes away.
 *  - "Can't reach the server" (signed-in screens only) when the internet is on but the server is not answering, with a
 *    "Contact support" action and a close button for this outage. The login screens show that contact inline instead.
 *
 * Nothing is shown on the startup screen. With Reduce Motion on, "Reconnecting..." shows a still icon, not a spinner.
 */
export function ServerStatusBanner() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();
  const { offline, dismissed } = useServerStatus();
  const { phase } = useNetworkBanner();
  const reduceMotion = useReduceMotion();
  const [sheetOpen, setSheetOpen] = useState(false);

  const view = bannerView({
    phase,
    serverOffline: offline,
    serverDismissed: dismissed,
    signedIn: !!user,
    startingUp: isLoading,
  });

  // Screen readers on iOS do not read live regions: announce each new state once.
  const announced = useRef<BannerView>('none');
  useEffect(() => {
    if (view === announced.current) return;
    announced.current = view;
    if (view !== 'none') AccessibilityInfo.announceForAccessibility(BANNER_TEXT[view]);
  }, [view]);

  // The support sheet belongs to the server notice: close it if the notice goes.
  useEffect(() => {
    if (view !== 'server-down') setSheetOpen(false);
  }, [view]);

  return (
    <>
      {view !== 'none' && (
        <View
          style={[styles.bar, { paddingTop: insets.top, backgroundColor: BAR_BG[view] }]}
          accessibilityRole={view === 'offline' || view === 'server-down' ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
          testID={view === 'server-down' ? 'server-status-banner' : `network-banner-${view}`}
        >
          <View style={styles.row}>
            {view === 'reconnecting' && !reduceMotion ? (
              <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
            ) : (
              <MaterialCommunityIcons name={ICON[view]} size={16} color="#fff" />
            )}
            <Text style={styles.text} numberOfLines={2}>{BANNER_TEXT[view]}</Text>
            {view === 'server-down' && (
              <>
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
              </>
            )}
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
  bar: { paddingHorizontal: 14, paddingBottom: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 },
  spinner: { width: 16, height: 16, transform: [{ scale: 0.8 }] },
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
