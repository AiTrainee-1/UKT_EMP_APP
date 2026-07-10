import { Stack } from 'expo-router';

export default function SalaryLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: '#006496' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800', color: '#fff' },
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Salary Slips' }} />
      <Stack.Screen name="[id]" options={{ title: 'Salary Slip Detail' }} />
    </Stack>
  );
}
