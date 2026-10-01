import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { Colors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { AttendanceRecord } from '../hooks/useAttendance';
import type { DetectionFlags } from '../hooks/useShiftStats';
import { getRequestWindow } from '../lib/requestWindow';
import type { RequestWindow } from '../lib/requestWindow';
import { BottomSheet } from './ui/BottomSheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
// Screen padding 16×2 + card padding 16×2 = 64px
const CELL = Math.floor((width - 64) / 7);

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const makeStatusBg = (Colors: Palette): Record<string, string> => ({
  Present: Colors.clayGreen,
  'Half Day': Colors.clayOrange,
  Absent: Colors.clayRed,
  'Late-In': Colors.clayYellow,
  // Early-Out has no soft tint of its own; the Leave-purple badge tint keeps it
  // apart from Late-In's yellow and Half Day's orange.
  'Early-Out': Colors.badgeLeaveBg,
  Permission: Colors.clayBlue,
  'On Leave': Colors.clayBlue,
  Holiday: Colors.bgSurfaceMid,
  Weekend: Colors.bgSurfaceHigh,
});

const makeStatusText = (Colors: Palette): Record<string, string> => ({
  Present: Colors.statusGreen,
  'Half Day': Colors.statusOrange,
  Absent: Colors.statusRed,
  'Late-In': Colors.statusYellow,
  'Early-Out': Colors.statusLeave,
  Permission: Colors.statusBlue,
  'On Leave': Colors.primary,
  Holiday: Colors.textMuted,
  Weekend: Colors.textMuted,
});

// A cell's fill alone isn't always enough (Half Day's orange and Late-In's
// yellow sit close on the wheel) — every status also gets a vivid-toned
// border ring, so the cell reads as a distinct outlined shape and not just a
// flat wash of colour. Holiday/Weekend deliberately have no ring: they are
// not attendance outcomes, and a ring around every non-future cell would
// erase the contrast a ring is meant to add.
const makeStatusBorder = (Colors: Palette): Record<string, string> => ({
  Present: Colors.statusGreen,
  'Half Day': Colors.statusOrange,
  Absent: Colors.statusRed,
  'Late-In': Colors.statusYellow,
  'Early-Out': Colors.statusLeave,
  Permission: Colors.statusBlue,
  'On Leave': Colors.statusBlue,
});

const STATUS_ICON: Record<string, string> = {
  Present: 'check',
  'Half Day': 'clock-time-four-outline',
  Absent: 'close',
  'Late-In': 'alert',
  'Early-Out': 'logout',
  Permission: 'hand-back-right-outline',
  'On Leave': 'umbrella',
  Holiday: 'flag',
  Weekend: 'minus',
};

// The day's facts beyond its one-word status, as small chips in the detail
// sheet. Late-In / Early-Out / excess permissions are the three kinds of
// occurrence that share the monthly late pool, so they share the yellow (and
// Early-Out its own purple); an applied permission is the blue "Permission".
type ChipTone = 'late' | 'early' | 'permission' | 'excess';

interface DayChip {
  key: string;
  label: string;
  icon: string;
  tone: ChipTone;
}

function chipsFor(rec: AttendanceRecord, detect: DetectionFlags): DayChip[] {
  const chips: DayChip[] = [];
  // The status badge already says it when it IS the status; chip it otherwise (e.g. on a Half Day).
  // Late-In / Early-Out wording is dropped when HR has switched that check off.
  if (detect.lateIn && rec.isLate && rec.status !== 'Late-In') {
    chips.push({ key: 'late', label: 'Late-In', icon: 'clock-alert-outline', tone: 'late' });
  }
  if (detect.earlyOut && rec.isEarlyOut && rec.status !== 'Early-Out') {
    chips.push({ key: 'early', label: 'Early-Out', icon: 'logout', tone: 'early' });
  }
  if (rec.morningPermissionApplied) {
    chips.push({ key: 'am-applied', label: 'Morning permission applied', icon: 'hand-back-right-outline', tone: 'permission' });
  }
  if (rec.eveningPermissionApplied) {
    chips.push({ key: 'pm-applied', label: 'Evening permission applied', icon: 'hand-back-right-outline', tone: 'permission' });
  }
  if (rec.morningPermissionExcess) {
    chips.push({ key: 'am-excess', label: 'Morning permission: Excess', icon: 'alert-circle-outline', tone: 'excess' });
  }
  if (rec.eveningPermissionExcess) {
    chips.push({ key: 'pm-excess', label: 'Evening permission: Excess', icon: 'alert-circle-outline', tone: 'excess' });
  }
  if (rec.middlePermissionToday) {
    chips.push({ key: 'middle', label: 'Middle One-Hour', icon: 'timer-sand', tone: 'permission' });
  }
  if (rec.permissionAfternoon) {
    chips.push({ key: 'lunch', label: 'Lunch-return permission', icon: 'hand-back-right-outline', tone: 'permission' });
  }
  return chips;
}

const makeChipColors = (Colors: Palette): Record<ChipTone, { bg: string; fg: string }> => ({
  late: { bg: Colors.clayYellow, fg: Colors.statusYellow },
  early: { bg: Colors.badgeLeaveBg, fg: Colors.statusLeave },
  permission: { bg: Colors.clayBlue, fg: Colors.statusBlue },
  excess: { bg: Colors.clayYellow, fg: Colors.statusYellow },
});

interface Props {
  records: AttendanceRecord[];
  month: number;
  year: number;
  /** Which Late Detection checks the company has switched on; unknown (omitted) = both on. */
  detect?: DetectionFlags;
}

interface DayAction {
  label: string;
  icon: string;
  color: string;
  route: string;
}

/**
 * What the employee can actually DO about this day.
 *
 * Every problem status has a remedy that already exists somewhere in the
 * app, but until now the calendar only reported the problem and left them to
 * find the right screen themselves -so a wrong day mostly went unfixed.
 *
 * Returns a list, not one action, because a day can be two things at once:
 * a Half Day the employee also arrived late for needs both the missing
 * punch and the permission route offered.
 *
 * Only for a day the request forms can still take: they accept dates inside
 * the request window (this month, plus last month on its 1st and 2nd) and
 * the chips carry no date, so on a day outside it no chip is offered and
 * `closed` says so (the sheet then tells the employee to ask HR).
 */
function actionsFor(rec: AttendanceRecord, detect: DetectionFlags, w: RequestWindow): { actions: DayAction[]; closed: boolean } {
  const actions: DayAction[] = [];

  if (rec.status === 'Absent') {
    actions.push({
      label: 'Apply Leave',
      icon: 'umbrella-outline',
      color: '#8E44AD',
      route: '/(tabs)/leave',
    });
  }

  // Half Day almost always means a punch never reached the system -the
  // employee worked the day but only half of it can be proven.
  if (rec.status === 'Half Day') {
    actions.push({
      label: 'Missing Punch',
      icon: 'fingerprint',
      color: '#5E35B1',
      route: '/missing-punch',
    });
  }

  // Independent of status: a day can be Present-but-late, Early-Out, or Half
  // Day AND late, and each wants a permission request of its own.
  if ((detect.lateIn && rec.isLate) || (detect.earlyOut && rec.isEarlyOut)) {
    actions.push({
      label: 'Permission',
      icon: 'hand-pointing-right',
      color: '#2980B9',
      route: '/requests',
    });
  }

  if (actions.length > 0 && (rec.date < w.min || rec.date > w.max)) return { actions: [], closed: true };
  return { actions, closed: false };
}

const ALL_CHECKS_ON: DetectionFlags = { lateIn: true, earlyOut: true };

export function AttendanceCalendar({ records, month, year, detect = ALL_CHECKS_ON }: Props) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const STATUS_BG = makeStatusBg(Colors);
  const STATUS_TEXT = makeStatusText(Colors);
  const STATUS_BORDER = makeStatusBorder(Colors);
  const CHIP_COLORS = makeChipColors(Colors);

  const [selected, setSelected] = useState<AttendanceRecord | null>(null);

  const monthStart = new Date(year, month - 1, 1);
  const days = eachDayOfInterval({ start: startOfMonth(monthStart), end: endOfMonth(monthStart) });
  const startPad = getDay(monthStart);

  const recordMap = new Map(records.map((r) => [r.date, r]));

  // "Now" is read at render: the screen stays mounted for days and the request window moves on the 1st-3rd of a month.
  const dayActions = selected ? actionsFor(selected, detect, getRequestWindow(new Date())) : null;

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
          const borderColor = rec ? STATUS_BORDER[rec.status] : undefined;

          // A day can be Half Day/Permission AND late, early-out or carry an
          // Excess permission at once (HRMS tracks these as independent flags,
          // and all three are occurrences in the monthly late pool) — the small
          // corner dot surfaces that without needing a second status color. A
          // Late-In / Early-Out cell already says so itself.
          const showLateDot = !!rec
            && ((detect.lateIn && rec.isLate) || (detect.earlyOut && rec.isEarlyOut)
              || rec.morningPermissionExcess || rec.eveningPermissionExcess)
            && (rec.status === 'Present' || rec.status === 'Half Day' || rec.status === 'Permission');

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.cell,
                { width: CELL, height: CELL },
                bg ? { backgroundColor: bg } : styles.futureCell,
                borderColor ? { borderWidth: 1.5, borderColor } : null,
              ]}
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
              {showLateDot && <View style={styles.lateDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Detail sheet */}
      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title="Attendance Detail">
        {selected && (
          <View>
            {/* Status on the left, what-to-do-about-it on the right, on one
                row. The action belongs beside the problem it answers -at the
                bottom of the sheet it sat below four rows of detail the
                employee had already read past. */}
            <View style={styles.topRow}>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[selected.status] ?? Colors.bgSurfaceLow }]}>
                <MaterialCommunityIcons
                  name={(STATUS_ICON[selected.status] ?? 'help') as any}
                  size={18}
                  color={STATUS_TEXT[selected.status] ?? Colors.textMuted}
                />
                <Text style={[styles.statusText, { color: STATUS_TEXT[selected.status] ?? Colors.textMuted }]}>
                  {selected.status}
                </Text>
                {selected.isCompensationDay && (
                  <View style={[styles.lateBadge, { backgroundColor: Colors.clayBlue }]}>
                    <MaterialCommunityIcons name="calendar-star" size={11} color={Colors.statusBlue} />
                    <Text style={[styles.lateBadgeText, { color: Colors.statusBlue }]}>Comp Day</Text>
                  </View>
                )}
              </View>

              <View style={styles.chipRow}>
                {(dayActions?.actions ?? []).map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={[styles.chip, { borderColor: a.color + '55', backgroundColor: a.color + '12' }]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                    onPress={() => {
                      // Close first -leaving the sheet open behind a pushed
                      // screen leaves it covering the new one on the way back.
                      setSelected(null);
                      router.push(a.route as any);
                    }}
                  >
                    <MaterialCommunityIcons name={a.icon as any} size={13} color={a.color} />
                    <Text style={[styles.chipText, { color: a.color }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* A problem day the request forms can no longer take: no chips above, only where to go instead. */}
            {dayActions?.closed && (
              <Text style={styles.flagNote}>This day is closed for requests. Ask HR to correct it.</Text>
            )}

            {/* Everything that happened beyond the one-word status: late / early /
                permission applied / excess. Compact chips, then the server's
                own reason text when it sent one. */}
            {(() => {
              const chips = chipsFor(selected, detect);
              const excess = selected.morningPermissionExcess || selected.eveningPermissionExcess;
              return (
                <>
                  {chips.length > 0 && (
                    <View style={styles.flagRow}>
                      {chips.map((c) => (
                        <View key={c.key} style={[styles.flagChip, { backgroundColor: CHIP_COLORS[c.tone].bg }]}>
                          <MaterialCommunityIcons name={c.icon as any} size={12} color={CHIP_COLORS[c.tone].fg} />
                          <Text style={[styles.flagChipText, { color: CHIP_COLORS[c.tone].fg }]}>{c.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* Shown whenever the server sent one (plain-language deadline explanation). */}
                  {!!selected.lateReason && <Text style={styles.flagNote}>{selected.lateReason}</Text>}
                  {excess && (
                    <Text style={styles.flagNote}>
                      An Excess permission is one approved beyond your monthly limit: it does not protect the day and
                      counts toward late deductions.
                    </Text>
                  )}
                </>
              );
            })()}

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

const makeStyles = (Colors: Palette) => StyleSheet.create({
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
  lateDot: {
    position: 'absolute',
    top: 3, right: 3,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.statusYellow,
    borderWidth: 1, borderColor: '#fff',
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  statusText: { fontSize: 13.5, fontWeight: '700' },
  lateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: '#fff',
  },
  lateBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.statusYellow },

  // Day-detail flag chips (late / early / permission / excess) + their notes
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  flagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  flagChipText: { fontSize: 11, fontWeight: '800' },
  flagNote: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16, marginBottom: 8 },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  detailLabel: { color: Colors.textMuted, fontSize: 14 },
  detailValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  // Wraps under the badge on narrow screens or when a day carries two
  // actions, rather than squeezing the status text.
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1, justifyContent: 'flex-end' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: 11.5, fontWeight: '800' },
});
