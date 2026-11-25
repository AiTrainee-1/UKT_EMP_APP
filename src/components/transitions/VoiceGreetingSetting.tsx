import React, { useEffect, useSyncExternalStore } from 'react';
import { Platform, Switch } from 'react-native';

import { SettingsRow } from '../profile/ProfileParts';
import { useTheme } from '../../theme/ThemeProvider';
import { greetingName, welcomeWords } from '../../lib/authTransition';
import { speakGreeting, stopGreeting, voiceGreetingPref } from './voiceGreetingSpeaker';

/**
 * Profile > Settings: "Voice greeting on sign-in" (owner 2026-11-25), on by default and saved on the phone. Turning it
 * on says the greeting once, so the employee hears what it sounds like.
 */
export function VoiceGreetingSettingsRow({ name }: { name?: string | null }) {
  const { C, isDark } = useTheme();
  const on = useSyncExternalStore(voiceGreetingPref.subscribe, voiceGreetingPref.get);
  useEffect(() => {
    void voiceGreetingPref.load();
  }, []);

  const change = (next: boolean) => {
    voiceGreetingPref.set(next);
    if (next) speakGreeting(welcomeWords(greetingName(name)).sentence);
    else stopGreeting();
  };

  return (
    <SettingsRow
      icon={on ? 'account-voice' : 'account-voice-off'}
      label="Voice greeting on sign-in"
      sub={on ? 'Says "Welcome back" when you sign in' : 'Off'}
      tint={C.categoryChat}
      tintBg={C.badgeBlueBg}
      right={
        <Switch
          value={on}
          onValueChange={change}
          trackColor={{ false: C.bgSurfaceHighest, true: C.primary }}
          thumbColor={Platform.OS === 'android' ? (isDark ? C.primaryLight : '#FFFFFF') : undefined}
          accessibilityLabel="Voice greeting on sign-in"
        />
      }
    />
  );
}
