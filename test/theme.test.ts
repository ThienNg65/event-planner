import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES, THEME_SWATCH } from '../shared/utils/theme.ts';

const css = readFileSync(new URL('../app/assets/css/themes.css', import.meta.url), 'utf8');
const locales = ['vi', 'en'].map((l) => JSON.parse(readFileSync(new URL(`../i18n/locales/${l}.json`, import.meta.url), 'utf8')));

test('every theme has a light and a dark CSS block, a picker swatch and a name in both languages', () => {
  for (const k of THEMES) {
    assert.ok(css.includes(`[data-theme='${k}'] {`), `${k}: light block`);
    assert.ok(css.includes(`.dark[data-theme='${k}']`), `${k}: dark block`);
    assert.equal(THEME_SWATCH[k].length, 2, `${k}: swatch`);
    for (const l of locales) assert.ok(l.theme[k], `${k}: name`);
  }
});
