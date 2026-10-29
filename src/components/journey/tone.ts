import { TONE_COLOR } from '../../tracking/activity';
import type { Tone } from '../../tracking/activity';
import type { Palette } from '../../theme/palettes';

export interface ToneStyle {
  /** The shared journey colour (the same hex on the map, in the timeline and in the HR portal): dots, icons, lines. */
  solid: string;
  /** A soft tint for a chip, and the text colour on it (from the active palette, so dark mode reads too). */
  bg: string;
  fg: string;
}

/** One place that turns a journey tone into colours. */
export function toneStyle(tone: Tone, C: Palette): ToneStyle {
  const solid = TONE_COLOR[tone];
  switch (tone) {
    case 'green':
      return { solid, bg: C.badgeGreenBg, fg: C.badgeGreenText };
    case 'amber':
      return { solid, bg: C.badgeYellowBg, fg: C.badgeYellowText };
    case 'purple':
      return { solid, bg: C.badgeLeaveBg, fg: C.badgeLeaveText };
    case 'blue':
      return { solid, bg: C.badgeBlueBg, fg: C.badgeBlueText };
    case 'red':
      return { solid, bg: C.badgeRedBg, fg: C.badgeRedText };
    default:
      return { solid, bg: C.badgePendingBg, fg: C.badgePendingText };
  }
}
