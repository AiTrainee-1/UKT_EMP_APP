import { Stack } from 'expo-router';

export default function SettlementLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: '#006496' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800', color: '#fff' },
        headerTitle: 'Advances & Loans',
        headerBackTitle: 'Back',
      }}
    />
  );
}
