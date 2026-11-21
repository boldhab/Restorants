import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const source = await readFile(
  new URL('../apps/web/src/styles/tokens.css', import.meta.url),
  'utf8'
);
const tokens = Object.fromEntries(
  [...source.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((m) => [m[1], m[2]])
);
const luminance = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const pairs = [
  ['primary', 'surface', 4.5],
  ['primary-hover', 'surface', 4.5],
  ['primary', 'primary-light', 4.5],
  ['text-primary', 'surface', 4.5],
  ['text-secondary', 'surface', 4.5],
  ['text-secondary', 'surface-muted', 4.5],
  ['success', 'success-light', 4.5],
  ['warning', 'warning-light', 4.5],
  ['error', 'error-light', 4.5],
  ['info', 'info-light', 4.5],
  ['control-border', 'surface', 3],
  ['focus', 'surface', 3],
  ['brand', 'surface', 3],
  ...['forest', 'navy', 'terracotta'].flatMap((theme) => [
    [`storefront-${theme}`, 'surface', 4.5],
    [`storefront-${theme}-ink`, 'surface', 4.5],
  ]),
];
const results = pairs.map(([foreground, background, minimum]) => {
  const fg = tokens['color-' + foreground],
    bg = tokens['color-' + background];
  assert.ok(fg && bg, `Missing pair ${foreground}/${background}`);
  const x = luminance(fg),
    y = luminance(bg),
    ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  assert.ok(ratio >= minimum, `${foreground}/${background}: ${ratio} below ${minimum}`);
  return { foreground, background, ratio: Number(ratio.toFixed(3)), minimum, pass: true };
});
assert.equal(tokens['color-background'], '#ffffff');
assert.equal(tokens['color-surface'], '#ffffff');
await mkdir(new URL('../artifacts/ember-theme/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../artifacts/ember-theme/contrast.json', import.meta.url),
  JSON.stringify(results, null, 2) + '\n'
);
console.log(
  JSON.stringify(
    {
      checks: results.length,
      passed: results.length,
      primaryWhite: results[0].ratio,
      controlWhite: results.find((r) => r.foreground === 'control-border').ratio,
    },
    null,
    2
  )
);
