import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { Reveal } from '../Reveal';
import { ClCountDial, ClDial } from './ClDial';
import { useReduceMotion } from '../../lib/motionPrefs';
import { hrTone } from '../../lib/hrEdit';
import {
  MONTH_LONG,
  PORTION_LABEL,
  dayMarks,
  daysText,
  longDate,
  monthWeeks,
  rowKey,
  shortDate,
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

/** The tile caption under the yearly balance: "None", "½ day", "2½ days". */
const countText = (m: YearMonth) => {
  const days = m.approvedDays + m.waitingDays;
  return days > 0 ? daysText(days) : 'None';
};

/**
 * Twelve month tiles. `dial` (the one-a-month rule, and an older server): each tile's dial says how the month's one Casual
 * Leave was taken (full / half / two halves). `count` (the yearly balance, any number a month): each tile says how many days
 * the month holds, with an indigo dot when HR's attendance edit gave / proposed some of it.
 */
export function ClYearGrid({
  months,
  year,
  selected,
  onSelect,
  mode = 'dial',
}: {
  months: YearMonth[];
  year: number;
  selected: number | null;
  onSelect: (month: number) => void;
  mode?: 'dial' | 'count';
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const now = new Date();
  return (
    <View style={styles.grid} testID="cl-year-grid">
      {months.map((m, i) => {
        const future = year > now.getFullYear() || (year === now.getFullYear() && m.month > now.getMonth() + 1);
        const current = year === now.getFullYear() && m.month === now.getMonth() + 1;
        const active = selected === m.month;
        const what =
          mode === 'count'
            ? m.approvedDays + m.waitingDays > 0
              ? `${countText(m)} of Casual Leave${m.waitingDays ? `, ${daysText(m.waitingDays)} waiting for approval` : ''}${m.byHr ? ', some given by HR' : ''}`
              : 'no Casual Leave'
            : `${m.shape === 'none' ? 'no Casual Leave' : SHAPE_TEXT[m.shape]}${m.waitingDays ? ', waiting for approval' : ''}`;
        return (
          <Reveal key={m.month} index={i} style={styles.cellWrap}>
            <TouchableOpacity
              onPress={() => onSelect(m.month)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${MONTH_LONG[m.month - 1]}: ${what}`}
              testID={`cl-month-${m.month}`}
              style={[
                styles.cell,
                current && { borderColor: Colors.primary },
                active && { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
                future && !active && { opacity: 0.5 },
              ]}
            >
              <MotiView
                animate={{ scale: active && !reduce ? 1.08 : 1 }}
                transition={{ type: 'timing', duration: reduce ? 0 : 200 }}
              >
                {mode === 'count' ? (
                  <ClCountDial approved={m.approvedDays} waiting={m.waitingDays} byHr={m.byHr} size={32} />
                ) : (
                  <ClDial slots={m.slots} size={32} />
                )}
              </MotiView>
              <Text style={[styles.month, active && { color: Colors.primary }]}>{m.short}</Text>
              {mode === 'count' ? (
                <Text style={[styles.shape, m.approvedDays + m.waitingDays > 0 && { color: Colors.textSecondary }]}>{countText(m)}</Text>
              ) : (
                <Text style={[styles.shape, m.shape !== 'none' && { color: Colors.textSecondary }]}>{SHAPE_TEXT[m.shape]}</Text>
              )}
            </TouchableOpacity>
          </Reveal>
        );
      })}
    </View>
  );
}

/**
 * The legend under the grid: what the dial colours mean. In `count` mode: approved / waiting / given by HR, and, when the
 * year holds Casual Leave from before the yearly balance began (`cutOver`), that those days are not counted in it.
 */
export function ClLegend({
  mode = 'dial',
  cutOver = null,
  notCounted = false,
}: {
  mode?: 'dial' | 'count';
  cutOver?: string | null;
  notCounted?: boolean;
}) {
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const item = (color: string, text: string, half = false) => (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }, half && styles.legendHalf]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
  if (mode === 'count') {
    return (
      <View>
        <View style={styles.legend}>
          {item(Colors.primary, 'Approved')}
          {item(Colors.statusYellow, 'Waiting')}
          {item(hrTone(isDark).solid, 'by HR (attendance edit)')}
        </View>
        {notCounted && cutOver && (
          <Text style={styles.legendNote}>
            Casual Leave before {longDate(cutOver)} followed the old one-a-month rule and is not counted in the balance.
          </Text>
        )}
      </View>
    );
  }
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

/**
 * One month as a small calendar: Casual Leave days filled, a half-day filled on its half (left = first half). The list
 * under it names each one; Casual Leave HR gave on an attendance edit says "by HR", one HR proposed and still waits
 * "proposed by HR", and one dated before the yearly balance began (`cutOver`) "Not counted".
 */
export function ClMonthCalendar({
  year,
  month,
  rows,
  cutOver = null,
}: {
  year: number;
  month: number;
  rows: CLRow[];
  cutOver?: string | null;
}) {
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const hr = hrTone(isDark);
  const marks = dayMarks(rows);
  const now = new Date();
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const parts = rows.filter((r) => r.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  return (
    <MotiView
      key={`${year}-${month}`}
      from={reduce ? undefined : { opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: reduce ? 0 : 240 }}
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
          parts.map((p) => {
            const byHr = p.source === 'hr_edit';
            const tag = byHr ? (p.kind === 'attendance_correction' ? 'proposed by HR' : 'by HR') : null;
            const notCounted = !!cutOver && p.date < cutOver && p.status !== 'rejected';
            const status = p.status === 'approved' ? 'Approved' : p.status === 'pending' ? 'Waiting' : 'Rejected';
            return (
              <View
                key={rowKey(p)}
                style={styles.partRow}
                accessible
                accessibilityLabel={`${longDate(p.date)}, ${PORTION_LABEL[p.portion]}, ${status}${tag ? `, ${tag}` : ''}${notCounted ? ', not counted in the balance' : ''}`}
              >
                <View
                  style={[
                    styles.partDot,
                    { backgroundColor: p.status === 'approved' ? Colors.primary : p.status === 'pending' ? Colors.statusYellow : Colors.statusRed },
                  ]}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.partText}>
                    {longDate(p.date)} · {PORTION_LABEL[p.portion]}
                  </Text>
                  {(tag || notCounted) && (
                    <View style={styles.tagRow}>
                      {tag && (
                        <View style={[styles.tag, { backgroundColor: hr.fill }]}>
                          <Text style={[styles.tagText, { color: hr.ink }]}>{tag}</Text>
                        </View>
                      )}
                      {notCounted && (
                        <View style={[styles.tag, { backgroundColor: Colors.bgSurfaceLow }]}>
                          <Text style={[styles.tagText, { color: Colors.textMuted }]}>Not counted (before {shortDate(cutOver!)})</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
                <Text style={[styles.partStatus, p.status === 'approved' ? styles.approved : p.status === 'pending' ? styles.waiting : styles.rejected]}>
                  {status}
                </Text>
              </View>
            );
          })
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
    legendNote: { color: Colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 4, marginBottom: 2 },

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
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
    tag: { borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
    tagText: { fontSize: 10, fontWeight: '800' },
    approved: { color: Colors.statusGreen },
    waiting: { color: Colors.statusYellow },
    rejected: { color: Colors.statusRed },
  });
