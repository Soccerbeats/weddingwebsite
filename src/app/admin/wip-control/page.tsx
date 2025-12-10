'use client';

import { useEffect, useState } from 'react';

interface WipToggle {
  id: number;
  page_path: string;
  page_label: string;
  is_wip: boolean;
  updated_at: string;
}

const publicPages = [
  { path: '/', label: 'Home' },
  { path: '/about', label: 'About' },
  { path: '/wedding-party', label: 'Wedding Party' },
  { path: '/schedule', label: 'Schedule' },
  { path: '/photos', label: 'Photos' },
  { path: '/rsvp', label: 'RSVP' },
];

export default function WipControlPage() {
  const [toggles, setToggles] = useState<WipToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchToggles();
  }, []);

  const fetchToggles = async () => {
    try {
      const response = await fetch('/api/admin/wip-toggles');
      const data = await response.json();

      const toggleMap = new Map(data.map((t: WipToggle) => [t.page_path, t]));

      const allToggles = publicPages.map(page => {
        const existing = toggleMap.get(page.path);
        return existing || {
          id: 0,
          page_path: page.path,
          page_label: page.label,
          is_wip: false,
          updated_at: new Date().toISOString(),
        };
      });

      setToggles(allToggles);
    } catch (error) {
      console.error('Error fetching toggles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (page_path: string, current_status: boolean) => {
    setSaving(page_path);
    try {
      const toggle = toggles.find(t => t.page_path === page_path);
      if (!toggle) return;

      const response = await fetch('/api/admin/wip-toggles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_path: toggle.page_path,
          page_label: toggle.page_label,
          is_wip: !current_status,
        }),
      });

      if (response.ok) {
        await fetchToggles();
      }
    } catch (error) {
      console.error('Error updating toggle:', error);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Work in Progress Control</h1>
      <p className="text-gray-600 mb-8">
        Control which pages show a work-in-progress message to non-admin users.
        Admin users will always have full access.
      </p>

      <div className="bg-white rounded-lg shadow">
        <div className="divide-y">
          {toggles.map((toggle) => (
            <div
              key={toggle.page_path}
              className="p-6 flex items-center justify-between"
            >
              <div>
                <h3 className="font-semibold text-lg">{toggle.page_label}</h3>
                <p className="text-gray-500 text-sm">{toggle.page_path}</p>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={`text-sm font-medium ${
                    toggle.is_wip ? 'text-yellow-600' : 'text-green-600'
                  }`}
                >
                  {toggle.is_wip ? 'Work in Progress' : 'Live'}
                </span>

                <button
                  onClick={() => handleToggle(toggle.page_path, toggle.is_wip)}
                  disabled={saving === toggle.page_path}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    toggle.is_wip ? 'bg-yellow-500' : 'bg-gray-300'
                  } ${saving === toggle.page_path ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      toggle.is_wip ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">How it works:</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• When a page is marked as "Work in Progress", non-admin visitors will be redirected to a WIP page</li>
          <li>• Admin users (those logged into the admin panel) can always access all pages</li>
          <li>• Toggle any page on/off at any time</li>
        </ul>
      </div>
    </div>
  );
}
