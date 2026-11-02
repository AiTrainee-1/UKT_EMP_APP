import React, { useEffect, useState } from 'react';
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
import {
  COMPENSATION_LEGEND, COMPENSATION_ORDER, COMPENSATION_TONES, DAY_TONES, OFF_DAY_ORDER, OUTCOME_ORDER, RING,
  compensationKeyOf, compensationLabelOf, hasCompensationMarker, isCompensatedWholeDay, visualKeyOf,
  type CompensationKey, type DayTone, type DayVisualKey,
} from '../lib/attendanceVisual';
import { minutesText } from '../lib/compensation';
import type { RequestWindow } from '../lib/requestWindow';
import {
  HR_EDIT_OUTLINE, cellMarksOf, hrBadgeOf, hrEditCounts, hrEditsByDate, hrMonthLine, hrStageTitle, hrTone, isHrColoured,
  type HrEdit,
} from '../lib/hrEdit';
import { useReduceMotion } from '../lib/motionPrefs';
import { BottomSheet } from './ui/BottomSheet';
import { HrEditBadge, HrEditLegend, HrEditPanel } from './HrEditMark';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
// Screen padding 16×2 + card padding 16×2 = 64px
const CELL = Math.floor((width - 64) / 7);

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Every kind of day has its own colour (see lib/attendanceVisual.ts, the one place that decides them). Late-In and
// Early-Out are NOT colours: the day keeps the colour of what it was and a ring around the cell marks it.
function toneOf(status: string): DayTone {
  return DAY_TONES[visualKeyOf(status)];
}

const fillOf = (tone: DayTone, isDark: boolean) => (isDark ? tone.fillDark : tone.fillLight);
const inkOf = (tone: DayTone, isDark: boolean) => (isDark ? tone.inkDark : tone.inkLight);

/** Words for the day sheet: what a Sunday / holiday / casual-leave day is. */
function dayNote(rec: AttendanceRecord): string | null {
  if (rec.status === 'Holiday') {
    const type = rec.holidayType ? `${rec.holidayType.charAt(0).toUpperCase()}${rec.holidayType.slice(1)} holiday` : 'Holiday';
    return rec.holidayName ? `${rec.holidayName} · ${type}` : type;
  }
  if (rec.status === 'Weekend') return 'Sunday · weekly off';
  if (rec.status === 'Casual Leave') return 'Approved Casual Leave · paid day';
  return null;
}

// The day's facts beyond its one-word status, as small chips in the detail
// sheet. Late-In / Early-Out / excess permissions are the three kinds of
// occurrence that share the monthly late pool, so they share the yellow (and
// Early-Out its own purple); an applied permission is the blue "Permission".
type ChipTone = 'late' | 'early' | 'permission' | 'excess' | 'neutral';

interface DayChip {
  key: string;
  label: string;
  icon: string;
  tone: ChipTone;
  /** A compensation chip is coloured by its own kind (the same colours as the calendar cell). */
  comp?: CompensationKey;
}

/** The compensation the day used, first: it is what the day is about (a relaxation day or a birthday has no punches). A kind
 *  this app does not know gets a plain neutral "Compensation" chip: the server's own sentence is shown under it. */
function compensationChip(rec: AttendanceRecord): DayChip | null {
  if (!hasCompensationMarker(rec.compensationKind)) return null;
  // A birthday / relaxation day already says it in the sheet's badge (see badgeFor): no second chip with the same words.
  if (isCompensatedWholeDay(rec.compensationKind)) return null;
  const comp = compensationKeyOf(rec.compensationKind);
  if (!comp) return { key: 'comp', label: compensationLabelOf(rec.compensationKind) ?? 'Compensation', icon: 'star-four-points-outline', tone: 'neutral' };
  const tone = COMPENSATION_TONES[comp];
  // An allowance says how much of it the arrival used.
  const used = comp === 'ot_allowance' ? minutesText(rec.compensationMinutes) : null;
  return { key: 'comp', label: used ? `${tone.label} · ${used} used` : tone.label, icon: tone.icon, tone: 'neutral', comp };
}

