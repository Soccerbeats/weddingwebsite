'use client';

import { createContext, useContext, useMemo } from 'react';
import { makeI18n, type I18n, type Locale, type Messages } from '@/lib/i18n';
import { en } from '@/lib/i18n/en';

const Context = createContext<{ locale: Locale; messages: Messages }>({ locale: 'en', messages: en });

/**
 * Hands the site's language to every client component. The root layout reads
 * the setting on each request and passes down only that language's messages.
 */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
    const value = useMemo(() => ({ locale, messages }), [locale, messages]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The site's language: `m` holds the words, `fill` / `plural` / `date` format them. */
export function useI18n(): I18n {
    const { locale, messages } = useContext(Context);
    return useMemo(() => makeI18n(locale, messages), [locale, messages]);
}
