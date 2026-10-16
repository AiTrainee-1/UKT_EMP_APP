import { Stack } from 'expo-router';

export default function HodAssignmentLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerShown: false,
      }}
    />
  );
}
