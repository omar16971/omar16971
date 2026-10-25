import ar from './ar.json'
import en from './en.json'

export type Lang = 'en' | 'ar'
const catalogue: Record<Lang, Record<string, string>> = { en, ar }

/** A missing key renders as the key, loudly, so a gap shows up in review. */
export const translate = (lang: Lang, key: string, vars: Record<string, string> = {}): string =>
  (catalogue[lang][key] ?? `⟦${key}⟧`).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')

export const dirOf = (lang: Lang): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr')

/** One decision, written down: Western digits in both languages (blueprint §8). */
export const num = (n: number, digits = 0): string => n.toFixed(digits)

const LRI = '\u2066'
const PDI = '\u2069'
/** Isolate a number run so `26.0°` keeps its order inside right-to-left text. */
export const deg = (n: number, digits = 0, signed = false): string =>
  `${LRI}${signed && n > 0 ? '+' : ''}${Number.isFinite(n) ? n.toFixed(digits) : '–'}°${PDI}`
export const pct = (n: number): string => `${LRI}${Math.round(n)}%${PDI}`
