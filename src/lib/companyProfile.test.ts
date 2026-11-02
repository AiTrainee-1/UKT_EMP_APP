import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ABOUT_PARAGRAPHS,
  bandVisible,
  buildStats,
  CERTIFICATIONS,
  CLIENTS,
  CONTACT,
  countUpValue,
  easeOutCubic,
  formatIndian,
  FOUNDED_YEAR,
  GROUP_COMPANIES,
  makeThreads,
  mapsUrl,
  MARQUEE_WORDS,
  marqueeOffset,
  MAX_THREADS,
  MOTTO,
  PEOPLE,
  PROCESS,
  revealReached,
  SEGMENTS,
  STICKERS,
  threadFrame,
  VISION,
  yearsSince,
} from './companyProfile.ts';

test('years since founding are computed from today, never hard-coded', () => {
  assert.equal(FOUNDED_YEAR, 1993);
  assert.equal(yearsSince(1993, new Date(2026, 10, 2)), 33);
  assert.equal(yearsSince(1993, new Date(2026, 0, 1)), 33);
  assert.equal(yearsSince(1993, new Date(2027, 5, 1)), 34);
  assert.equal(yearsSince(1993, new Date(1993, 6, 1)), 0);
  // A phone with a broken clock never shows a negative age.
  assert.equal(yearsSince(1993, new Date(1980, 0, 1)), 0);
});

test('the stats row follows the clock and keeps the true figures', () => {
  const stats = buildStats(new Date(2026, 10, 2));
  const byKey = Object.fromEntries(stats.map((s) => [s.key, s]));
  assert.equal(stats.length, 6);
  assert.equal(byKey.years.value, 33);
  assert.equal(byKey.pieces.value, 400000);
  assert.equal(byKey.segments.value, 3);
  assert.equal(byKey.embroidery.value, 20);
  assert.equal(byKey.group.value, GROUP_COMPANIES.length);
  assert.equal(byKey.certs.value, CERTIFICATIONS.length);
  assert.equal(buildStats(new Date(2030, 0, 1)).find((s) => s.key === 'years')?.value, 37);
  // Screen readers hear the final figure, in words they can follow.
  assert.match(byKey.pieces.spoken, /4,00,000/);
  assert.match(byKey.years.spoken, /33 years/);
  for (const s of stats) assert.ok(s.caption.length > 0 && s.spoken.length > 0, s.key);
});

test('numbers use Indian digit grouping', () => {
  assert.equal(formatIndian(0), '0');
  assert.equal(formatIndian(7), '7');
  assert.equal(formatIndian(999), '999');
  assert.equal(formatIndian(1000), '1,000');
  assert.equal(formatIndian(99999), '99,999');
  assert.equal(formatIndian(400000), '4,00,000');
  assert.equal(formatIndian(1234567), '12,34,567');
  assert.equal(formatIndian(123456789), '12,34,56,789');
  assert.equal(formatIndian(-400000), '-4,00,000');
  assert.equal(formatIndian(1999.6), '2,000');
  assert.equal(formatIndian(Number.NaN), '0');
});

test('a count-up rises steadily, stays whole, never overshoots and lands exactly on the target', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(2), 1);
  assert.equal(easeOutCubic(-1), 0);
  for (const target of [3, 5, 20, 33, 400000]) {
    let prev = -1;
    for (let i = 0; i <= 60; i++) {
      const v = countUpValue(target, i / 60);
      assert.ok(Number.isInteger(v), `${target} @${i}`);
      assert.ok(v >= prev && v <= target, `${target} @${i}: ${v}`);
      prev = v;
    }
    assert.equal(countUpValue(target, 0), 0);
    assert.equal(countUpValue(target, 1), target);
    assert.equal(countUpValue(target, 1.5), target);
  }
});

test('a section reveals once it rises into the lower part of the screen, and not before it is laid out', () => {
  assert.equal(revealReached(-1, 0, 800), false);
  assert.equal(revealReached(100, 0, 0), false);
  assert.equal(revealReached(100, 0, 800), true);
  assert.equal(revealReached(700, 0, 800), false); // 700 is below 86% of 800 (688)
  assert.equal(revealReached(700, 20, 800), true);
  assert.equal(revealReached(2000, 1300, 800), false); // 1300 + 688 = 1988: not yet
  assert.equal(revealReached(2000, 1320, 800), true);
});

test('a band counts as visible only while some of it is on screen', () => {
  assert.equal(bandVisible(-1, 100, 0, 800), false);
  assert.equal(bandVisible(0, 0, 0, 800), false);
  assert.equal(bandVisible(0, 600, 0, 800), true);
  assert.equal(bandVisible(0, 600, 600, 800), false); // scrolled exactly past it
  assert.equal(bandVisible(0, 600, 599, 800), true);
  assert.equal(bandVisible(900, 200, 0, 800), false); // still below the fold
  assert.equal(bandVisible(900, 200, 101, 800), true);
});

