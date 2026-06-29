import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/colors';

export default function SalaryLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.bgDark },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Salary Slips' }} />
      <Stack.Screen name="[id]" options={{ title: 'Salary Slip Detail' }} />
    </Stack>
  );
}
