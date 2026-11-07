import type { Messages } from './index';
import type { Locale } from './locales';
import { en } from './en';
import { es } from './es';
import { de } from './de';
import { sv } from './sv';
import { ru } from './ru';

/** Every language's messages. Server-side only: the browser is sent just the one in use. */
export const MESSAGES: Record<Locale, Messages> = { en, es, de, sv, ru };
