'use client';

import { usePathname } from 'next/navigation';

export default function AdminMainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isSeating = pathname?.startsWith('/admin/seating');

    if (isSeating) {
        return <div className="flex-1 overflow-hidden h-full flex flex-col">{children}</div>;
    }

    return <div className="p-8">{children}</div>;
}
