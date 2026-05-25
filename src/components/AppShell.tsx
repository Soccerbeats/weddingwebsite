'use client';

import { usePathname } from 'next/navigation';
import Navigation from './Navigation';
import ConditionalFooter from './ConditionalFooter';

interface AppShellProps {
  children: React.ReactNode;
  brideName?: string;
  groomName?: string;
  logoMode?: boolean;
  weddingLogo?: string;
  isAdmin: boolean;
  weddingDate?: string;
  weddingLocation?: string;
  footerHeroImage?: string;
}

export default function AppShell({
  children,
  brideName,
  groomName,
  logoMode,
  weddingLogo,
  isAdmin,
  weddingDate,
  weddingLocation,
  footerHeroImage,
}: AppShellProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isAdminRoute) {
    // Admin: no public nav, no pt-20, no footer — full viewport flex
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <>
      <Navigation
        brideName={brideName}
        groomName={groomName}
        logoMode={typeof logoMode === 'boolean' ? logoMode : undefined}
        weddingLogo={weddingLogo}
        isAdmin={isAdmin}
      />
      <div className="pt-20 flex flex-col min-h-screen">
        <main className="flex-grow">
          {children}
        </main>
        <ConditionalFooter
          brideName={brideName}
          groomName={groomName}
          weddingDate={weddingDate}
          weddingLocation={weddingLocation}
          footerHeroImage={footerHeroImage}
        />
      </div>
    </>
  );
}
