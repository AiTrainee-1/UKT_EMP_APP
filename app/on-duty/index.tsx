import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { useAuth } from '../../src/hooks/useAuth';
import { useOnDutySessionStatus } from '../../src/hooks/useGeoAttendance';
import { useOnDutyHistory } from '../../src/hooks/useOnDutyHistory';
import { OnDutyApplyFlow } from '../../src/components/onduty/OnDutyApplyFlow';
import { OnDutyModeSwitch, type OnDutyMode } from '../../src/components/onduty/OnDutyModeSwitch';
import { OnDutyRecords } from '../../src/components/onduty/OnDutyRecords';
import { useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';

/**
 * On-Duty (owner, 2026-10-31): two primary options, Apply On-Duty and View Records.
 *
 * Apply On-Duty is the existing request form and the live day (approval, four geo-punches, done), unchanged
 * (src/components/onduty/OnDutyApplyFlow.tsx). It is where the page opens, so every link to /on-duty still lands on a
 * running day straight away; a running day turns the first card into "Today's On-Duty" with a live dot.
 * View Records is the employee's own requests in the four views. `/on-duty?view=records` opens on the records.
 */
export default function OnDutyScreen() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ view?: string }>();
  const [mode, setModeState] = useState<OnDutyMode>(params.view === 'records' ? 'records' : 'apply');
  const [recordsOpened, setRecordsOpened] = useState(mode === 'records');
  const setMode = (next: OnDutyMode) => {
    if (next === 'records') setRecordsOpened(true);
    setModeState(next);
  };

  const { user } = useAuth();
  // The same cached queries the two bodies use: no extra request.
  const { data: status } = useOnDutySessionStatus();
  const { data: history } = useOnDutyHistory(user?.employeeId ?? null);

  const session = status?.session ?? null;
  const live = !!session && (session.status === 'active' || session.status === 'pending_hod' || session.status === 'pending_hr');
  const punched = new Set(
    (status?.punchVerifications ?? []).filter((v) => v.status !== 'rejected').map((v) => v.punchNumber),
  ).size;
  const applyNote = live
    ? `Day in progress · ${punched} of 4 punches`
    : session?.status === 'completed'
      ? 'Today’s day is done · start another'
      : 'Start a new request';
  const counts = history?.pages[0]?.counts;
  const recordsNote = counts
    ? [counts.waiting ? `${counts.waiting} waiting` : null, `${counts.month} sent this month`].filter(Boolean).join(' · ')
    : 'Your past requests';

  const header = (
    <OnDutyModeSwitch value={mode} onChange={setMode} applyNote={applyNote} recordsNote={recordsNote} live={live} />
  );

  // Both bodies stay mounted once opened (the hidden one is only hidden), so looking at the records never loses a
  // half-typed request or a punch being captured.
  return (
    <View style={styles.fill}>
      <View style={[styles.fill, mode !== 'apply' && styles.hidden]}>
        <OnDutyApplyFlow header={header} />
      </View>
      {(mode === 'records' || recordsOpened) && (
        <SafeAreaView style={[styles.safe, mode !== 'records' && styles.hidden]} edges={['bottom']}>
          <OnDutyRecords header={header} onApply={() => setMode('apply')} />
        </SafeAreaView>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bgLight },
  safe: { flex: 1, backgroundColor: C.bgLight },
  hidden: { display: 'none' },
});
