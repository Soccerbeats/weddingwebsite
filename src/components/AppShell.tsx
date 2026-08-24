'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Navigation from './Navigation';
import ConditionalFooter from './ConditionalFooter';
import HeartBurst from './HeartBurst';

interface AppShellProps {
  children: React.ReactNode;
  brideName?: string;
  groomName?: string;
  logoMode?: boolean;
  weddingLogo?: string;
  isAdmin: boolean;
  /** The demo instance: the admin button is always offered, and there is a banner. */
  isDemo?: boolean;
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
  isDemo = false,
  weddingDate,
  weddingLocation,
  footerHeroImage,
}: AppShellProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  // Public pages scroll the document and want the scrollbar gutter reserved;
  // admin pages scroll an inner container and don't. The initial value is set
  // before paint by an inline script in the root layout — this only has to
  // follow client-side navigations between the two. See globals.css.
  useEffect(() => {
    document.documentElement.classList.toggle('no-scrollbar-gutter', !!isAdminRoute);
  }, [isAdminRoute]);

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
          isDemo={isDemo}
        />
        {/*
          Fixed container that starts exactly where the nav ends (80px) and fills
          to all other edges. This gives the admin layout a container with truly
          explicit pixel dimensions — no reliance on flex-grow for height.

          Plus the demo banner's height, which is 0 unless this is the demo: the
          banner sits above the nav, so everything measured from the top of the
          window moves down by it. Without this the admin panel started under the
          banner and lost its first 28 pixels.
        */}
        <div
          className="fixed left-0 right-0 bottom-0 overflow-hidden flex flex-col
            top-[calc(5rem+var(--demo-banner-h,0px))]"
        >
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
        isDemo={isDemo}
      />
      <HeartBurst />
      {/* Home page: hero fills under the floating nav island (pt-0).
          All other pages: push content below the nav bar (pt-20).       */}
      <div className={`${pathname === '/' ? 'pt-0' : 'pt-20'} flex flex-col min-h-screen`}>
        <main key={pathname} className="flex-grow page-enter">
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
