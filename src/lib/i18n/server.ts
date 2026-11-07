import { getSiteConfig } from '@/lib/config';
import { makeI18n, resolveLocale, type I18n } from './index';
import { MESSAGES } from './messages';

/** The site's language as the couple set it, for server components, routes and emails. */
export function getI18n(): I18n {
    const locale = resolveLocale(getSiteConfig().siteLanguage);
    return makeI18n(locale, MESSAGES[locale]);
}
