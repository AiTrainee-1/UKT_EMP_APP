import { Stack } from 'expo-router';

export default function ResignationLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="warning" />
      <Stack.Screen name="survey" />
      <Stack.Screen name="confirm" />
      <Stack.Screen name="success" options={{ gestureEnabled: false }} />
      <Stack.Screen name="deactivated" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
