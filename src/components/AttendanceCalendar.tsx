import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { Colors } from '../constants/colors';
import { AttendanceRecord } from '../hooks/useAttendance';
import { BottomSheet } from './ui/BottomSheet';

const { width } = Dimensions.get('window');
// Screen content padding (16×2) + calendarCard padding (16×2) = 64px total consumed
// No margin or gap on cells — exact 7-per-row layout
const CELL = Math.floor((width - 64) / 7);

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_COLOR: Record<string, string> = {
  Present: Colors.statusGreen,
  Absent: Colors.statusRed,
  Late: Colors.statusYellow,
  'On Leave': Colors.statusBlue,
  Holiday: Colors.statusGrey,
  Weekend: Colors.statusGrey,
};

interface Props {
  records: AttendanceRecord[];
  month: number;
  year: number;
}

export function AttendanceCalendar({ records, month, year }: Props) {
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);

  const monthStart = new Date(year, month - 1, 1);
  const days = eachDayOfInterval({ start: startOfMonth(monthStart), end: endOfMonth(monthStart) });
  const startPad = getDay(monthStart); // 0=Sun

  // Backend now sends all past days with explicit statuses; future days are filtered out.
  const recordMap = new Map(records.map((r) => [r.date, r]));

  return (
    <View>
      {/* Day header row */}
      <View style={styles.headerRow}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={[styles.dayLabel, { width: CELL }]}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.grid}>
        {/* Leading blank cells */}
        {Array.from({ length: startPad }).map((_, i) => (
          <View key={`pad-${i}`} style={[styles.cell, { width: CELL, height: CELL }]} />
        ))}

        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const rec = recordMap.get(key);
          const bgColor = rec ? (STATUS_COLOR[rec.status] ?? Colors.bgCard) : undefined;
          const isFuture = !rec;

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.cell,
                { width: CELL, height: CELL },
                bgColor ? { backgroundColor: bgColor } : styles.futureCell,
              ]}
              onPress={() => rec && setSelected(rec)}
              disabled={!rec}
              activeOpacity={0.7}
            >
              <Text style={[styles.cellNum, isFuture && styles.futureNum]}>
                {format(d, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { label: 'Present', color: Colors.statusGreen },
          { label: 'Absent', color: Colors.statusRed },
          { label: 'Late', color: Colors.statusYellow },
          { label: 'Leave', color: Colors.statusBlue },
          { label: 'Holiday', color: Colors.statusGrey },
        ].map(({ label, color }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Detail bottom sheet */}
      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title="Attendance Detail">
        {selected && (
          <View>
            {([
              ['Date', format(new Date(selected.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')],
              ['Status', selected.status],
              ['First Punch', selected.firstIn || '—'],
              ['Last Punch', selected.lastOut || '—'],
              ['Total Punches', selected.punchCount != null ? String(selected.punchCount) : '—'],
            ] as [string, string][]).map(([label, value]) => (
              <View key={label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={[
                  styles.detailValue,
                  label === 'Status' ? { color: STATUS_COLOR[value] ?? Colors.textPrimary } : undefined,
                ]}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  dayLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center', flexShrink: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  futureCell: { borderWidth: 1, borderColor: Colors.border },
  cellNum: { color: '#fff', fontSize: 11, fontWeight: '700' },
  futureNum: { color: Colors.textMuted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: Colors.textMuted, fontSize: 11 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailLabel: { color: Colors.textMuted, fontSize: 14 },
  detailValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
});
