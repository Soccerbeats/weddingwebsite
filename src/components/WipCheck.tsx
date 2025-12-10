'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function WipCheck() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkWipStatus = async () => {
      try {
        // Check if user is logged in as admin
        const authResponse = await fetch('/api/auth/check');
        if (authResponse.ok) {
          const { isAdmin } = await authResponse.json();

          // If user is admin, don't check WIP status
          if (isAdmin) {
            return;
          }
        }

        // Check WIP status for non-admin users
        const wipResponse = await fetch('/api/wip-status');
        if (wipResponse.ok) {
          const wipPages = await wipResponse.json();

          if (wipPages[pathname] === true) {
            router.push('/work-in-progress');
          }
        }
      } catch (error) {
        console.error('Error checking WIP status:', error);
      }
    };

    if (pathname && pathname !== '/work-in-progress' && !pathname.startsWith('/admin')) {
      checkWipStatus();
    }
  }, [pathname, router]);

  return null;
}
