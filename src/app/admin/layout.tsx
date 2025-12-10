'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/admin/login');
        router.refresh();
    };

    const navItems = [
        { href: '/admin/rsvps', label: 'RSVPs' },
        { href: '/admin/photos', label: 'Photos' },
        { href: '/admin/home', label: 'Home Page' },
        { href: '/admin/about', label: 'About Page' },
        { href: '/admin/wedding-party', label: 'Wedding Party' },
        { href: '/admin/faqs', label: 'Q&A' },
        { href: '/admin/schedule', label: 'Schedule' },
        { href: '/admin/settings', label: 'General Settings' },
        { href: '/admin/wip-control', label: 'Work in Progress' },
    ];

    if (pathname === '/admin/login') {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200">
                <div className="h-16 flex items-center justify-center border-b border-gray-200">
                    <span className="text-xl font-serif font-bold text-gray-800">Admin Panel</span>
                </div>
                <nav className="p-4 space-y-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`block px-4 py-2 rounded-md text-sm font-medium transition-colors ${pathname?.startsWith(item.href)
                                ? 'bg-accent/10 text-accent'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                    <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors mt-8"
                    >
                        Logout
                    </button>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
