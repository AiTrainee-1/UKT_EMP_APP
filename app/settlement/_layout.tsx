import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/colors';

export default function SettlementLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.bgDark },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
        headerTitle: 'Advances & Loans',
        headerBackTitle: 'Back',
      }}
    />
  );
}
