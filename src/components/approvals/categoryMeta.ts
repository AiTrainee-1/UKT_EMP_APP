import type { Palette } from '../../theme/palettes';
import { CATEGORY_LABEL, type ApprovalCategory, type ApprovalStatus } from '../../lib/approvalsHistory';

export interface CategoryMeta {
  label: string;
  /** What the decision sheet is titled ("Leave Request", "Resignation Request"). */
  sheetTitle: string;
  icon: string;
  /** The category's accent (chip text, active rail pill) and its soft background. */
  color: string;
  bg: string;
}

/** Icon and colours per category, from the active theme. */
export function categoryMeta(Colors: Palette): Record<ApprovalCategory, CategoryMeta> {
  const m = (category: ApprovalCategory, icon: string, color: string, bg: string): CategoryMeta => ({
    label: CATEGORY_LABEL[category],
    sheetTitle: category === 'resignation' ? 'Resignation Request' : `${CATEGORY_LABEL[category]} Request`,
    icon,
    color,
    bg,
  });
  return {
    leave: m('leave', 'umbrella-outline', Colors.primary, Colors.primaryFixed),
    permission: m('permission', 'hand-wave-outline', Colors.categoryPermission, Colors.badgeBlueBg),
    casualLeave: m('casualLeave', 'calendar-star', Colors.secondary, Colors.secondaryFixed),
    attendance: m('attendance', 'calendar-edit', Colors.statusGreen, Colors.badgeGreenBg),
    missingPunch: m('missingPunch', 'fingerprint', Colors.categoryPunch, Colors.badgeLeaveBg),
    onDuty: m('onDuty', 'map-marker-path', Colors.categoryOnDuty, Colors.badgeYellowBg),
    outpass: m('outpass', 'exit-run', Colors.categoryOutpass, Colors.badgeBlueBg),
    // Holiday / Sunday work compensation claims HR raised for the team.
    holidayWork: m('holidayWork', 'briefcase-clock-outline', Colors.categoryDocs, Colors.badgeGreenBg),
    resignation: m('resignation', 'file-sign', Colors.badgeRedText, Colors.badgeRedBg),
  };
}

export interface StatusMeta {
  label: string;
  icon: string;
  color: string;
  bg: string;
}

export function statusMeta(Colors: Palette): Record<ApprovalStatus, StatusMeta> {
  return {
    pending: { label: 'Pending', icon: 'timer-sand', color: Colors.statusYellow, bg: Colors.badgeYellowBg },
    approved: { label: 'Approved', icon: 'check-circle-outline', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
    rejected: { label: 'Rejected', icon: 'close-circle-outline', color: Colors.statusRed, bg: Colors.badgeRedBg },
  };
}