function chipsFor(rec: AttendanceRecord, detect: DetectionFlags): DayChip[] {
  const chips: DayChip[] = [];
  const comp = compensationChip(rec);
  if (comp) chips.push(comp);
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

// The same hues as the calendar's rings (late = amber, early-out = indigo) and the Permission colour.
const makeChipColors = (isDark: boolean): Record<ChipTone, { bg: string; fg: string }> => ({
  late: { bg: `${RING.late}26`, fg: RING.late },
  early: { bg: `${RING.earlyOut}26`, fg: isDark ? '#A5B4FC' : RING.earlyOut },
  permission: { bg: fillOf(DAY_TONES.permission, isDark), fg: inkOf(DAY_TONES.permission, isDark) },
  excess: { bg: `${RING.late}26`, fg: RING.late },
  neutral: { bg: fillOf(DAY_TONES.sunday, isDark), fg: inkOf(DAY_TONES.sunday, isDark) },
});

/** The day sheet's badge: the status, except on a birthday / relaxation day, which is made up by the compensation itself
 *  (no punches): the badge says what the compensation was, and a row below says how the day is counted. */
function badgeFor(rec: AttendanceRecord, isDark: boolean): { bg: string; fg: string; icon: string; label: string } {
  const comp = isCompensatedWholeDay(rec.compensationKind) ? compensationKeyOf(rec.compensationKind) : null;
  if (comp) {
    const t = COMPENSATION_TONES[comp];
    return { bg: isDark ? t.softDark : t.softLight, fg: isDark ? t.inkDark : t.inkLight, icon: t.icon, label: t.label };
  }
  const tone = toneOf(rec.status);
  return { bg: fillOf(tone, isDark), fg: inkOf(tone, isDark), icon: tone.icon, label: rec.status === 'Weekend' ? 'Sunday' : rec.status };
}

function chipColors(
  chip: DayChip,
  base: Record<ChipTone, { bg: string; fg: string }>,
  isDark: boolean,
): { bg: string; fg: string } {
  if (!chip.comp) return base[chip.tone];
  const t = COMPENSATION_TONES[chip.comp];
  return { bg: isDark ? t.softDark : t.softLight, fg: isDark ? t.inkDark : t.inkLight };
}

interface Props {
  records: AttendanceRecord[];
  month: number;
  year: number;
  /** Which Late Detection checks the company has switched on; unknown (omitted) = both on. */
  detect?: DetectionFlags;
  /**
   * Open this day's detail sheet (a notification's View: `/(tabs)/attendance?date=YYYY-MM-DD`). `key` is new for every
   * request. Acted on once the calendar shows that day's month; `onOpenDate(found)` then says whether the day has a record.
   */
  openDate?: { date: string; key: number } | null;
  onOpenDate?: (found: boolean) => void;
  /** HR edits on days drawn empty (still to come): they get their "!" too (useAttendance `futureHrEdits`). */
  futureHrEdits?: Record<string, HrEdit>;
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
 * the request window (this month, plus last month on its 1st to 5th) and
 * the chips carry no date, so on a day outside it no chip is offered and
 * `closed` says so (the sheet then tells the employee to ask HR).
 */
function actionsFor(rec: AttendanceRecord, detect: DetectionFlags, w: RequestWindow): { actions: DayAction[]; closed: boolean } {
  const actions: DayAction[] = [];
  // A birthday or a relaxation day is made up by the compensation itself: it has no punches to be "missing", and it is no
  // absence to apply leave for.
  const covered = isCompensatedWholeDay(rec.compensationKind);

  if (rec.status === 'Absent' && !covered) {
    actions.push({
      label: 'Apply Leave',
      icon: 'umbrella-outline',
      color: '#8E44AD',
      route: '/(tabs)/leave',
    });
  }

  // Half Day almost always means a punch never reached the system -the
  // employee worked the day but only half of it can be proven.
  if (rec.status === 'Half Day' && !covered) {
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

export function AttendanceCalendar({
  records, month, year, detect = ALL_CHECKS_ON, openDate = null, onOpenDate, futureHrEdits,
}: Props) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const CHIP_COLORS = makeChipColors(isDark);
  const reduceMotion = useReduceMotion();
  const hr = hrTone(isDark);

  // The open day sheet: which day, and whether its "Edited by HR" section is unfolded (tapping the "!" opens it unfolded,
  // tapping the day opens it folded). The record is read from the current list, so a refetch shows fresh facts.
  const [sel, setSel] = useState<{ date: string; hrOpen: boolean } | null>(null);

  const recordMap = new Map(records.map((r) => [r.date, r]));
  const edits = hrEditsByDate(records, futureHrEdits);
  const selected = sel ? recordMap.get(sel.date) ?? null : null;
  const selectedEdit = sel ? edits[sel.date] ?? null : null;
  const close = () => setSel(null);

  useEffect(() => {
    if (!openDate) return;
    // Another month is still on screen (the parent is switching to the day's month): wait for it.
    if (!openDate.date.startsWith(`${year}-${String(month).padStart(2, '0')}-`)) return;
    const rec = records.find((r) => r.date === openDate.date) ?? null;
    const edit = futureHrEdits?.[openDate.date] ?? null;
    if (rec || edit) setSel({ date: openDate.date, hrOpen: !rec });
    onOpenDate?.(!!rec || !!edit);
    // only when a new day is asked for, or the month's records arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDate?.key, records, month, year]);

  const monthStart = new Date(year, month - 1, 1);
  const days = eachDayOfInterval({ start: startOfMonth(monthStart), end: endOfMonth(monthStart) });
  const startPad = getDay(monthStart);
  const editCounts = hrEditCounts(edits);
  const editLine = hrMonthLine(editCounts);

  // "Now" is read at render: the screen stays mounted for days and the request window moves on the 1st-3rd of a month.
  const dayActions = selected ? actionsFor(selected, detect, getRequestWindow(new Date())) : null;
  const badge = selected ? badgeFor(selected, isDark) : null;

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
          const tone = rec ? toneOf(rec.status) : null;
          // A day that used a compensation is SOLID in that compensation's colour with its own symbol (the status stays
          // readable in the day sheet); every ordinary status is a soft tint. See lib/attendanceVisual.ts.
          const compKey = rec ? compensationKeyOf(rec.compensationKind) : null;
          const compTone = compKey ? COMPENSATION_TONES[compKey] : null;
          // HR edits (lib/hrEdit.ts): every edit gets a "!", an APPLIED one also the "Edited by HR" tint + outline (its
          // Late-In / Early-Out then show as corner dots). The icon keeps saying what the day is.
          const edit = edits[key] ?? null;
          const hrBadge = hrBadgeOf(edit);
          const hrColoured = !!rec && isHrColoured(rec.hrEdit);
          const ink = hrColoured ? hr.ink : compTone ? '#FFFFFF' : tone ? inkOf(tone, isDark) : undefined;
          const marks = rec ? cellMarksOf(rec, detect) : null;
          const isOff = !!rec && (rec.status === 'Holiday' || rec.status === 'Weekend');
          const fill = hrColoured ? hr.fill : compTone ? compTone.solid : tone ? fillOf(tone, isDark) : undefined;
          const border = marks?.hrOutline ? hr.solid : marks?.ring ?? 'transparent';
          const dayLabel = format(d, 'd MMMM');
          // Late / early-out as the ring says it, or as the corner dots say it on an HR-coloured day.
          const markWords = marks?.ring
            ? rec?.isLate ? ', late' : ', early out'
            : marks?.hrOutline
              ? `${marks.amberDot && rec?.isLate && detect.lateIn ? ', late' : ''}${marks.earlyDot ? ', early out' : ''}`
              : '';
          const recLabel = rec
            ? `${dayLabel}, ${rec.holidayName ?? rec.status}${markWords}${compensationLabelOf(rec.compensationKind) ? `, ${compensationLabelOf(rec.compensationKind)}` : ''}`
            : dayLabel;
          const openDay = (hrOpen: boolean) => (rec || edit ? setSel({ date: key, hrOpen }) : undefined);

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.cell,
                { width: CELL, height: CELL },
                tone ? { backgroundColor: fill } : styles.futureCell,
                // A ring marks Late-In / Early-Out (no fill of its own), the indigo outline an applied HR edit. Every
                // other cell keeps a transparent border of the same size, so nothing shifts.
                tone ? { borderWidth: HR_EDIT_OUTLINE, borderColor: border } : null,
              ]}
              onPress={() => openDay(!rec)}
              disabled={!rec && !edit}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={edit ? `${recLabel}, edited by HR, ${hrStageTitle(edit)}` : recLabel}
              testID={edit ? `cal-day-${key}-hr` : undefined}
            >
              {tone && (
                <MaterialCommunityIcons name={(compTone ? compTone.icon : tone.icon) as any} size={isOff || compTone ? 12 : 10} color={ink} style={styles.cellIcon} />
              )}
              <Text style={[styles.cellNum, !rec && styles.futureNum, tone && { color: ink }]}>
                {format(d, 'd')}
              </Text>
              {marks?.earlyDot && <View style={[styles.markDot, styles.markDotBottom, { backgroundColor: RING.earlyOut }]} />}
              {marks?.amberDot && <View style={[styles.markDot, { backgroundColor: RING.late }]} />}
              {hrBadge && (
                <HrEditBadge
                  variant={hrBadge}
                  style={styles.hrBadge}
                  onPress={() => openDay(true)}
                  accessibilityLabel={`What HR changed on ${dayLabel}`}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* A month with HR edits says so under the grid (the web app's words), with what to tap. */}
      {editLine && (
        <View style={styles.hrNote} accessible accessibilityLabel={`${editLine} Tap a day with an exclamation mark to see what changed.`}>
          <HrEditBadge variant={editCounts.applied ? 'applied' : editCounts.waiting ? 'waiting' : 'rejected'} size={14} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hrNoteText}>{editLine}</Text>
            <Text style={styles.hrNoteHint}>Tap the ! on a day to see what changed.</Text>
          </View>
        </View>
      )}

      {/* Detail sheet */}
      <BottomSheet visible={!!sel && (!!selected || !!selectedEdit)} onClose={close} title="Attendance Detail">
        {/* A day drawn empty (still to come) that HR edited: only the date and the HR edit. */}
        {sel && !selected && selectedEdit && (
          <View>
            <Text style={styles.dayNote}>{format(new Date(sel.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}</Text>
            <HrEditPanel
              edit={selectedEdit}
              open={sel.hrOpen}
              onToggle={() => setSel((s) => (s ? { ...s, hrOpen: !s.hrOpen } : s))}
              reduceMotion={reduceMotion}
            />
          </View>
        )}
        {selected && badge && (
          <View>
            {/* Status on the left, what-to-do-about-it on the right, on one
                row. The action belongs beside the problem it answers -at the
                bottom of the sheet it sat below four rows of detail the
                employee had already read past. */}
            <View style={styles.topRow}>
              <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                <MaterialCommunityIcons name={badge.icon as any} size={18} color={badge.fg} />
                <Text style={[styles.statusText, { color: badge.fg }]}>{badge.label}</Text>
                {selected.isCompensationDay && (
                  <View style={[styles.lateBadge, { backgroundColor: fillOf(DAY_TONES.permission, isDark) }]}>
                    <MaterialCommunityIcons name="calendar-star" size={11} color={inkOf(DAY_TONES.permission, isDark)} />
                    <Text style={[styles.lateBadgeText, { color: inkOf(DAY_TONES.permission, isDark) }]}>Comp Day</Text>
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
                      close();
                      router.push(a.route as any);
                    }}
                  >
                    <MaterialCommunityIcons name={a.icon as any} size={13} color={a.color} />
                    <Text style={[styles.chipText, { color: a.color }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* HR edited this day (any stage): what was changed and where its approval stands. */}
            {selectedEdit && sel && (
              <HrEditPanel
                edit={selectedEdit}
                open={sel.hrOpen}
                onToggle={() => setSel((s) => (s ? { ...s, hrOpen: !s.hrOpen } : s))}
                reduceMotion={reduceMotion}
              />
            )}

            {dayNote(selected) && <Text style={styles.dayNote}>{dayNote(selected)}</Text>}

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
                      {chips.map((c) => {
                        const colors = chipColors(c, CHIP_COLORS, isDark);
                        return (
                          <View key={c.key} style={[styles.flagChip, { backgroundColor: colors.bg }]}>
                            <MaterialCommunityIcons name={c.icon as any} size={12} color={colors.fg} />
                            <Text style={[styles.flagChipText, { color: colors.fg }]}>{c.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {/* What compensation did to the day, in the server's own words (a late arrival inside an allowance, a
                      company late-in time, a birthday, a compensation day). */}
                  {!!selected.compensationNote && (
                    <Text style={[styles.compNote, compensationKeyOf(selected.compensationKind) && { borderLeftColor: COMPENSATION_TONES[compensationKeyOf(selected.compensationKind)!].solid }]}>
                      {selected.compensationNote}
                    </Text>
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
              // The badge above says what the compensation was; this says how the day is counted.
              ...(isCompensatedWholeDay(selected.compensationKind) ? [['Day counted as', selected.status]] : []),
            ] as [string, string][]).map(([label, value]) => (
              <View key={label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}

            {hasCompensationMarker(selected.compensationKind) && (
              <TouchableOpacity
                style={styles.compLink}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="See all my compensation"
                onPress={() => {
                  // Close first, as the action chips do.
                  close();
                  router.push('/compensation' as any);
                }}
              >
                <MaterialCommunityIcons name="briefcase-clock-outline" size={15} color={Colors.primary} />
                <Text style={styles.compLinkText}>See all my compensation</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.primary} />
              </TouchableOpacity>
            )}
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
  markDot: {
    position: 'absolute',
    top: 3, right: 3,
    width: 7, height: 7, borderRadius: 3.5,
    borderWidth: 1, borderColor: '#fff',
  },
  markDotBottom: { top: undefined, bottom: 3 },
  // The "!" of an HR edit: top-left, inside the cell (the dots use the right-hand corners).
  hrBadge: { position: 'absolute', top: 1, left: 1 },
  hrNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.outlineVariant,
  },
  hrNoteText: { color: Colors.textSecondary, fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  hrNoteHint: { color: Colors.textMuted, fontSize: 11, lineHeight: 15 },
  dayNote: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 10 },

  legendWrap: { marginTop: 12, gap: 10 },
  legendTitle: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7, width: '48%' },
  legendSwatch: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  legendText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', flexShrink: 1 },

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
  // The server's sentence about what compensation did to the day: a quote-style note, in the kind's colour when it is known.
  compNote: {
    color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.outlineVariant, paddingLeft: 10,
  },
  compLink: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    marginTop: 14, minHeight: 44, paddingHorizontal: 4,
  },
  compLinkText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

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

/** One row of the legend: the exact swatch a calendar cell uses (fill + icon), so they cannot drift. */
function LegendSwatch({ kind, isDark }: { kind: DayVisualKey; isDark: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const tone = DAY_TONES[kind];
  return (
    <View style={[styles.legendSwatch, { backgroundColor: fillOf(tone, isDark) }]}>
      <MaterialCommunityIcons name={tone.icon as any} size={13} color={inkOf(tone, isDark)} />
    </View>
  );
}

/** One row of the compensation legend: the exact swatch a compensation cell uses (solid colour + white symbol). */
function CompensationSwatch({ kind }: { kind: CompensationKey }) {
  const styles = useThemedStyles(makeStyles);
  const tone = COMPENSATION_TONES[kind];
  return (
    <View style={[styles.legendSwatch, { backgroundColor: tone.solid }]}>
      <MaterialCommunityIcons name={tone.icon as any} size={13} color="#FFFFFF" />
    </View>
  );
}

/**
 * What every colour on the calendar means, including the two rings and the dot.
 *
 * `showCompensation` lists the five compensation days too. It is off unless the caller says so: compensation is for staff
 * employees only (a production employee never gets a marker, so there is nothing to explain), and the caller passes true
 * only once the employee's profile has said 'staff' (isStaffEmployee in src/lib/employmentType.ts), so the section never
 * flashes up while the profile loads.
 */
export function AttendanceLegend({
  detect = ALL_CHECKS_ON,
  showCompensation = false,
}: {
  detect?: DetectionFlags;
  showCompensation?: boolean;
}) {
  const { isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ring = (color: string) => (
    <View style={[styles.legendSwatch, { backgroundColor: fillOf(DAY_TONES.present, isDark), borderWidth: 2.5, borderColor: color }]}>
      <MaterialCommunityIcons name="check" size={11} color={inkOf(DAY_TONES.present, isDark)} />
    </View>
  );
  return (
    <View style={styles.legendWrap} accessibilityLabel="Attendance colour legend">
      <Text style={styles.legendTitle}>ATTENDANCE</Text>
      <View style={styles.legendGrid}>
        {OUTCOME_ORDER.map((k) => (
          <View key={k} style={styles.legendItem}>
            <LegendSwatch kind={k} isDark={isDark} />
            <Text style={styles.legendText}>{DAY_TONES[k].label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.legendTitle}>DAYS OFF</Text>
      <View style={styles.legendGrid}>
        {OFF_DAY_ORDER.map((k) => (
          <View key={k} style={styles.legendItem}>
            <LegendSwatch kind={k} isDark={isDark} />
            <Text style={styles.legendText}>{k === 'sunday' ? 'Sunday (weekly off)' : 'Declared holiday'}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.legendTitle}>BORDER MARKS (THE DAY KEEPS ITS COLOUR)</Text>
      <View style={styles.legendGrid}>
        {detect.lateIn && (
          <View style={styles.legendItem}>
            {ring(RING.late)}
            <Text style={styles.legendText}>Late-In</Text>
          </View>
        )}
        {detect.earlyOut && (
          <View style={styles.legendItem}>
            {ring(RING.earlyOut)}
            <Text style={styles.legendText}>Early-Out</Text>
          </View>
        )}
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: fillOf(DAY_TONES.present, isDark) }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RING.late }} />
          </View>
          <Text style={styles.legendText}>Excess permission</Text>
        </View>
      </View>
      {/* HR edits: the "Edited by HR" colour (applied) and the "!" (any stage). */}
      <HrEditLegend presentFill={fillOf(DAY_TONES.present, isDark)} presentInk={inkOf(DAY_TONES.present, isDark)} />
      {showCompensation && (
        <>
          <Text style={styles.legendTitle}>COMPENSATION DAYS (SOLID COLOUR AND SYMBOL)</Text>
          <View style={styles.legendGrid}>
            {COMPENSATION_ORDER.map((k) => (
              <View key={k} style={styles.legendItem}>
                <CompensationSwatch kind={k} />
                <Text style={styles.legendText}>{COMPENSATION_LEGEND[k]}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
