import { Stack } from 'expo-router';

export default function SyncLayout() {
  return <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }} />;
}
