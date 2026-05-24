'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function WipCheck() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkWipStatus = async () => {
      try {
        const authResponse = await fetch('/api/auth/check');
        if (authResponse.ok) {
          const { isAdmin } = await authResponse.json();
          if (isAdmin) return; // admins always have access
        }

        const wipResponse = await fetch('/api/wip-status');
        if (wipResponse.ok) {
          const wipPages = await wipResponse.json();
          const entry = wipPages[pathname];
          if (!entry) return;

          if (entry.is_hidden) {
            // Hidden pages: redirect to home, not WIP page
            router.push('/');
          } else if (entry.is_wip) {
            // WIP pages: show the work-in-progress message
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
