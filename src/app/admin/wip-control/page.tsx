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
  { path: '/our-story', label: 'Timeline' },
  { path: '/wedding-party', label: 'Wedding Party' },
  { path: '/schedule', label: 'Schedule' },
  { path: '/photos', label: 'Photos' },
  { path: '/honeymoon-fund', label: 'Honeymoon Fund' },
  { path: '/rsvp', label: 'RSVP' },
];

export default function WipControlPage() {
  const [toggles, setToggles] = useState<WipToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [basicMode, setBasicMode] = useState(false);
  const [basicModeShowVenue, setBasicModeShowVenue] = useState(false);
  const [savingBasicMode, setSavingBasicMode] = useState(false);
  const [savingBasicModeVenue, setSavingBasicModeVenue] = useState(false);

  useEffect(() => {
    fetchToggles();
    fetchBasicMode();
  }, []);

  const fetchBasicMode = async () => {
    try {
      const response = await fetch('/api/admin/site-config');
      const data = await response.json();
      setBasicMode(data.basicMode || false);
      setBasicModeShowVenue(data.basicModeShowVenue || false);
    } catch (error) {
      console.error('Error fetching basic mode:', error);
    }
  };

  const fetchToggles = async () => {
    try {
      const response = await fetch('/api/admin/wip-toggles');
      const data = await response.json();

      const toggleMap = new Map(data.map((t: WipToggle) => [t.page_path, t]));

      const allToggles: WipToggle[] = publicPages.map((page): WipToggle => {
        const existing = toggleMap.get(page.path);
        if (existing !== undefined) {
          return existing as WipToggle;
        }
        return {
          id: 0,
          page_path: page.path,
          page_label: page.label,
          is_wip: false,
          updated_at: new Date().toISOString(),
        } as WipToggle;
      });

      setToggles(allToggles);
    } catch (error) {
      console.error('Error fetching toggles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBasicModeToggle = async () => {
    setSavingBasicMode(true);
    try {
      const configResponse = await fetch('/api/admin/site-config');
      const config = await configResponse.json();

      config.basicMode = !basicMode;

      const response = await fetch('/api/admin/site-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setBasicMode(!basicMode);
      }
    } catch (error) {
      console.error('Error updating basic mode:', error);
    } finally {
      setSavingBasicMode(false);
    }
  };

  const handleBasicModeVenueToggle = async () => {
    setSavingBasicModeVenue(true);
    try {
      const configResponse = await fetch('/api/admin/site-config');
      const config = await configResponse.json();

      config.basicModeShowVenue = !basicModeShowVenue;

      const response = await fetch('/api/admin/site-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setBasicModeShowVenue(!basicModeShowVenue);
      }
    } catch (error) {
      console.error('Error updating basic mode venue:', error);
    } finally {
      setSavingBasicModeVenue(false);
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

      {/* Basic Mode Section */}
      <div className="bg-gradient-to-br from-accent/10 to-accent-light/20 rounded-2xl shadow-lg p-8 mb-8 border border-accent/20">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-gray-900">Basic Mode</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                basicMode
                  ? 'bg-accent text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {basicMode ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <p className="text-gray-700 mb-3">
              Pre-release mode - Show only essential pages before your site is fully ready
            </p>
            <div className="bg-white/60 rounded-xl p-4 backdrop-blur-sm">
              <p className="text-sm font-medium text-gray-800 mb-2">When enabled, visitors will only see:</p>
              <ul className="text-sm text-gray-700 space-y-1 ml-4">
                <li>• <strong>Home</strong> - Full homepage</li>
                <li>• <strong>About</strong> - Only the introduction section (hides Details & FAQ)</li>
                <li>• <strong>Timeline</strong> - Your story timeline</li>
                <li>• <strong>Photos</strong> - Photo gallery</li>
              </ul>
              <p className="text-sm text-gray-600 mt-3 italic">
                Other pages (Wedding Party, Schedule, RSVP) won't appear in navigation at all.
              </p>
            </div>

            {/* Venue Details Sub-Toggle - Only visible when Basic Mode is enabled */}
            {basicMode && (
              <div className="mt-4 bg-white/80 rounded-xl p-4 border-2 border-accent/30">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-gray-900">Share Venue Details</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        basicModeShowVenue
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {basicModeShowVenue ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Show venue location on home page and venue section on about page
                    </p>
                  </div>

                  <button
                    onClick={handleBasicModeVenueToggle}
                    disabled={savingBasicModeVenue}
                    className={`relative inline-flex h-6 w-12 items-center rounded-full transition-all duration-300 ${
                      basicModeShowVenue ? 'bg-green-500' : 'bg-gray-300'
                    } ${savingBasicModeVenue ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                        basicModeShowVenue ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="ml-6">
            <button
              onClick={handleBasicModeToggle}
              disabled={savingBasicMode}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-all duration-300 shadow-lg ${
                basicMode ? 'bg-accent' : 'bg-gray-300'
              } ${savingBasicMode ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-xl'}`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-md ${
                  basicMode ? 'translate-x-9' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Individual Page Toggles */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Individual Page Controls</h2>
          <p className="text-sm text-gray-600 mt-1">Fine-tune each page's availability</p>
        </div>

        <div className="divide-y divide-gray-100">
          {toggles.map((toggle) => (
            <div
              key={toggle.page_path}
              className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-gray-900">{toggle.page_label}</h3>
                <p className="text-gray-500 text-sm font-mono">{toggle.page_path}</p>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    toggle.is_wip
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {toggle.is_wip ? '🚧 WIP' : '✓ Live'}
                </span>

                <button
                  onClick={() => handleToggle(toggle.page_path, toggle.is_wip)}
                  disabled={saving === toggle.page_path}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300 ${
                    toggle.is_wip ? 'bg-yellow-500' : 'bg-green-500'
                  } ${saving === toggle.page_path ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${
                      toggle.is_wip ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 p-6 bg-blue-50 rounded-2xl border border-blue-100">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <span className="text-xl">ℹ️</span>
          How it works
        </h3>
        <ul className="text-sm text-blue-800 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>When a page is marked as "Work in Progress", non-admin visitors will be redirected to a WIP page</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Admin users (those logged into the admin panel) can always access all pages</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span><strong>Basic Mode</strong> overrides individual toggles and hides pages from navigation entirely</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
