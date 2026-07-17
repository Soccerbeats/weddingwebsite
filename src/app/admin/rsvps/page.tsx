'use client';

import React, { useEffect, useState } from 'react';
import type { FundItem } from '@/lib/config';

interface DietaryEntry {
    name: string;
    vegetarian?: boolean;
    vegan?: boolean;
    gluten_free?: boolean;
    nut_allergy?: boolean;
    other?: boolean;
    other_text?: string;
    note?: string;
}

interface RSVP {
    id: number;
    guest_name: string;
    plus_one_name?: string;
    email: string;
    phone: string;
    attending: boolean;
    number_of_guests: number;
    dietary_restrictions: DietaryEntry[] | string | null;
    message: string;
    created_at: string;
}

interface PartyMember {
    name: string | null;
}

interface Guest {
    id: number;
    guest_name: string;
    email: string;
    phone: string;
    party_size: number;
    side?: string;
    notes: string;
    invited: boolean;
    rsvp_status?: string;
    party_members?: PartyMember[];
    plus_one_name?: string | null;
    address?: string;
    created_at: string;
}

interface Donation {
    id: number;
    guest_id: number | null;
    guest_name: string;
    amount: number;
    fund_item_id: string | null;
    fund_item_title: string | null;
    event: string | null;
    created_at: string;
    co_donors?: { id: number | null; name: string }[];
}

type Tab = 'rsvps' | 'guestlist' | 'donations';
type GuestFilter = 'all' | 'no_response' | 'attending' | 'declined' | 'likely_not_coming' | 'invited' | 'not_invited' | 'bride' | 'groom';

