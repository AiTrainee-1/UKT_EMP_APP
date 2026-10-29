import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { TabularNums } from '../../constants/typography';
import type { FlowStep } from '../../lib/onDutyFlow';
import { StatusChip } from '../journey/StatusChip';

interface Props {
  steps: FlowStep[];
  /** What the step shows under its title when it is the one being worked on (the form, the capture panel, the action button). */
  renderBody: (step: FlowStep) => React.ReactNode;
  /** An open geo-punch other than the current one: record it now (any order). */
  onRecordSlot: (punchNumber: number) => void;
  /** Nothing can be tapped (a photo is being taken or something is being sent). */
  disabled: boolean;
  /** The current step's card laid out at this y inside the stepper (the page scrolls it into view). */
  onCurrentLayout?: (y: number) => void;
}

type Styles = ReturnType<typeof makeStyles>;

const STATE_WORD: Record<FlowStep['state'], string> = {
  done: 'Done',
  current: 'Current step',
  problem: 'Needs attention',
  skipped: 'Not recorded',
  upcoming: 'Still to come',
};

// What each step is, as a picture: the number on the hero ("Step 5 of 7") counts all seven, while the title says "Geo-punch 3".
const STEP_ICON: Record<FlowStep['key'], string> = {
  request: 'pencil-outline',
  approval: 'shield-check-outline',
  punch1: 'fingerprint',
  punch2: 'fingerprint',
  punch3: 'fingerprint',
  punch4: 'fingerprint',
  done: 'flag-checkered',
};

function Node({ step, styles, C }: { step: FlowStep; styles: Styles; C: Palette }) {
  const icon = STEP_ICON[step.key] as any;
  switch (step.state) {
    case 'done':
      return (
        <View style={[styles.node, { backgroundColor: step.warn ? C.statusYellow : C.statusGreen }]}>
          <MaterialCommunityIcons name={step.warn ? 'alert' : 'check'} size={16} color="#fff" />
        </View>
      );
    case 'current':
      return (
        <View style={styles.nodeRing}>
          <View style={[styles.node, { backgroundColor: C.primary }]}>
            <MaterialCommunityIcons name={icon} size={16} color="#fff" />
          </View>
        </View>
      );
    case 'problem':
      return (
        <View style={[styles.node, { backgroundColor: C.statusRed }]}>
          <MaterialCommunityIcons name="close" size={16} color="#fff" />
        </View>
      );
    case 'skipped':
      return (
        <View style={[styles.node, styles.nodeMuted]}>
          <MaterialCommunityIcons name="minus" size={16} color={C.textMuted} />
        </View>
      );
    default:
      return (
        <View style={[styles.node, styles.nodeUpcoming]}>
          <MaterialCommunityIcons name={icon} size={14} color={C.textMuted} />
        </View>
      );
  }
}

function Heading({ step, styles, C }: { step: FlowStep; styles: Styles; C: Palette }) {
  const current = step.state === 'current';
  const muted = step.state === 'upcoming' || step.state === 'skipped';
  return (
    <View
      style={styles.titleRow}
      accessible
      accessibilityLabel={`Step ${step.index} of 7. ${step.title}. ${STATE_WORD[step.state]}. ${step.note}${step.time ? `. ${step.time}` : ''}`}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, muted && styles.titleMuted, current && styles.titleCurrent]} numberOfLines={2}>{step.title}</Text>
          {step.badge && <StatusChip label={step.badge.label} tone={step.badge.tone} />}
        </View>
        {!!step.note && <Text style={[styles.note, muted && styles.noteMuted]}>{step.note}</Text>}
        {!!step.place && (
          <View style={styles.placeRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={13} color={C.textMuted} />
            <Text style={[styles.place, TabularNums]}>{step.place}</Text>
          </View>
        )}
      </View>
      {!!step.time && <Text style={[styles.time, TabularNums]}>{step.time}</Text>}
    </View>
  );
}

