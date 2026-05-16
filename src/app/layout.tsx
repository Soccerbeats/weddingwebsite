import type { Metadata } from 'next';
import { Playfair_Display, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
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
  return {
    title: `${config.brideName} & ${config.groomName} | The Wedding`,
    description: `Join us in celebrating our wedding on ${config.weddingDate}.`,
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

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased pt-20 min-h-screen flex flex-col`}
      >
        <WipCheck />
        <Navigation
          brideName={config.brideName}
          groomName={config.groomName}
          logoMode={config.logoMode}
          weddingLogo={config.weddingLogo}
          isAdmin={isAdmin}
        />
        <main className="flex-grow">
          {children}
        </main>
        <Footer
          brideName={config.brideName}
          groomName={config.groomName}
          weddingDate={config.weddingDate}
          weddingLocation={config.weddingLocation}
          footerHeroImage={config.footerHeroImage}
        />
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --accent: ${config.accentColor || '#D4AF37'};
              --accent-light: ${config.accentLightColor || '#F4E5C3'};
              --accent-dark: ${config.accentDarkColor || '#B8941F'};
            }
          `
        }} />
      </body>
    </html>
  );
}
