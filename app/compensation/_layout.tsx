import { Stack } from 'expo-router';

export default function CompensationLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerShown: false,
      }}
    />
  );
}