/**
 * The seven steps of an On-Duty day as one vertical list. Finished steps are compact: a check mark, the time and where it
 * happened. The current step is a highlighted card that holds the one primary action (the form, the photo slots, the button)
 * at full width. The rest are muted. An open geo-punch that is not the current one still offers "Record now" (a missed punch
 * never blocks a later one).
 */
export function OnDutyStepper({ steps, renderBody, onRecordSlot, disabled, onCurrentLayout }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const body = renderBody(step);
        const lineColor = step.state === 'done' ? C.statusGreen : C.outlineVariant;
        // A step that is capturing a punch (an open slot picked out of order) is shown open too.
        const open = step.state === 'current' || !!body;

        if (open) {
          return (
            // A different key from the compact row: the card is a new view, so its layout is reported when it appears.
            <View key={`${step.key}:open`} onLayout={step.state === 'current' ? (e) => onCurrentLayout?.(e.nativeEvent.layout.y) : undefined}>
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Node step={step} styles={styles} C={C} />
                  <View style={{ flex: 1 }}>
                    <Heading step={step} styles={styles} C={C} />
                  </View>
                </View>
                {!!body && <View style={styles.body}>{body}</View>}
              </View>
              {!last && <View style={[styles.stub, { backgroundColor: lineColor }]} />}
            </View>
          );
        }

        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.rail}>
              <Node step={step} styles={styles} C={C} />
              {!last && <View style={[styles.line, { backgroundColor: lineColor }]} />}
            </View>
            <View style={[styles.content, last && { paddingBottom: 0 }]}>
              <Heading step={step} styles={styles} C={C} />
              {step.state === 'upcoming' && step.recordable && (
                <TouchableOpacity
                  style={styles.recordNow}
                  onPress={() => onRecordSlot(step.punchNumber as number)}
                  disabled={disabled}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Record geo-punch ${step.punchNumber} now`}
                >
                  <MaterialCommunityIcons name="plus-circle-outline" size={16} color={C.primary} />
                  <Text style={styles.recordNowText}>Record now</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const RAIL = 36;
const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.border, padding: 12, paddingBottom: 14 },
    row: { flexDirection: 'row', alignItems: 'stretch' },
    rail: { width: RAIL, alignItems: 'center' },
    node: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    nodeRing: { width: RAIL, height: RAIL, borderRadius: RAIL / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryFixed },
    nodeUpcoming: { borderWidth: 2, borderColor: C.outlineVariant, backgroundColor: C.bgCard },
    nodeMuted: { backgroundColor: C.bgSurfaceLow },
    line: { flex: 1, width: 3, borderRadius: 2, marginVertical: 3, minHeight: 10 },
    // The connector between a highlighted card and the step below it, centred under the card's node.
    stub: { width: 3, height: 12, borderRadius: 2, marginLeft: RAIL / 2 - 1.5 },
    content: { flex: 1, paddingLeft: 8, paddingBottom: 14, paddingTop: 2 },
    // The card reaches 8 px into the list's padding so its node sits exactly over the rail of the other steps.
    card: { marginHorizontal: -8, marginVertical: 2, backgroundColor: C.bgSurfaceLow, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: C.primary, padding: 8, paddingRight: 10 },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, minHeight: 28, paddingTop: 2 },
    titleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    title: { fontSize: 14.5, fontWeight: '800', color: C.textPrimary, flexShrink: 1 },
    titleMuted: { color: C.textMuted, fontWeight: '700' },
    titleCurrent: { color: C.primary },
    note: { fontSize: 12.5, color: C.textSecondary, lineHeight: 17 },
    noteMuted: { color: C.textMuted },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    place: { fontSize: 11.5, color: C.textMuted },
    time: { fontSize: 12, fontWeight: '700', color: C.textSecondary, marginTop: 3 },
    body: { marginTop: 12, marginLeft: 4, gap: 10 },
    recordNow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: BorderRadius.full, backgroundColor: C.bgSurfaceLow, marginTop: 4 },
    recordNowText: { fontSize: 12.5, fontWeight: '800', color: C.primary },
  });
