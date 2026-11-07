/**
 * The languages the guest-facing site speaks. The couple picks one in
 * Admin → Settings → Site language; every visitor then sees the site's own
 * words in it. What the couple wrote themselves (names, the story, FAQs, the
 * schedule) is shown exactly as they wrote it, and the admin panel stays in
 * English.
 *
 * English is the default, and the source every other language is checked
 * against: `check:i18n` fails if a language is missing a key.
 */
export const LOCALES = {
    en: { name: 'English', native: 'English', intl: 'en-US' },
    es: { name: 'Spanish', native: 'Español', intl: 'es-ES' },
    de: { name: 'German', native: 'Deutsch', intl: 'de-DE' },
    sv: { name: 'Swedish', native: 'Svenska', intl: 'sv-SE' },
    ru: { name: 'Russian', native: 'Русский', intl: 'ru-RU' },
} as const;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = 'en';

export function resolveLocale(value: unknown): Locale {
    return typeof value === 'string' && value in LOCALES ? (value as Locale) : DEFAULT_LOCALE;
}
