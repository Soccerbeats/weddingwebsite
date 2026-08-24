import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Geist, Geist_Mono, Great_Vibes } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import DemoBanner from '@/components/DemoBanner';
import WipCheck from '@/components/WipCheck';
import { getSiteConfig } from '@/lib/config';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

// Force this layout to be dynamic so it re-reads config on every request
export const dynamic = 'force-dynamic';

const playfair = Playfair_Display({
  variable: '--font-serif',
  subsets: ['latin'],
});

const greatVibes = Great_Vibes({
  variable: '--font-script',
  subsets: ['latin'],
  weight: '400',
});

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const config = getSiteConfig();
  const couple = config.brideName && config.groomName
    ? `${config.brideName} & ${config.groomName}`
    : 'Our Wedding';
  return {
    title: `${couple} | The Wedding`,
    description: `Join us in celebrating our wedding on ${config.weddingDate}.`,
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
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return false;
    const secret = new TextEncoder().encode(process.env.ADMIN_PASSWORD || 'default_secret_password');
    await jwtVerify(token, secret);
    return true;
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
  const isAdmin = await getIsAdmin();

  // suppressHydrationWarning below is for the inline script in <head>, which
  // adds `no-scrollbar-gutter` to <html> before paint on admin routes. The
  // server cannot know the path, so that class is always a mismatch at
  // hydration — React logged a warning on every single admin page, which is
  // noise that hides real ones. The class is the only difference on this element.
  return (
    <html lang="en" suppressHydrationWarning>
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
      <body className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${greatVibes.variable} antialiased`}>
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --accent: ${config.accentColor || '#D4AF37'};
              --accent-light: ${config.accentLightColor || '#F4E5C3'};
              --accent-dark: ${config.accentDarkColor || '#B8941F'};
            }
          `
        }} />
        {/* Above everything, on every page: which instance this is. */}
        <DemoBanner />
        <WipCheck />
        <AppShell
          brideName={config.brideName}
          groomName={config.groomName}
          logoMode={config.logoMode}
          weddingLogo={config.weddingLogo}
          isAdmin={isAdmin}
          weddingDate={config.weddingDate}
          weddingLocation={config.weddingLocation}
          footerHeroImage={config.footerHeroImage}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
