import { Stack } from 'expo-router';

export default function TrackingSetupLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerShown: false,
      }}
    />
  );
}
