import { Stack } from 'expo-router';

export default function CompanyLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: '#006496' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800', color: '#fff' },
        headerTitle: 'About Us',
        headerBackTitle: 'Back',
      }}
    />
  );
}