test('a marquee track always covers the window and wraps seamlessly', () => {
  const w = 1200;
  assert.equal(marqueeOffset(0, 30, w), 0);
  assert.equal(marqueeOffset(10, 30, w), -300);
  assert.equal(marqueeOffset(40, 30, w), 0); // exactly one copy travelled: back to the start
  assert.equal(marqueeOffset(0, 30, 0), 0); // not measured yet: stand still
  for (let s = 0; s < 200; s += 0.7) {
    const left = marqueeOffset(s, 30, w);
    const right = marqueeOffset(s, 30, w, true);
    assert.ok(left <= 0 && left > -w, `left ${s}`);
    assert.ok(right <= 0 && right > -w, `right ${s}`);
  }
  // Right-moving: offsets increase over time (until they wrap).
  assert.ok(marqueeOffset(1, 30, w, true) > marqueeOffset(0.5, 30, w, true));
});

test('the drifting threads are capped, deterministic and stay within sensible bounds', () => {
  assert.equal(makeThreads(100).length, MAX_THREADS);
  assert.ok(MAX_THREADS <= 24);
  assert.equal(makeThreads(-3).length, 0);
  assert.deepEqual(makeThreads(16), makeThreads(16));
  assert.notDeepEqual(makeThreads(16, 1), makeThreads(16, 2));
  const threads = makeThreads(16);
  for (const t of threads) {
    assert.ok(t.x >= 0 && t.x <= 1);
    assert.ok(t.length >= 14 && t.length <= 40);
    assert.ok(t.speed > 0 && t.speed < 0.1, 'slow: at least ten seconds per fall');
    assert.ok(t.alpha > 0 && t.alpha <= 1);
    for (let s = 0; s < 120; s += 3.3) {
      const f = threadFrame(t, s, 600);
      assert.ok(f.y >= -t.length - 20 && f.y <= 600 + 20, `y ${f.y}`);
      assert.ok(Math.abs(f.x) <= t.sway);
      assert.ok(f.opacity >= 0 && f.opacity <= 1);
    }
  }
  // Spread across the width: one per column.
  const xs = threads.map((t) => t.x);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1]);
});

test('the content matches the company website', () => {
  assert.equal(PROCESS.length, 7);
  assert.deepEqual(PROCESS.map((p) => p.no), ['01', '02', '03', '04', '05', '06', '07']);
  assert.deepEqual(PROCESS.map((p) => p.title), ['Sampling', 'Merchandising', 'Production', 'Embroidery', 'Printing', 'Value additions', 'Logistics']);
  assert.deepEqual(SEGMENTS.map((s) => s.title), ['Men', 'Women', 'Children']);
  assert.deepEqual(GROUP_COMPANIES, ['UK Textiles', 'Exult Clothing Company', 'Vyshak Garments']);
  assert.deepEqual([...CERTIFICATIONS].sort(), ['Disney', 'OEKO-TEX Standard 100', 'SA 8000', 'Sedex', 'WRAP']);
  assert.deepEqual(CLIENTS, ['Diesel', 'K&L Ruppert', 's.Oliver', "Levi's", "Marc O'Polo"]);
  assert.equal(VISION.length, 4, 'four aims, then the motto as the fifth point');
  assert.match(MOTTO.lead + MOTTO.accent, /on time, every time\.$/);
  assert.equal(PEOPLE.length, 6);
  assert.deepEqual(PEOPLE.map((p) => p.no), ['01', '02', '03', '04', '05', '06']);
  assert.ok(ABOUT_PARAGRAPHS.join(' ').includes('1993'));
  assert.ok(ABOUT_PARAGRAPHS.join(' ').includes('Tirupur'));
  assert.equal(STICKERS.length, 3);
  assert.ok(STICKERS.some((s) => s.text.includes('4,00,000')));
  // The "N1.0x" codes are decoration: screen readers hear plain words, never "pcs".
  for (const s of STICKERS) assert.ok(s.spoken && !/N1\.|pcs/i.test(s.spoken), s.code);
  assert.ok(MARQUEE_WORDS.includes('ON TIME, EVERY TIME'));
  for (const list of [PROCESS, PEOPLE]) {
    for (const item of list) assert.ok(item.title && item.body, item.no);
  }
});

test('contact details dial, mail and map correctly', () => {
  assert.equal(CONTACT.phoneDial.replace(/\D/g, ''), CONTACT.phoneDisplay.replace(/\D/g, ''));
  assert.match(CONTACT.email, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
  assert.equal(CONTACT.websiteUrl, `https://${CONTACT.website}`);
  assert.ok(CONTACT.addressLines.join(' ').includes('641603'));
  const url = mapsUrl();
  assert.ok(url.startsWith('https://www.google.com/maps/search/?api=1&query='));
  assert.ok(decodeURIComponent(url).includes('Sivakami Nagar Main Road'));
});
