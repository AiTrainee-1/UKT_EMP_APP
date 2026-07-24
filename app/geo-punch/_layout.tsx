import { Stack } from 'expo-router';

export default function GeoPunchLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: '#006496' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800', color: '#fff' },
        headerTitle: 'Attendance Request',
        headerBackTitle: 'Back',
      }}
    />
  );
}
