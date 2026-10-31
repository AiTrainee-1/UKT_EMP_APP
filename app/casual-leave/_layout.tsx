import { Stack } from 'expo-router';

export default function CasualLeaveLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerShown: false,
      }}
    />
  );
}
