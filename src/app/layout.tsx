import type { Metadata } from 'next';
import { Playfair_Display, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import WipCheck from '@/components/WipCheck';
import { getSiteConfig } from '@/lib/config';

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = getSiteConfig();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased pt-16 min-h-screen flex flex-col`}
      >
        <WipCheck />
        <Navigation brideName={config.brideName} groomName={config.groomName} />
        <main className="flex-grow">
          {children}
        </main>
        <Footer
          brideName={config.brideName}
          groomName={config.groomName}
          weddingDate={config.weddingDate}
          weddingLocation={config.weddingLocation}
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