export default function RSVPDashboard() {
    const [activeTab, setActiveTab] = useState<Tab>('rsvps');
    const [guestFilter, setGuestFilter] = useState<GuestFilter>('all');
    const [guestSearch, setGuestSearch] = useState('');
    const [rsvps, setRsvps] = useState<RSVP[]>([]);
    const [guests, setGuests] = useState<Guest[]>([]);
    const [donations, setDonations] = useState<Donation[]>([]);
    const [showDonationModal, setShowDonationModal] = useState(false);
    const [donationDonorSearch, setDonationDonorSearch] = useState('');
    const [donationDonor, setDonationDonor] = useState<{ id: number; guest_name: string } | null>(null);
    const [donationAmount, setDonationAmount] = useState('');
    const [donationFundId, setDonationFundId] = useState('');
    const [donationEvent, setDonationEvent] = useState('Wedding Day');
    const [donationOtherEvent, setDonationOtherEvent] = useState('');
    const [savingDonation, setSavingDonation] = useState(false);
    const [coGivers, setCoGivers] = useState<{ id: number | null; name: string }[]>([]);
    const [coGiverSearch, setCoGiverSearch] = useState('');
    const [editingDonationId, setEditingDonationId] = useState<number | null>(null);
    const [origDonation, setOrigDonation] = useState<{ amount: number; fund_item_id: string | null } | null>(null);
    const [deletingDonation, setDeletingDonation] = useState<Donation | null>(null);
    const [loading, setLoading] = useState(true);
    const [deletingRsvp, setDeletingRsvp] = useState<RSVP | null>(null);
    const [confirmName, setConfirmName] = useState('');
    const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
    const [isAddingGuest, setIsAddingGuest] = useState(false);
    const [selectedGuests, setSelectedGuests] = useState<number[]>([]);
    const [config, setConfig] = useState<any>(null);
    const [rsvpSubtitle, setRsvpSubtitle] = useState('');
    const [subtitleSaving, setSubtitleSaving] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResults, setImportResults] = useState<{ added: number; updated: number; failed: number; errors: string[] } | null>(null);
    const [guestForm, setGuestForm] = useState({
        guest_name: '',
        email: '',
        phone: '',
        party_size: 1,
        side: '',
        notes: '',
        invited: false,
        party_members: [] as PartyMember[],
        rsvp_status: '',
    });

    useEffect(() => {
        fetchRsvps();
        fetchGuests();
        fetchConfig();
        fetchDonations();
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab === 'donations' || tab === 'guestlist' || tab === 'rsvps') {
            setActiveTab(tab as Tab);
        }
    }, []);

    const handleSaveSubtitle = async () => {
        setSubtitleSaving(true);
        await fetch('/api/admin/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rsvpSubtitle }),
        }).catch(console.error);
        setSubtitleSaving(false);
    };

    const fetchConfig = async () => {
        try {
            const response = await fetch('/api/admin/site-config');
            const data = await response.json();
            setConfig(data);
            if (data.rsvpSubtitle) setRsvpSubtitle(data.rsvpSubtitle);
        } catch (error) {
            console.error('Error fetching config:', error);
        }
    };

    const fetchRsvps = () => {
        fetch('/api/admin/rsvps')
            .then(res => res.json())
            .then(data => {
                setRsvps(data.rsvps || []);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    const fetchGuests = async () => {
        try {
            const response = await fetch('/api/admin/guest-list');
            const data = await response.json();
            setGuests(data);
        } catch (error) {
            console.error('Error fetching guests:', error);
        }
    };

    const fetchDonations = async () => {
        try {
            const response = await fetch('/api/admin/donations');
            const data = await response.json();
            setDonations(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching donations:', error);
        }
    };

    const resetDonationModal = () => {
        setShowDonationModal(false);
        setDonationDonorSearch('');
        setDonationDonor(null);
        setDonationAmount('');
        setDonationFundId('');
        setDonationEvent('Wedding Day');
        setDonationOtherEvent('');
        setCoGivers([]);
        setCoGiverSearch('');
        setEditingDonationId(null);
        setOrigDonation(null);
    };

    const addCoGiver = (person: { id: number | null; name: string }) => {
        const name = person.name.trim();
        if (!name) return;
        if (coGivers.some(c => c.name.toLowerCase() === name.toLowerCase())) { setCoGiverSearch(''); return; }
        setCoGivers([...coGivers, { id: person.id, name }]);
        setCoGiverSearch('');
    };
    const removeCoGiver = (name: string) => setCoGivers(coGivers.filter(c => c.name !== name));

    const openEditDonation = (d: Donation) => {
        setEditingDonationId(d.id);
        setOrigDonation({ amount: d.amount, fund_item_id: d.fund_item_id });
        setDonationDonor(d.guest_id != null ? { id: d.guest_id, guest_name: d.guest_name } : { id: 0, guest_name: d.guest_name });
        setDonationAmount(String(d.amount));
        setDonationFundId(d.fund_item_id || '');
        const presets = ['Bridal Shower', 'Engagement Party', 'Wedding Day'];
        if (d.event && presets.includes(d.event)) { setDonationEvent(d.event); setDonationOtherEvent(''); }
        else { setDonationEvent('Other'); setDonationOtherEvent(d.event || ''); }
        setCoGivers(Array.isArray(d.co_donors) ? d.co_donors : []);
        setCoGiverSearch('');
        setShowDonationModal(true);
    };

    const saveDonation = async () => {
        const amount = parseFloat(donationAmount);
        if (!donationDonor || !amount || isNaN(amount) || !donationFundId) return;
        const funds: FundItem[] = config?.registry?.items || [];
        const fund = funds.find(f => f.id === donationFundId);
        if (!fund) return;
        const eventValue = donationEvent === 'Other' ? (donationOtherEvent.trim() || 'Other') : donationEvent;
        setSavingDonation(true);
        try {
            // Build per-fund delta map (edit reverses the original first)
            const delta: Record<string, number> = {};
            if (editingDonationId && origDonation?.fund_item_id) {
                delta[origDonation.fund_item_id] = (delta[origDonation.fund_item_id] || 0) - origDonation.amount;
            }
            delta[donationFundId] = (delta[donationFundId] || 0) + amount;
            await applyFundDeltas(delta);
            // Write the donation row
            const body = {
                guest_id: donationDonor.id || null,
                guest_name: donationDonor.guest_name,
                amount,
                fund_item_id: fund.id,
                fund_item_title: fund.title,
                event: eventValue,
                co_donors: coGivers,
            };
            if (editingDonationId) {
                await fetch('/api/admin/donations', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, id: editingDonationId }),
                });
            } else {
                await fetch('/api/admin/donations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            }
            await fetchDonations();
            await fetchConfig();
            resetDonationModal();
        } catch (e) {
            console.error('Failed to save donation:', e);
        } finally {
            setSavingDonation(false);
        }
    };

    // Fetch fresh config, apply per-fund funded deltas clamped to [0, price], POST it back.
    const applyFundDeltas = async (delta: Record<string, number>) => {
        const configRes = await fetch('/api/admin/site-config');
        const freshConfig = await configRes.json();
        const items: FundItem[] = (freshConfig.registry?.items || []).map((i: FundItem) => {
            const d = delta[i.id];
            if (!d) return i;
            return { ...i, funded: Math.max(0, Math.min(i.price, i.funded + d)) };
        });
        freshConfig.registry = { ...(freshConfig.registry || {}), items };
        await fetch('/api/admin/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(freshConfig),
        });
    };

    const confirmDeleteDonation = async () => {
        if (!deletingDonation) return;
        setSavingDonation(true);
        try {
            if (deletingDonation.fund_item_id) {
                await applyFundDeltas({ [deletingDonation.fund_item_id]: -deletingDonation.amount });
            }
            await fetch('/api/admin/donations', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deletingDonation.id }),
            });
            await fetchDonations();
            await fetchConfig();
            setDeletingDonation(null);
        } catch (e) {
            console.error('Failed to delete donation:', e);
        } finally {
            setSavingDonation(false);
        }
    };

    const handleDeleteRsvp = async () => {
        if (!deletingRsvp) return;

        try {
            const response = await fetch('/api/admin/rsvps', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deletingRsvp.id }),
            });

            if (response.ok) {
                setDeletingRsvp(null);
                setConfirmName('');
                fetchRsvps();
            }
        } catch (error) {
            console.error('Failed to delete RSVP:', error);
        }
    };

    const handleSaveGuest = async () => {
        try {
            const url = '/api/admin/guest-list';
            const method = editingGuest ? 'PUT' : 'POST';
            const body = editingGuest
                ? { ...guestForm, id: editingGuest.id }
                : guestForm;

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                setEditingGuest(null);
                setIsAddingGuest(false);
                setGuestForm({
                    guest_name: '',
                    email: '',
                    phone: '',
                    party_size: 1,
                    side: '',
                    notes: '',
                    invited: false,
                    party_members: [],
                    rsvp_status: '',
                });
                fetchGuests();
            }
        } catch (error) {
            console.error('Error saving guest:', error);
        }
    };

    const handleDeleteGuest = async (id: number) => {
        if (!confirm('Are you sure you want to delete this guest?')) return;

        try {
            const response = await fetch('/api/admin/guest-list', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });

            if (response.ok) {
                fetchGuests();
            }
        } catch (error) {
            console.error('Error deleting guest:', error);
        }
    };

    const openEditGuest = (guest: Guest) => {
        setEditingGuest(guest);
        // Build party_members slots to match party_size - 1
        const existing = guest.party_members || [];
        const slots: PartyMember[] = Array.from({ length: Math.max(0, guest.party_size - 1) }, (_, i) => ({
            name: existing[i]?.name ?? null,
        }));
        setGuestForm({
            guest_name: guest.guest_name,
            email: guest.email || '',
            phone: guest.phone || '',
            party_size: guest.party_size,
            side: guest.side || '',
            notes: guest.notes || '',
            invited: guest.invited,
            party_members: slots,
            rsvp_status: guest.rsvp_status || '',
        });
    };

    const handleMarkLikelyNotComing = async (guest: Guest) => {
        const newStatus = guest.rsvp_status === 'likely_not_coming' ? '' : 'likely_not_coming';
        try {
            await fetch('/api/admin/guest-list', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...guest, rsvp_status: newStatus }),
            });
            fetchGuests();
        } catch (error) {
            console.error('Error updating guest status:', error);
        }
    };

    const toggleGuestSelection = (id: number) => {
        setSelectedGuests(prev =>
            prev.includes(id) ? prev.filter(gId => gId !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedGuests.length === guests.length) {
            setSelectedGuests([]);
        } else {
            setSelectedGuests(guests.map(g => g.id));
        }
    };

    const handleBulkMarkInvited = async () => {
        if (selectedGuests.length === 0) return;

        try {
            await Promise.all(
                selectedGuests.map(id =>
                    fetch('/api/admin/guest-list', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id,
                            ...guests.find(g => g.id === id),
                            invited: true,
                        }),
                    })
                )
            );
            setSelectedGuests([]);
            fetchGuests();
        } catch (error) {
            console.error('Error marking guests as invited:', error);
        }
    };

    const handleBulkUnmarkInvited = async () => {
        if (selectedGuests.length === 0) return;
        if (!confirm(`Mark ${selectedGuests.length} guest(s) as Not Invited?`)) return;

        try {
            await Promise.all(
                selectedGuests.map(id =>
                    fetch('/api/admin/guest-list', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id,
                            ...guests.find(g => g.id === id),
                            invited: false,
                        }),
                    })
                )
            );
            setSelectedGuests([]);
            fetchGuests();
        } catch (error) {
            console.error('Error unmarking guests as invited:', error);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedGuests.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedGuests.length} guest(s)?`)) return;

        try {
            await Promise.all(
                selectedGuests.map(id =>
                    fetch('/api/admin/guest-list', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id }),
                    })
                )
            );
            setSelectedGuests([]);
            fetchGuests();
        } catch (error) {
            console.error('Error deleting guests:', error);
        }
    };

    const handleImportCSV = async () => {
        if (!csvFile) return;

        setImporting(true);
        setImportResults(null);

        try {
            const text = await csvFile.text();
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length === 0) {
                alert('CSV file is empty');
                setImporting(false);
                return;
            }

            // Parse CSV
            // Parse a CSV line respecting quoted fields (handles commas inside addresses etc.)
            const parseCSVLine = (line: string): string[] => {
                const result: string[] = [];
                let current = '';
                let inQuotes = false;
                for (let ci = 0; ci < line.length; ci++) {
                    const ch = line[ci];
                    if (ch === '"') {
                        inQuotes = !inQuotes;
                    } else if (ch === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += ch;
                    }
                }
                result.push(current.trim());
                return result;
            };

            const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
            const results = { added: 0, updated: 0, failed: 0, errors: [] as string[] };

            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);

                if (values.length === 0 || !values[0]) continue;

                const guestData: any = {};
                headers.forEach((header, index) => {
                    guestData[header] = values[index] || '';
                });

                // Map CSV columns to guest fields
                const guest = {
                    guest_name: guestData.name || guestData.guest_name || '',
                    email: guestData.email || '',
                    phone: guestData.phone || '',
                    party_size: parseInt(guestData.party_size) || 1,
                    side: guestData.side || '',
                    notes: guestData.notes || '',
                    invited: guestData.invited === 'true' || guestData.invited === '1',
                    plus_one_name: guestData.plus_one_name || '',
                    address: guestData.address || '',
                    upsert: true,
                };

                if (!guest.guest_name) {
                    results.errors.push(`Row ${i + 1}: Missing guest name`);
                    results.failed++;
                    continue;
                }

                try {
                    const response = await fetch('/api/admin/guest-list', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(guest),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.inserted === false) {
                            results.updated++;
                        } else {
                            results.added++;
                        }
                    } else {
                        results.failed++;
                        results.errors.push(`Row ${i + 1}: ${guest.guest_name} - Failed to import`);
                    }
                } catch (error) {
                    results.failed++;
                    results.errors.push(`Row ${i + 1}: ${guest.guest_name} - ${error}`);
                }
            }

            setImportResults(results);
            fetchGuests();
        } catch (error) {
            alert('Error parsing CSV file: ' + error);
        } finally {
            setImporting(false);
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    const totalGuests = rsvps.reduce((acc, curr) => acc + (curr.attending ? curr.number_of_guests : 0), 0);
    const totalDeclinedGuests = rsvps.filter(r => !r.attending).reduce((acc, curr) => acc + (curr.number_of_guests || 1), 0);
    const totalInvited = guests.filter(g => g.invited).reduce((acc, curr) => acc + curr.party_size, 0);
    const totalNotInvited = guests.filter(g => !g.invited).reduce((acc, curr) => acc + curr.party_size, 0);
    const likelyNotComingCount = guests.filter(g => g.rsvp_status === 'likely_not_coming').reduce((acc, curr) => acc + curr.party_size, 0);
    const totalGuestListSize = guests.filter(g => g.rsvp_status !== 'likely_not_coming').reduce((acc, curr) => acc + curr.party_size, 0);
    const missingRsvps = guests.filter(g => g.invited && !g.rsvp_status).reduce((acc, curr) => acc + curr.party_size, 0);

    const filteredGuests = guests.filter(g => {
        const memberNames = (g.party_members || []).map(m => m.name || '').join(' ');
        const matchesSearch = !guestSearch || g.guest_name.toLowerCase().includes(guestSearch.toLowerCase()) || memberNames.toLowerCase().includes(guestSearch.toLowerCase());
        if (!matchesSearch) return false;
        switch (guestFilter) {
            case 'no_response': return g.invited && !g.rsvp_status;
            case 'attending': return g.rsvp_status === 'attending';
            case 'declined': return g.rsvp_status === 'declined';
            case 'likely_not_coming': return g.rsvp_status === 'likely_not_coming';
            case 'invited': return g.invited;
            case 'not_invited': return !g.invited;
            case 'bride': return g.side === 'bride';
            case 'groom': return g.side === 'groom';
            default: return true;
        }
    });

    // People selectable as a donor / co-giver: every primary guest PLUS their
    // plus-ones and party members (which are names nested on the guest row, not
    // their own guest-list entries). id is null for non-primary people.
    const donationPeople = guests.flatMap(g => {
        const people: { id: number | null; name: string; key: string }[] = [
            { id: g.id, name: g.guest_name, key: `g-${g.id}` },
        ];
        const seen = new Set([g.guest_name.trim().toLowerCase()]);
        const addPerson = (raw: string | null | undefined, suffix: string) => {
            const name = (raw || '').trim();
            if (!name || seen.has(name.toLowerCase())) return;
            seen.add(name.toLowerCase());
            people.push({ id: null, name, key: `g-${g.id}-${suffix}` });
        };
        (g.party_members || []).forEach((m, i) => addPerson(m.name, `m${i}`));
        addPerson(g.plus_one_name, 'plus');
        return people;
    });

    const donationTotalByGuestId = donations.reduce<Record<number, number>>((acc, d) => {
        if (d.guest_id != null) acc[d.guest_id] = (acc[d.guest_id] || 0) + d.amount;
        return acc;
    }, {});

    return (
        <div>
            {/* Nav Card Subtitle */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Nav Card Subtitle</h2>
                <p className="text-sm text-gray-500 mb-3">Short tagline shown on the RSVP card at the bottom of the home page.</p>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={rsvpSubtitle}
                        onChange={(e) => setRsvpSubtitle(e.target.value)}
                        className="flex-1 rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:border-accent focus:ring-accent"
                        placeholder="e.g. Let us know you're coming"
                    />
                    <button
                        onClick={handleSaveSubtitle}
                        disabled={subtitleSaving}
                        className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-dark transition-colors disabled:opacity-50"
                    >
                        {subtitleSaving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">RSVP & Guest Management</h1>
                    <p className="text-gray-600">Track RSVPs and manage your guest list</p>
                </div>

                {/* Tab Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('rsvps')}
                        className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 shadow-md ${
                            activeTab === 'rsvps'
                                ? 'bg-accent text-white shadow-lg'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:shadow-lg'
                        }`}
                    >
                        RSVP Management
                    </button>
                    <button
                        onClick={() => setActiveTab('guestlist')}
                        className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 shadow-md ${
                            activeTab === 'guestlist'
                                ? 'bg-accent text-white shadow-lg'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:shadow-lg'
                        }`}
                    >
                        Guest List
                    </button>
                    <button
                        onClick={() => setActiveTab('donations')}
                        className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 shadow-md ${
                            activeTab === 'donations'
                                ? 'bg-accent text-white shadow-lg'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:shadow-lg'
                        }`}
                    >
                        Donations
                    </button>
                </div>
            </div>

            {/* RSVP Management Tab */}
            {activeTab === 'rsvps' && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
                            <p className="text-sm font-medium text-gray-500">Total RSVPs</p>
                            <p className="text-3xl font-bold text-gray-900">{rsvps.length}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-green-200">
                            <p className="text-sm font-medium text-green-600">Total Attending</p>
                            <p className="text-3xl font-bold text-green-700">{totalGuests}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-red-200">
                            <p className="text-sm font-medium text-red-600">Declined</p>
                            <p className="text-3xl font-bold text-red-700">{totalDeclinedGuests}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-orange-200">
                            <p className="text-sm font-medium text-orange-600">Likely Not Coming</p>
                            <p className="text-3xl font-bold text-orange-700">{likelyNotComingCount}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-yellow-200">
                            <p className="text-sm font-medium text-yellow-600">Missing RSVPs</p>
                            <p className="text-3xl font-bold text-yellow-700">{missingRsvps}</p>
                        </div>
                    </div>

                    {/* RSVP Table */}
                    <div className="bg-white shadow-lg border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Guests</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dietary</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {rsvps.map((rsvp) => {
                                        const members = Array.isArray(rsvp.dietary_restrictions)
                                            ? rsvp.dietary_restrictions.slice(1)
                                            : [];
                                        const hasParty = members.length > 0;
                                        const primaryDietary = Array.isArray(rsvp.dietary_restrictions)
                                            ? rsvp.dietary_restrictions[0]
                                            : null;
                                        const dietaryFlags = (entry: DietaryEntry | null) => {
                                            if (!entry) return '-';
                                            const flags = [
                                                entry.vegetarian && 'Vegetarian',
                                                entry.vegan && 'Vegan',
                                                entry.gluten_free && 'Gluten Free',
                                                entry.nut_allergy && 'Nut Allergy',
                                                entry.other && (entry.other_text || 'Other'),
                                            ].filter(Boolean);
                                            return flags.length ? flags.join(', ') : '-';
                                        };
                                        return (
                                            <React.Fragment key={rsvp.id}>
                                                {/* Primary guest row */}
                                                <tr className="group hover:bg-gray-50 relative">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900">{rsvp.guest_name}</div>
                                                        <div className="text-xs text-gray-400">{rsvp.email}</div>
                                                        {rsvp.phone && <div className="text-xs text-gray-400">{rsvp.phone}</div>}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${rsvp.attending ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                            {rsvp.attending ? 'Attending' : 'Declined'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {rsvp.attending ? rsvp.number_of_guests : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                                                        {dietaryFlags(primaryDietary)}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                                        {rsvp.message || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 relative">
                                                        {new Date(rsvp.created_at).toLocaleDateString()}
                                                        <div className="absolute right-0 inset-y-0 flex items-center pr-4 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-gray-50 via-gray-50 to-transparent pl-8">
                                                            <button
                                                                onClick={() => { setDeletingRsvp(rsvp); setConfirmName(''); }}
                                                                className="text-red-600 hover:text-red-900 bg-white border border-gray-200 shadow-sm px-3 py-1 rounded-md text-xs font-medium"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Party member sub-rows */}
                                                {members.map((member, mi) => (
                                                    <tr key={`${rsvp.id}-m${mi}`} className="bg-gray-50/60">
                                                        <td className="pl-10 pr-6 py-1.5 whitespace-nowrap border-l-2 border-gray-200">
                                                            <span className="text-gray-300 mr-1.5 text-xs">└</span>
                                                            <span className="text-sm text-gray-500 italic">{member.name || 'Unknown'}</span>
                                                        </td>
                                                        <td className="px-6 py-1.5 whitespace-nowrap">
                                                            <span className="px-2 inline-flex text-xs leading-5 font-medium rounded-full bg-gray-100 text-gray-500">Attending</span>
                                                        </td>
                                                        <td className="px-6 py-1.5 text-xs text-gray-300">—</td>
                                                        <td className="px-6 py-1.5 text-xs text-gray-400">{dietaryFlags(member)}</td>
                                                        <td className="px-6 py-1.5 text-xs text-gray-300">—</td>
                                                        <td className="px-6 py-1.5 text-xs text-gray-300">—</td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Guest List Tab */}
            {activeTab === 'guestlist' && (
                <>
                    {/* Guest List Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
                            <p className="text-sm font-medium text-gray-500">Total Invited</p>
                            <p className="text-3xl font-bold text-gray-900">{totalInvited}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
                            <p className="text-sm font-medium text-gray-500">Not Invited Yet</p>
                            <p className="text-3xl font-bold text-gray-900">{totalNotInvited}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
                            <p className="text-sm font-medium text-gray-500">Expected Guests</p>
                            <p className="text-3xl font-bold text-gray-900">{totalGuestListSize}</p>
                            <p className="text-xs text-gray-400 mt-1">excl. likely not coming</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-orange-200">
                            <p className="text-sm font-medium text-orange-600">Likely Not Coming</p>
                            <p className="text-3xl font-bold text-orange-700">{likelyNotComingCount}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-green-200">
                            <p className="text-sm font-medium text-gray-500">Total Attending</p>
                            <p className="text-3xl font-bold text-green-600">{totalGuests}</p>
                        </div>
                    </div>

                    {/* Bulk Actions and Add Guest Button */}
                    <div className="mb-4 flex justify-between items-center">
                        <div className="flex gap-2">
                            {selectedGuests.length > 0 && (
                                <>
                                    <span className="text-sm text-gray-600 self-center">
                                        {selectedGuests.length} selected
                                    </span>
                                    <button
                                        onClick={handleBulkMarkInvited}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 text-sm transition-all duration-300 shadow-md hover:shadow-lg"
                                    >
                                        Mark as Invited
                                    </button>
                                    <button
                                        onClick={handleBulkUnmarkInvited}
                                        className="bg-gray-500 text-white px-4 py-2 rounded-xl hover:bg-gray-600 text-sm transition-all duration-300 shadow-md hover:shadow-lg"
                                    >
                                        Mark as Not Invited
                                    </button>
                                    <button
                                        onClick={handleBulkDelete}
                                        className="bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700 text-sm transition-all duration-300 shadow-md hover:shadow-lg"
                                    >
                                        Delete Selected
                                    </button>
                                </>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowImportModal(true)}
                                className="bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 flex items-center gap-2 transition-all duration-300 shadow-md hover:shadow-lg"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                Import CSV
                            </button>
                            <button
                                onClick={() => {
                                    setIsAddingGuest(true);
                                    setGuestForm({
                                        guest_name: '',
                                        email: '',
                                        phone: '',
                                        party_size: 1,
                                        side: '',
                                        notes: '',
                                        invited: false,
                                        party_members: [],
                                        rsvp_status: '',
                                    });
                                }}
                                className="bg-accent text-white px-4 py-2 rounded-xl hover:bg-accent/90 transition-all duration-300 shadow-md hover:shadow-lg"
                            >
                                Add Guest
                            </button>
                        </div>
                    </div>

                    {/* Filters & Search */}
                    <div className="mb-4 flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            placeholder="Search guests..."
                            value={guestSearch}
                            onChange={e => setGuestSearch(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 w-full sm:w-56"
                        />
                        <div className="flex flex-wrap gap-2">
                            {([
                                { key: 'all', label: 'All', color: 'gray' },
                                { key: 'no_response', label: '⏳ No Response', color: 'yellow' },
                                { key: 'attending', label: '✓ Attending', color: 'green' },
                                { key: 'declined', label: '✗ Declined', color: 'red' },
                                { key: 'likely_not_coming', label: '🙁 Likely Not Coming', color: 'orange' },
                                { key: 'invited', label: '✉ Invited', color: 'blue' },
                                { key: 'not_invited', label: 'Not Invited', color: 'gray' },
                                { key: 'bride', label: `${config?.brideName || 'Bride'}'s Side`, color: 'pink' },
                                { key: 'groom', label: `${config?.groomName || 'Groom'}'s Side`, color: 'blue' },
                            ] as { key: GuestFilter; label: string; color: string }[]).map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setGuestFilter(f.key)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        guestFilter === f.key
                                            ? 'bg-accent text-white shadow-md'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">
                        Showing {filteredGuests.length} of {guests.length} guests
                    </p>

                    {/* Guest List Table */}
                    <div className="bg-white shadow-lg border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left">
                                            <input
                                                type="checkbox"
                                                checked={filteredGuests.length > 0 && filteredGuests.every(g => selectedGuests.includes(g.id))}
                                                onChange={toggleSelectAll}
                                                className="rounded border-gray-300 text-accent focus:ring-accent"
                                            />
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Party Size</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RSVP Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Donated</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invited</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredGuests.map((guest) => {
                                        const isLikelyNotComing = guest.rsvp_status === 'likely_not_coming';
                                        const members = guest.party_members || [];
                                        const hasParty = members.length > 0;
                                        // Find this guest's RSVP dietary data for member details
                                        const rsvp = rsvps.find(r => r.guest_name.toLowerCase() === guest.guest_name.toLowerCase());
                                        const memberDietary = Array.isArray(rsvp?.dietary_restrictions)
                                            ? rsvp.dietary_restrictions.slice(1)
                                            : [];
                                        const dietaryFlags = (entry: DietaryEntry | null | undefined) => {
                                            if (!entry) return null;
                                            const flags = [
                                                entry.vegetarian && 'Vegetarian',
                                                entry.vegan && 'Vegan',
                                                entry.gluten_free && 'Gluten Free',
                                                entry.nut_allergy && 'Nut Allergy',
                                                entry.other && (entry.other_text || 'Other'),
                                            ].filter(Boolean);
                                            return flags.length ? flags.join(', ') : null;
                                        };
                                        return (
                                        <React.Fragment key={guest.id}>
                                        <tr className={`hover:bg-gray-50 ${isLikelyNotComing ? 'bg-red-50/40' : ''}`}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedGuests.includes(guest.id)}
                                                    onChange={() => toggleGuestSelection(guest.id)}
                                                    className="rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className={`text-sm font-semibold ${isLikelyNotComing ? 'text-gray-400' : 'text-gray-900'}`}>{guest.guest_name}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className={`text-sm ${isLikelyNotComing ? 'text-gray-400' : 'text-gray-500'}`}>{guest.email || '-'}</div>
                                                <div className={`text-sm ${isLikelyNotComing ? 'text-gray-400' : 'text-gray-500'}`}>{guest.phone || '-'}</div>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${isLikelyNotComing ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {guest.party_size}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {guest.rsvp_status === 'attending' ? (
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Attending</span>
                                                ) : guest.rsvp_status === 'declined' ? (
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Declined</span>
                                                ) : guest.rsvp_status === 'likely_not_coming' ? (
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-700">Likely Not Coming</span>
                                                ) : (
                                                    <span className="text-sm text-gray-400">No Response</span>
                                                )}
                                            </td>
                                            <td className={`px-6 py-4 text-sm max-w-xs truncate ${isLikelyNotComing ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {guest.notes || '-'}
                                            </td>
                                            <td className={`px-6 py-4 text-sm max-w-xs truncate ${isLikelyNotComing ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {guest.address || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                {donationTotalByGuestId[guest.id] ? `$${donationTotalByGuestId[guest.id].toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                    guest.invited ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {guest.invited ? 'Invited' : 'Not Invited'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={() => handleMarkLikelyNotComing(guest)}
                                                    title={isLikelyNotComing ? 'Clear likely not coming' : 'Mark as likely not coming'}
                                                    className={`mr-3 text-xs px-2 py-1 rounded ${isLikelyNotComing ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-gray-100 text-gray-500 hover:bg-orange-100 hover:text-orange-700'}`}
                                                >
                                                    🙁
                                                </button>
                                                <button
                                                    onClick={() => openEditGuest(guest)}
                                                    className="text-blue-600 hover:text-blue-900 mr-4"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteGuest(guest.id)}
                                                    className="text-red-600 hover:text-red-900"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                        {/* Party member sub-rows */}
                                        {members.map((member, mi) => {
                                            const mDietary = memberDietary[mi];
                                            const mAttending = !!mDietary;
                                            const flags = dietaryFlags(mDietary);
                                            return (
                                                <tr key={`${guest.id}-m${mi}`} className="bg-gray-50/60">
                                                    <td className="px-6 py-1.5" />
                                                    <td className="pl-10 pr-6 py-1.5 whitespace-nowrap border-l-2 border-gray-200">
                                                        <span className="text-gray-300 mr-1.5 text-xs">└</span>
                                                        <span className="text-sm text-gray-500 italic">
                                                            {member.name || `Unknown Guest ${mi + 2}`}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-1.5 text-xs text-gray-300">—</td>
                                                    <td className="px-6 py-1.5 text-xs text-gray-300">—</td>
                                                    <td className="px-6 py-1.5 whitespace-nowrap">
                                                        {mAttending ? (
                                                            <span className="px-2 inline-flex text-xs leading-5 font-medium rounded-full bg-gray-100 text-gray-500">Attending</span>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-1.5 text-xs text-gray-400" colSpan={3}>
                                                        {flags || '—'}
                                                    </td>
                                                    <td className="px-6 py-1.5 text-xs text-gray-300">—</td>
                                                    <td className="px-6 py-1.5" />
                                                </tr>
                                            );
                                        })}
                                        </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'donations' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-sm text-gray-500">{donations.length} donation{donations.length === 1 ? '' : 's'} · Total ${donations.reduce((s, d) => s + d.amount, 0).toLocaleString()}</p>
                        <button
                            onClick={() => setShowDonationModal(true)}
                            className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
                        >
                            + Log Donation
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Guest</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fund</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {donations.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-400">No donations recorded yet.</td></tr>
                                ) : donations.map(d => (
                                    <tr key={d.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                            {[d.guest_name, ...((d.co_donors || []).map(c => c.name))].join(', ')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${d.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{d.fund_item_title || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{d.event || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(d.created_at).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                            <button onClick={() => openEditDonation(d)} className="text-accent hover:text-accent-dark mr-3">Edit</button>
                                            <button onClick={() => setDeletingDonation(d)} className="text-red-600 hover:text-red-800">Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Log Donation Modal */}
            {showDonationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40" onClick={resetDonationModal} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">{editingDonationId ? 'Edit Donation' : 'Log a Donation'}</h2>

                        <label className="block text-sm font-medium text-gray-700 mb-1">Who donated?</label>
                        {donationDonor ? (
                            <div className="flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4">
                                <span>{donationDonor.guest_name}</span>
                                <button type="button" onClick={() => { setDonationDonor(null); setDonationDonorSearch(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <input
                                    type="text"
                                    value={donationDonorSearch}
                                    onChange={e => setDonationDonorSearch(e.target.value)}
                                    placeholder="Search guest list..."
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                />
                                {donationDonorSearch.trim() && (
                                    <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                                        {donationPeople
                                            .filter(p => p.name.toLowerCase().includes(donationDonorSearch.toLowerCase()))
                                            .slice(0, 8)
                                            .map(p => (
                                                <button
                                                    key={p.key}
                                                    type="button"
                                                    onClick={() => { setDonationDonor({ id: p.id ?? 0, guest_name: p.name }); setDonationDonorSearch(''); }}
                                                    className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                                                >
                                                    {p.name}
                                                </button>
                                            ))}
                                        {donationPeople.filter(p => p.name.toLowerCase().includes(donationDonorSearch.toLowerCase())).length === 0 && (
                                            <p className="px-3 py-2 text-sm text-gray-400">No matching guest</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <label className="block text-sm font-medium text-gray-700 mb-1">Co-givers (optional)</label>
                        {coGivers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                                {coGivers.map(c => (
                                    <span key={c.name} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-1 text-xs">
                                        {c.name}
                                        <button type="button" onClick={() => removeCoGiver(c.name)} className="text-gray-400 hover:text-gray-600">✕</button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <input
                            type="text"
                            value={coGiverSearch}
                            onChange={e => setCoGiverSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && coGiverSearch.trim()) { e.preventDefault(); addCoGiver({ id: null, name: coGiverSearch }); } }}
                            placeholder="Add a co-giver (type & Enter, or pick below)"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                        />
                        {coGiverSearch.trim() && (
                            <div className="-mt-3 mb-4 max-h-32 overflow-y-auto border border-gray-200 rounded-lg">
                                {donationPeople
                                    .filter(p => p.name.toLowerCase().includes(coGiverSearch.toLowerCase()))
                                    .slice(0, 8)
                                    .map(p => (
                                        <button key={p.key} type="button" onClick={() => addCoGiver({ id: p.id, name: p.name })}
                                            className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
                                            {p.name}
                                        </button>
                                    ))}
                            </div>
                        )}

                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount received ($)</label>
                        <input
                            type="number"
                            value={donationAmount}
                            onChange={e => setDonationAmount(e.target.value)}
                            placeholder="0"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                        />

                        <label className="block text-sm font-medium text-gray-700 mb-1">Fund</label>
                        <select
                            value={donationFundId}
                            onChange={e => setDonationFundId(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                        >
                            <option value="">Select a fund...</option>
                            {(config?.registry?.items || []).map((f: FundItem) => (
                                <option key={f.id} value={f.id}>{f.title}</option>
                            ))}
                        </select>

                        <label className="block text-sm font-medium text-gray-700 mb-1">From what event?</label>
                        <select
                            value={donationEvent}
                            onChange={e => setDonationEvent(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
                        >
                            <option>Bridal Shower</option>
                            <option>Engagement Party</option>
                            <option>Wedding Day</option>
                            <option>Other</option>
                        </select>
                        {donationEvent === 'Other' && (
                            <input
                                type="text"
                                value={donationOtherEvent}
                                onChange={e => setDonationOtherEvent(e.target.value)}
                                placeholder="Name the event"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                            />
                        )}

                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={saveDonation}
                                disabled={savingDonation || !donationDonor || !donationAmount || !donationFundId}
                                className="flex-1 bg-accent text-white py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                            >
                                {savingDonation ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={resetDonationModal} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Donation Modal */}
            {deletingDonation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setDeletingDonation(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
                        <h2 className="text-lg font-bold text-gray-900 mb-2">Delete donation?</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            {deletingDonation.guest_name} — ${deletingDonation.amount.toLocaleString()} toward {deletingDonation.fund_item_title || 'a fund'}. This subtracts the amount from that fund&apos;s progress and cannot be undone.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={confirmDeleteDonation} disabled={savingDonation}
                                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-40">
                                {savingDonation ? 'Deleting...' : 'Delete'}
                            </button>
                            <button onClick={() => setDeletingDonation(null)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete RSVP Modal */}
            {deletingRsvp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Deletion</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Are you sure you want to delete the RSVP for <strong>{deletingRsvp.guest_name}</strong>?
                            This action cannot be undone.
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                            Type <strong>{deletingRsvp.guest_name}</strong> to confirm:
                        </p>
                        <input
                            type="text"
                            value={confirmName}
                            onChange={(e) => setConfirmName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm mb-6"
                            placeholder="Type guest name here"
                        />
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setDeletingRsvp(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-300 shadow-md hover:shadow-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteRsvp}
                                disabled={confirmName !== deletingRsvp.guest_name}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-md hover:shadow-lg"
                            >
                                Delete RSVP
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Guest Modal */}
            {(isAddingGuest || editingGuest) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-xl">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            {editingGuest ? 'Edit Guest' : 'Add Guest'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Guest Name *
                                </label>
                                <input
                                    type="text"
                                    value={guestForm.guest_name}
                                    onChange={(e) => setGuestForm({ ...guestForm, guest_name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    required
                                />
                            </div>

                            {/* Party member name slots — party_size - 1 inputs */}
                            {Array.from({ length: Math.max(0, guestForm.party_size - 1) }, (_, i) => (
                                <div key={i}>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Guest {i + 2} Name <span className="text-gray-400 font-normal">(leave blank if unknown)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={guestForm.party_members[i]?.name ?? ''}
                                        onChange={(e) => {
                                            const updated = [...guestForm.party_members];
                                            while (updated.length <= i) updated.push({ name: null });
                                            updated[i] = { name: e.target.value || null };
                                            setGuestForm({ ...guestForm, party_members: updated });
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        placeholder="Optional"
                                    />
                                </div>
                            ))}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={guestForm.email}
                                        onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Phone
                                    </label>
                                    <input
                                        type="tel"
                                        value={guestForm.phone}
                                        onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Party Size
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={guestForm.party_size}
                                        onChange={(e) => {
                                            const size = parseInt(e.target.value) || 1;
                                            const slots = Array.from({ length: Math.max(0, size - 1) }, (_, i) => ({
                                                name: guestForm.party_members[i]?.name ?? null,
                                            }));
                                            setGuestForm({ ...guestForm, party_size: size, party_members: slots });
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Side
                                    </label>
                                    <select
                                        value={guestForm.side}
                                        onChange={(e) => setGuestForm({ ...guestForm, side: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="">Not Specified</option>
                                        <option value="bride">{config?.brideName || "Bride"}'s Side</option>
                                        <option value="groom">{config?.groomName || "Groom"}'s Side</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Notes
                                </label>
                                <textarea
                                    value={guestForm.notes}
                                    onChange={(e) => setGuestForm({ ...guestForm, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    rows={3}
                                />
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={guestForm.invited}
                                    onChange={(e) => setGuestForm({ ...guestForm, invited: e.target.checked })}
                                    className="h-4 w-4 text-accent border-gray-300 rounded"
                                />
                                <label className="ml-2 block text-sm text-gray-700">
                                    Invited
                                </label>
                            </div>

                            {editingGuest && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        RSVP Status (Admin)
                                    </label>
                                    <select
                                        value={guestForm.rsvp_status}
                                        onChange={(e) => setGuestForm({ ...guestForm, rsvp_status: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="">No Response</option>
                                        <option value="attending">Attending</option>
                                        <option value="declined">Declined</option>
                                        <option value="likely_not_coming">Likely Not Coming</option>
                                    </select>
                                    <p className="text-xs text-gray-400 mt-1">Admin-only. &quot;Likely Not Coming&quot; excludes this guest from expected headcount and seating chart.</p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setIsAddingGuest(false);
                                    setEditingGuest(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-300 shadow-md hover:shadow-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveGuest}
                                disabled={!guestForm.guest_name}
                                className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-all duration-300 shadow-md hover:shadow-lg"
                            >
                                {editingGuest ? 'Update' : 'Add'} Guest
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CSV Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6">
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">Import Guests from CSV</h3>

                        {!importResults ? (
                            <>
                                <div className="mb-6">
                                    <p className="text-sm text-gray-600 mb-4">
                                        Upload a CSV file with guest information. The CSV should have a header row with the following columns:
                                    </p>
                                    <div className="bg-gray-50 p-4 rounded-md">
                                        <code className="text-sm text-gray-800">
                                            name,email,phone,party_size,side,notes,plus_one_name,address
                                        </code>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Example: John Doe,john@email.com,555-1234,2,bride,Vegan meal,Jane Doe,"123 Main St, Milwaukee, WI 53201"
                                    </p>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Select CSV File
                                    </label>
                                    <input
                                        type="file"
                                        accept=".csv"
                                        onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setShowImportModal(false);
                                            setCsvFile(null);
                                            setImportResults(null);
                                        }}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-300 shadow-md hover:shadow-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleImportCSV}
                                        disabled={!csvFile || importing}
                                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all duration-300 shadow-md hover:shadow-lg"
                                    >
                                        {importing ? 'Importing...' : 'Import'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="mb-6">
                                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Import Results</h4>
                                    <div className="grid grid-cols-3 gap-4 mb-4">
                                        <div className="bg-green-50 p-4 rounded-md">
                                            <p className="text-sm text-gray-600">Added</p>
                                            <p className="text-2xl font-bold text-green-600">{importResults.added}</p>
                                        </div>
                                        <div className="bg-blue-50 p-4 rounded-md">
                                            <p className="text-sm text-gray-600">Updated</p>
                                            <p className="text-2xl font-bold text-blue-600">{importResults.updated}</p>
                                        </div>
                                        <div className="bg-red-50 p-4 rounded-md">
                                            <p className="text-sm text-gray-600">Failed</p>
                                            <p className="text-2xl font-bold text-red-600">{importResults.failed}</p>
                                        </div>
                                    </div>

                                    {importResults.errors.length > 0 && (
                                        <div className="bg-red-50 p-4 rounded-md max-h-48 overflow-y-auto">
                                            <p className="text-sm font-semibold text-red-800 mb-2">Errors:</p>
                                            <ul className="text-xs text-red-700 space-y-1">
                                                {importResults.errors.map((error, idx) => (
                                                    <li key={idx}>• {error}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        onClick={() => {
                                            setShowImportModal(false);
                                            setCsvFile(null);
                                            setImportResults(null);
                                        }}
                                        className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-xl hover:bg-accent/90 transition-all duration-300 shadow-md hover:shadow-lg"
                                    >
                                        Close
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
