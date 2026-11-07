import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './fonts/fonts.css';
import './globals.css';
import AppShell from '@/components/AppShell';
import DemoBanner from '@/components/DemoBanner';
import { demoStatus } from '@/lib/demo';
import { getSiteConfig } from '@/lib/config';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/auth';
import { I18nProvider } from '@/components/I18nProvider';
import { getI18n } from '@/lib/i18n/server';

// Force this layout to be dynamic so it re-reads config on every request
export const dynamic = 'force-dynamic';

// Every font is a file in `src/app/fonts/` — nothing is fetched from Google
// at build time (a build with no route there used to fail) or by a guest's
// browser. Playfair Display and Great Vibes are declared in `fonts/fonts.css`,
// split by script; Geist is one variable file each, loaded here.
const geistSans = localFont({
  src: './fonts/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export async function generateMetadata(): Promise<Metadata> {
  const config = getSiteConfig();
  const { m, fill } = getI18n();
  const couple = config.brideName && config.groomName
    ? `${config.brideName} & ${config.groomName}`
    : m.meta.ourWedding;
  return {
    title: fill(m.meta.title, { couple }),
    description: fill(m.meta.description, { date: config.weddingDate || '' }),
    // Linked explicitly because the manifest is a route handler now, not the
    // `app/manifest.ts` convention — that export gets no request and so could
    // only ever emit one variant. The admin layout overrides this.
    manifest: '/manifest.webmanifest',
    // Keeps older iOS in standalone mode; iOS 16.4+ uses the manifest instead.
    appleWebApp: {
      capable: true,
      title: couple,
      // 'default' leaves the status bar as its own opaque strip, so the fixed
      // nav can't slide under the clock and Dynamic Island. Paired with not
      // setting viewport-fit: cover, iOS insets the viewport itself and
      // nothing needs safe-area padding.
      statusBarStyle: 'default',
    },
    icons: {
      icon: [{ url: '/api/app-icon?size=192', sizes: '192x192', type: 'image/png' }],
      // iOS uses this for the Home Screen icon. Without it, it screenshots the page.
      apple: [{ url: '/api/app-icon?size=180', sizes: '180x180', type: 'image/png' }],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const config = getSiteConfig();
  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: config.accentColor || '#D4AF37',
  };
}

async function getIsAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    return (await verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value)) !== null;
  } catch {
    return false;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = getSiteConfig();
  const i18n = getI18n();
  const isAdmin = await getIsAdmin();
  const { demo: isDemo } = demoStatus();

  // suppressHydrationWarning below is for the inline script in <head>, which
  // adds `no-scrollbar-gutter` to <html> before paint on admin routes. The
  // server cannot know the path, so that class is always a mismatch at
  // hydration — React logged a warning on every single admin page, which is
  // noise that hides real ones. The class is the only difference on this element.
  return (
    <html lang={i18n.locale} suppressHydrationWarning>
      <head>
        {/*
          Next emits the standardised `mobile-web-app-capable`, but iOS before
          16.4 only honours the apple-prefixed name — without it those versions
          launch the Home Screen icon in a normal Safari tab.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/*
          Runs before first paint so an admin page never flashes the reserved
          scrollbar gutter it doesn't want. AppShell keeps this in sync from
          here on; see the `scrollbar-gutter` rules in globals.css.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(location.pathname.indexOf('/admin')===0){document.documentElement.classList.add('no-scrollbar-gutter')}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --accent: ${config.accentColor || '#D4AF37'};
              --accent-light: ${config.accentLightColor || '#F4E5C3'};
              --accent-dark: ${config.accentDarkColor || '#B8941F'};
              /*
                How much room the demo banner takes, and 0 when there is no
                banner. Everything that positions itself against the top of the
                window adds this: the nav bar and the admin shell. One number in
                one place, so they cannot disagree and clip each other.
              */
              --demo-banner-h: ${isDemo ? '1.75rem' : '0px'};
            }
          `
        }} />
        {/* Above everything, on every page: which instance this is. */}
        <DemoBanner />
        <I18nProvider locale={i18n.locale} messages={i18n.m}>
        <AppShell
          isDemo={isDemo}
          brideName={config.brideName}
          groomName={config.groomName}
          logoMode={config.logoMode}
          weddingLogo={config.weddingLogo}
          isAdmin={isAdmin}
          weddingDate={config.weddingDate}
          weddingLocation={config.weddingLocation}
          footerHeroImage={config.footerHeroImage}
          footerHeroImageMobile={config.footerHeroImageMobile}
        >
          {children}
        </AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
