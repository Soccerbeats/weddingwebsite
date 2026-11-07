import { fill, formatDate, plural, type Plural, type Widen } from './format';
import { LOCALES, type Locale } from './locales';
import { en } from './en';

export type Messages = Widen<typeof en>;
export { LOCALES, DEFAULT_LOCALE, resolveLocale, type Locale } from './locales';
export { fill, plural, formatDate, parseIsoDate, type Plural } from './format';

export interface I18n {
    locale: Locale;
    /** The language tag for Intl and `<html lang>`, e.g. "de-DE". */
    intl: string;
    m: Messages;
    fill: typeof fill;
    /** `plural(forms, n)` in this language. */
    plural: (forms: Plural, n: number, vars?: Record<string, string | number>) => string;
    /** A date written this language's way. */
    date: (date: Date, options: Intl.DateTimeFormatOptions) => string;
}

export function makeI18n(locale: Locale, m: Messages): I18n {
    return {
        locale,
        intl: LOCALES[locale].intl,
        m,
        fill,
        plural: (forms, n, vars) => plural(locale, forms, n, vars),
        date: (d, options) => formatDate(locale, d, options),
    };
}
