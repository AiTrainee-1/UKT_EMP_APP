import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';
import type { DialSlot } from '../../lib/casualLeave';

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
