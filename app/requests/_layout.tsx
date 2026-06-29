import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/colors';

export default function RequestsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.bgDark },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
        headerTitle: 'Permission Requests',
        headerBackTitle: 'Back',
      }}
    />
  );
}
