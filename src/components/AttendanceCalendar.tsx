import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { Colors } from '../constants/colors';
import { BorderRadius } from '../constants/theme';
import { AttendanceRecord } from '../hooks/useAttendance';
import { BottomSheet } from './ui/BottomSheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
// Screen padding 16×2 + card padding 16×2 = 64px
const CELL = Math.floor((width - 64) / 7);

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_BG: Record<string, string> = {
  Present: Colors.clayGreen,
  'Half Shift': Colors.clayYellow,
  Absent: Colors.clayRed,
  Late: Colors.clayYellow,
  'On Leave': Colors.clayBlue,
  Holiday: Colors.bgSurfaceMid,
  Weekend: Colors.bgSurfaceHigh,
};

const STATUS_TEXT: Record<string, string> = {
  Present: Colors.statusGreen,
  'Half Shift': Colors.statusYellow,
  Absent: Colors.statusRed,
  Late: Colors.statusYellow,
  'On Leave': Colors.primary,
  Holiday: Colors.textMuted,
  Weekend: Colors.textMuted,
};

const STATUS_ICON: Record<string, string> = {
  Present: 'check',
  'Half Shift': 'clock-time-four-outline',
  Absent: 'close',
  Late: 'alert',
  'On Leave': 'umbrella',
  Holiday: 'flag',
  Weekend: 'minus',
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
  const startPad = getDay(monthStart);

  const recordMap = new Map(records.map((r) => [r.date, r]));

  return (
    <View>
      {/* Day header */}
      <View style={styles.headerRow}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={[styles.dayLabel, { width: CELL }]}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {Array.from({ length: startPad }).map((_, i) => (
          <View key={`pad-${i}`} style={[styles.cell, { width: CELL, height: CELL }]} />
        ))}

        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const rec = recordMap.get(key);
          const bg = rec ? (STATUS_BG[rec.status] ?? Colors.bgSurfaceLow) : undefined;
          const iconColor = rec ? (STATUS_TEXT[rec.status] ?? Colors.textMuted) : undefined;
          const iconName = rec ? (STATUS_ICON[rec.status] ?? 'help') : undefined;

          return (
            <TouchableOpacity
              key={key}
              style={[styles.cell, { width: CELL, height: CELL }, bg ? { backgroundColor: bg } : styles.futureCell]}
              onPress={() => rec && setSelected(rec)}
              disabled={!rec}
              activeOpacity={0.75}
            >
              {rec && iconName && (
                <MaterialCommunityIcons name={iconName as any} size={10} color={iconColor} style={styles.cellIcon} />
              )}
              <Text style={[styles.cellNum, !rec && styles.futureNum, rec && { color: iconColor ?? '#fff' }]}>
                {format(d, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Detail sheet */}
      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title="Attendance Detail">
        {selected && (
          <View>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[selected.status] ?? Colors.bgSurfaceLow }]}>
              <MaterialCommunityIcons
                name={(STATUS_ICON[selected.status] ?? 'help') as any}
                size={20}
                color={STATUS_TEXT[selected.status] ?? Colors.textMuted}
              />
              <Text style={[styles.statusText, { color: STATUS_TEXT[selected.status] ?? Colors.textMuted }]}>
                {selected.status}
              </Text>
            </View>

            {([
              ['Date', format(new Date(selected.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')],
              ['First Punch', selected.firstIn || '—'],
              ['Last Punch', selected.lastOut || '—'],
              ['Total Punches', selected.punchCount != null ? String(selected.punchCount) : '—'],
            ] as [string, string][]).map(([label, value]) => (
              <View key={label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 8 },
  dayLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 0,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  futureCell: {
    backgroundColor: Colors.bgSurfaceLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  cellIcon: { marginBottom: 1 },
  cellNum: { fontSize: 10, fontWeight: '800' },
  futureNum: { color: Colors.outline },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    marginBottom: 16,
  },
  statusText: { fontSize: 14, fontWeight: '700' },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  detailLabel: { color: Colors.textMuted, fontSize: 14 },
  detailValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
});
