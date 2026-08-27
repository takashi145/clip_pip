import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(root, 'public', '_locales');
const manifest = JSON.parse(readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8'));
const baseLocale = manifest.default_locale;

function keysOf(locale) {
  const file = path.join(localesDir, locale, 'messages.json');
  return new Set(Object.keys(JSON.parse(readFileSync(file, 'utf8'))));
}

const locales = readdirSync(localesDir);
const baseKeys = keysOf(baseLocale);
const errors = [];

for (const locale of locales) {
  if (locale === baseLocale) continue;
  const keys = keysOf(locale);

  for (const key of baseKeys) {
    if (!keys.has(key)) errors.push(`_locales/${locale} に "${key}" が無い`);
  }
  for (const key of keys) {
    if (!baseKeys.has(key)) errors.push(`_locales/${baseLocale} に "${key}" が無い`);
  }
}

if (errors.length > 0) {
  console.error('[ClipPiP] i18n check failed');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`[ClipPiP] i18n check passed (${baseKeys.size} keys x ${locales.length} locales)`);
