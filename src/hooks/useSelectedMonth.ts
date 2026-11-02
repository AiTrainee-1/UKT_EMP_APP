import { useCallback, useState } from 'react';

import { currentMonth, type CalMonth } from '../lib/monthSwitch';

/**
 * The month a records screen shows (its MonthSwitcher). Until the employee picks one it is the current month, read at
 * every render: a tab that stays mounted across midnight on the last day moves on to the new month by itself.
 */
export function useSelectedMonth(): [CalMonth, (month: CalMonth) => void] {
  const [picked, setPicked] = useState<CalMonth | null>(null);
  const pick = useCallback((month: CalMonth) => setPicked({ year: month.year, month: month.month }), []);
  return [picked ?? currentMonth(), pick];
}
