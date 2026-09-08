import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Colors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import type { AttendanceRecord } from '../hooks/useAttendance';

const makeStatusColor = (Colors: Palette): Record<string, string> => ({
  Present: Colors.statusGreen,
  Late: Colors.statusYellow,
  'Half Shift': Colors.statusYellow,
  Absent: Colors.statusRed,
  'On Leave': Colors.primary,
  Holiday: Colors.outlineVariant,
  Weekend: Colors.outlineVariant,
});

const STATUS_HEIGHT_RATIO: Record<string, number> = {
  Present: 1,
  Late: 1,
  'Half Shift': 0.55,
  'On Leave': 0.75,
  Absent: 0.15,
  Holiday: 0.1,
  Weekend: 0.1,
};

/** Hand-rolled bar chart (react-native-svg — no charting library installed
 * in this app) — one bar per day of the month, already fetched for the
 * calendar above, so this needs no extra API call. */
export function AttendanceTrendChart({ records }: { records: AttendanceRecord[] }) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const STATUS_COLOR = makeStatusColor(Colors);

  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = windowWidth - 64;
  const chartHeight = 84;
  const barGap = 2;
  const barWidth = records.length > 0
    ? Math.max(4, (chartWidth - (records.length - 1) * barGap) / records.length)
    : 4;

  if (records.length === 0) {
    return <Text style={styles.empty}>No attendance data for this month yet.</Text>;
  }

  return (
    <View>
      <Svg width={chartWidth} height={chartHeight}>
        {records.map((r, i) => {
          const ratio = STATUS_HEIGHT_RATIO[r.status] ?? 0.1;
          const barH = Math.max(3, chartHeight * ratio);
          const x = i * (barWidth + barGap);
          const y = chartHeight - barH;
          return (
            <Rect
              key={r.date}
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={2}
              fill={STATUS_COLOR[r.status] ?? Colors.outlineVariant}
            />
          );
        })}
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>1</Text>
        <Text style={styles.axisLabel}>{records.length}</Text>
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 },
  axisLabel: { color: Colors.textMuted, fontSize: 10 },
  empty: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 20 },
});
