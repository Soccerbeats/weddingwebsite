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
    return (
      <>
        {/* Public nav stays at top for admin too */}
        <Navigation
          brideName={brideName}
          groomName={groomName}
          logoMode={logoMode}
          weddingLogo={weddingLogo}
          isAdmin={isAdmin}
        />
        {/*
          Fixed container that starts exactly where the nav ends (top-20 = 80px)
          and fills to all other edges. This gives the admin layout a container
          with truly explicit pixel dimensions — no reliance on flex-grow for height.
        */}
        <div className="fixed top-20 left-0 right-0 bottom-0 overflow-hidden flex flex-col">
          {children}
        </div>
      </>
    );
  }

  // Public pages: nav is fixed, content starts below it
  return (
    <>
      <Navigation
        brideName={brideName}
        groomName={groomName}
        logoMode={logoMode}
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
