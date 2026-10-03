import { AuthColors } from './authTheme';
import { LIGHTFALL_BUNDLE } from './lightfall.bundle.generated';

/** The Lightfall settings for the login header. Same props as the React Bits component (see scripts/lightfall). */
export const AUTH_LIGHTFALL = {
  colors: AuthColors.streaks,
  backgroundColor: AuthColors.glow,
  speed: 1,
  streakCount: 6,
  streakWidth: 1,
  streakLength: 1,
  glow: 0.85,
  density: 1,
  twinkle: 1,
  zoom: 2,
  backgroundGlow: 1,
  opacity: 1,
  mouseInteraction: false, // a phone has no cursor
  // A light render: the header is soft light, so a fraction of the screen's pixels is plenty and saves the battery.
  dpr: 0.7,
  fps: 30,
};

/**
 * The page the WebView (or, on web, an iframe) shows: the header gradient as the page background, with the Lightfall canvas
 * blended over it ('screen': the canvas's black becomes see-through and only the light streaks show).
 */
export function lightfallHtml(config = AUTH_LIGHTFALL): string {
  const [a, b, c] = AuthColors.gradient;
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
    '<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;' +
    `background:linear-gradient(160deg,${a} 0%,${b} 55%,${c} 100%)}` +
    '#root{position:absolute;inset:0}#root canvas{mix-blend-mode:screen}</style></head>' +
    '<body><div id="root"></div>' +
    `<script>window.__LF_CONFIG=${JSON.stringify(config)};</script>` +
    `<script>${LIGHTFALL_BUNDLE}</script></body></html>`
  );
}
