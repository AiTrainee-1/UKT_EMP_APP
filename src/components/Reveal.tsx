import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleProp, ViewStyle } from 'react-native';
import { MotiView } from 'moti';

/**
 * Staggered entrance animation for a screen's sections.
 *
 * Follows the timing already used by LeaveCard (260ms, 50ms stagger, capped
 * so a long list never ends up waiting seconds for its last item) so motion
 * feels consistent wherever it appears rather than each screen inventing its
 * own curve.
 *
 * Honours the OS "Reduce Motion" setting: when it's on, content is rendered
 * at its final state immediately instead of sliding, since vestibular-motion
 * sensitivity is exactly what that setting exists to protect.
 */
export function Reveal({
  children,
  index = 0,
  style,
  /** Distance travelled on entry. Larger reads as heavier/more prominent. */
  offsetY = 10,
  duration = 260,
}: {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  offsetY?: number;
  duration?: number;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (active) setReduceMotion(v); })
      .catch(() => { /* older platforms -assume motion is fine */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  if (reduceMotion) {
    return <MotiView style={style}>{children}</MotiView>;
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: offsetY }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration, delay: Math.min(index, 8) * 50 }}
      style={style}
    >
      {children}
    </MotiView>
  );
}
