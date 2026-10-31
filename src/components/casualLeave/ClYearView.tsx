import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { Reveal } from '../Reveal';
import { ClDial } from './ClDial';
import {
  MONTH_LONG,
  PORTION_LABEL,
  dayMarks,
  longDate,
  monthWeeks,
  type CLRow,
  type DayMark,
  type YearMonth,
} from '../../lib/casualLeave';

const SHAPE_TEXT: Record<YearMonth['shape'], string> = {
  none: 'None',
  full: 'Full day',
  one_half: '½ day',
  two_halves: '2 halves',
};

/** Twelve month tiles, each with its dial: which months Casual Leave was taken in and how (full / half / two halves). */
export function ClYearGrid({
  months,
  year,
  selected,
  onSelect,
}: {
  months: YearMonth[];
  year: number;
  selected: number | null;
  onSelect: (month: number) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const now = new Date();
  return (
    <View style={styles.grid} testID="cl-year-grid">
      {months.map((m, i) => {
        const future = year > now.getFullYear() || (year === now.getFullYear() && m.month > now.getMonth() + 1);
        const current = year === now.getFullYear() && m.month === now.getMonth() + 1;
        const active = selected === m.month;
        return (
          <Reveal key={m.month} index={i} style={styles.cellWrap}>
            <TouchableOpacity
              onPress={() => onSelect(m.month)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${MONTH_LONG[m.month - 1]}: ${m.shape === 'none' ? 'no Casual Leave' : SHAPE_TEXT[m.shape]}${m.waitingDays ? ', waiting for approval' : ''}`}
              testID={`cl-month-${m.month}`}
              style={[
                styles.cell,
                current && { borderColor: Colors.primary },
                active && { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
                future && !active && { opacity: 0.5 },
              ]}
            >
              <MotiView
                animate={{ scale: active ? 1.08 : 1 }}
                transition={{ type: 'timing', duration: 200 }}
              >
                <ClDial slots={m.slots} size={32} />
              </MotiView>
              <Text style={[styles.month, active && { color: Colors.primary }]}>{m.short}</Text>
              <Text style={[styles.shape, m.shape !== 'none' && { color: Colors.textSecondary }]}>{SHAPE_TEXT[m.shape]}</Text>
            </TouchableOpacity>
          </Reveal>
        );
      })}
    </View>
  );
}

/** The legend under the grid: what the dial colours mean. */
export function ClLegend() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const item = (color: string, text: string, half = false) => (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }, half && styles.legendHalf]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
  return (
    <View style={styles.legend}>
      {item(Colors.primary, 'Approved')}
      {item(Colors.statusYellow, 'Waiting')}
      {item(Colors.primary, 'Half day', true)}
    </View>
  );
}

function DayCell({ day, mark, today, sunday }: { day: number; mark?: DayMark; today: boolean; sunday: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color = (s: DayMark['first']) => (s === 'approved' ? Colors.primary : s === 'pending' ? Colors.statusYellow : 'transparent');
  const marked = !!mark && (mark.first || mark.second);
  return (
    <View style={[styles.day, today && { borderColor: Colors.primary, borderWidth: 1.5 }]}>
      {marked && (
        <View style={styles.dayFill}>
          <View style={[styles.dayHalf, { backgroundColor: color(mark!.first) }]} />
          <View style={[styles.dayHalf, { backgroundColor: color(mark!.second) }]} />
        </View>
      )}
      <Text style={[styles.dayText, sunday && { color: Colors.statusRed }, marked && { color: '#fff', fontWeight: '800' }]}>
        {day}
      </Text>
    </View>
  );
}

/** One month as a small calendar: Casual Leave days filled, a half-day filled on its half (left = first half). */
export function ClMonthCalendar({ year, month, rows }: { year: number; month: number; rows: CLRow[] }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const marks = dayMarks(rows);
  const now = new Date();
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const parts = rows.filter((r) => r.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  return (
    <MotiView
      key={`${year}-${month}`}
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 240 }}
      style={styles.calCard}
      testID="cl-month-calendar"
    >
      <Text style={styles.calTitle}>
        {MONTH_LONG[month - 1]} {year}
      </Text>
      <View style={styles.week}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={[styles.weekday, i === 0 && styles.weekdaySun]}>
            {d}
          </Text>
        ))}
      </View>
      {monthWeeks(year, month).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, i) =>
            day === null ? (
              <View key={i} style={styles.day} />
            ) : (
              <DayCell
                key={i}
                day={day}
                mark={marks[`${prefix}${String(day).padStart(2, '0')}`]}
                sunday={i === 0}
                today={year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()}
              />
            ),
          )}
        </View>
      ))}
      <View style={styles.partList}>
        {parts.length === 0 ? (
          <Text style={styles.noParts}>No Casual Leave in {MONTH_LONG[month - 1]}.</Text>
        ) : (
          parts.map((p) => (
            <View key={p.id} style={styles.partRow}>
              <View
                style={[
                  styles.partDot,
                  { backgroundColor: p.status === 'approved' ? Colors.primary : p.status === 'pending' ? Colors.statusYellow : Colors.statusRed },
                ]}
              />
              <Text style={styles.partText}>
                {longDate(p.date)} · {PORTION_LABEL[p.portion]}
              </Text>
              <Text style={[styles.partStatus, p.status === 'approved' ? styles.approved : p.status === 'pending' ? styles.waiting : styles.rejected]}>
                {p.status === 'approved' ? 'Approved' : p.status === 'pending' ? 'Waiting' : 'Rejected'}
              </Text>
            </View>
          ))
        )}
      </View>
    </MotiView>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
    cellWrap: { width: '25%', padding: 4 },
    cell: {
      alignItems: 'center',
      gap: 3,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.bgCard,
    },
    month: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 12 },
    shape: { color: Colors.textMuted, fontSize: 10 },

    legend: { flexDirection: 'row', gap: 14, marginTop: 8, marginBottom: 4, justifyContent: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendHalf: { width: 5, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
    legendText: { color: Colors.textMuted, fontSize: 11 },

    calCard: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
      marginTop: 12,
    },
    calTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14, marginBottom: 8 },
    week: { flexDirection: 'row' },
    weekday: { flex: 1, textAlign: 'center', color: Colors.textMuted, fontSize: 11, fontWeight: '700', paddingVertical: 4 },
    weekdaySun: { color: Colors.statusRed },
    day: {
      flex: 1,
      aspectRatio: 1,
      margin: 2,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    dayFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
    dayHalf: { flex: 1 },
    dayText: { color: Colors.textSecondary, fontSize: 12 },

    partList: { marginTop: 10, gap: 8 },
    noParts: { color: Colors.textMuted, fontSize: 12 },
    partRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    partDot: { width: 8, height: 8, borderRadius: 4 },
    partText: { flex: 1, color: Colors.textSecondary, fontSize: 12.5 },
    partStatus: { fontSize: 11.5, fontWeight: '800' },
    approved: { color: Colors.statusGreen },
    waiting: { color: Colors.statusYellow },
    rejected: { color: Colors.statusRed },
  });
