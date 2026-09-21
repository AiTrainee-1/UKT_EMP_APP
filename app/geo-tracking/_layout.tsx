import { Stack } from 'expo-router';

export default function GeoTrackingLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerShown: false,
      }}
    />
  );
}
