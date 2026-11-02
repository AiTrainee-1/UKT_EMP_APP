import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';
import { halvesText, type DialSlot } from '../../lib/casualLeave';
import { hrTone } from '../../lib/hrEdit';

/**
 * A month under the yearly balance (any number of days a month): a disc with the month's Casual Leave days in it. Solid
 * when some are approved, yellow when they only wait, an empty ring when there are none; a thin yellow arc says part of an
 * approved month still waits, and a small indigo dot that some of it came from an HR attendance edit.
 */
export function ClCountDial({
  approved,
  waiting,
  byHr = false,
  size = 32,
}: {
  approved: number;
  waiting: number;
  byHr?: boolean;
  size?: number;
}) {
  const { C: Colors, isDark } = useTheme();
  const total = approved + waiting;
  const r = size / 2 - 2;
  const c = size / 2;
  const fill = approved > 0 ? Colors.primary : waiting > 0 ? Colors.statusYellow : Colors.bgSurfaceLow;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          fill={fill}
          stroke={approved > 0 && waiting > 0 ? Colors.statusYellow : total > 0 ? fill : Colors.outlineVariant}
          strokeWidth={approved > 0 && waiting > 0 ? 2.5 : 1.5}
        />
      </Svg>
      {total > 0 && (
        <Text
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
            textAlign: 'center', textAlignVertical: 'center', lineHeight: size,
            // The dark theme's primary / yellow are light tints: dark figures on them, white on the light theme's deep ones.
            color: isDark ? '#0B1220' : '#FFFFFF', fontWeight: '800', fontSize: size * 0.36,
          }}
        >
          {halvesText(total)}
        </Text>
      )}
      {byHr && (
        <View
          style={{
            position: 'absolute', top: -1, right: -1, width: 9, height: 9, borderRadius: 4.5,
            backgroundColor: hrTone(isDark).solid, borderWidth: 1.5, borderColor: Colors.bgCard,
          }}
        />
      )}
    </View>
  );
}

/**
 * A month's Casual Leave as a small round dial: the left half is the first half-day used, the right half the second.
 * A full day fills the whole dial; nothing used leaves an empty ring. Approved is solid, waiting is a lighter tint.
 */
export function ClDial({ slots, size = 34 }: { slots: [DialSlot, DialSlot]; size?: number }) {
  const { C: Colors } = useTheme();
  const r = size / 2 - 2;
  const c = size / 2;
  const fill = (slot: DialSlot) =>
    !slot ? 'transparent' : slot.status === 'approved' ? Colors.primary : Colors.statusYellow;
  const full = slots[0]?.portion === 'full';
  const left = `M ${c} ${c - r} A ${r} ${r} 0 0 0 ${c} ${c + r} Z`;
  const right = `M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} Z`;
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} fill={Colors.bgSurfaceLow} stroke={Colors.outlineVariant} strokeWidth={1.5} />
      {full ? (
        <Circle cx={c} cy={c} r={r} fill={fill(slots[0])} opacity={slots[0]?.status === 'approved' ? 1 : 0.85} />
      ) : (
        <>
          {slots[0] && <Path d={left} fill={fill(slots[0])} opacity={slots[0].status === 'approved' ? 1 : 0.85} />}
          {slots[1] && <Path d={right} fill={fill(slots[1])} opacity={slots[1].status === 'approved' ? 1 : 0.85} />}
          {(slots[0] || slots[1]) && (
            <Line x1={c} y1={c - r} x2={c} y2={c + r} stroke={Colors.bgCard} strokeWidth={1.5} />
          )}
        </>
      )}
    </Svg>
  );
}
