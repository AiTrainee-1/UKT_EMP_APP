import { Stack } from 'expo-router';

export default function OnDutyLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: '#1E3A8A' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800', color: '#fff' },
        headerTitle: 'On-Duty',
        headerBackTitle: 'Back',
      }}
    />
  );
}
