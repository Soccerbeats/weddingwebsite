import { LOCALES, type Locale } from './locales';

/** A message that changes with a number. Keys are Intl.PluralRules categories; `other` is required. */
export interface Plural {
    zero?: string;
    one?: string;
    two?: string;
    few?: string;
    many?: string;
    other: string;
}

/** The type every language's messages share: English's shape, with every string widened. */
type PluralKey = keyof Plural;
/** A plural is an object with `other` and nothing but plural categories. */
export type Widen<T> = T extends string
    ? string
    : T extends { other: string }
        ? [Exclude<keyof T, PluralKey>] extends [never]
            ? Plural
            : { [K in keyof T]: Widen<T[K]> }
        : { [K in keyof T]: Widen<T[K]> };

/** "Hi {name}" with { name: 'Ann' } → "Hi Ann". Unknown placeholders are left as they are. */
export function fill(template: string, vars: Record<string, string | number> = {}): string {
    return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/**
 * The form of `forms` for `n` in this language — Russian has four ("1 гость",
 * "2 гостя", "5 гостей", "1,5 гостя"), English two — with {n} filled in.
 */
export function plural(locale: Locale, forms: Plural, n: number, vars: Record<string, string | number> = {}): string {
    const category = new Intl.PluralRules(LOCALES[locale].intl).select(n) as keyof Plural;
    return fill(forms[category] ?? forms.other, { n, ...vars });
}

/** A date in this language's own way of writing one. */
export function formatDate(locale: Locale, date: Date, options: Intl.DateTimeFormatOptions): string {
    return date.toLocaleDateString(LOCALES[locale].intl, options);
}

/** A YYYY-MM-DD as a local calendar date, or null when it is not one. */
export function parseIsoDate(raw: string | null | undefined): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw ?? '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
