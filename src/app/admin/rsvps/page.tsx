'use client';

import { useEffect, useState } from 'react';

interface RSVP {
    id: number;
    guest_name: string;
    email: string;
    phone: string;
    attending: boolean;
    number_of_guests: number;
    dietary_restrictions: string;
    message: string;
    created_at: string;
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
    created_at: string;
}

type Tab = 'rsvps' | 'guestlist';

export default function RSVPDashboard() {
    const [activeTab, setActiveTab] = useState<Tab>('rsvps');
    const [rsvps, setRsvps] = useState<RSVP[]>([]);
    const [guests, setGuests] = useState<Guest[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingRsvp, setDeletingRsvp] = useState<RSVP | null>(null);
    const [confirmName, setConfirmName] = useState('');
    const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
    const [isAddingGuest, setIsAddingGuest] = useState(false);
    const [selectedGuests, setSelectedGuests] = useState<number[]>([]);
    const [config, setConfig] = useState<any>(null);
    const [guestForm, setGuestForm] = useState({
        guest_name: '',
        email: '',
        phone: '',
        party_size: 1,
        side: '',
        notes: '',
        invited: false,
    });

    useEffect(() => {
        fetchRsvps();
        fetchGuests();
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const response = await fetch('/api/admin/site-config');
            const data = await response.json();
            setConfig(data);
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
        setGuestForm({
            guest_name: guest.guest_name,
            email: guest.email || '',
            phone: guest.phone || '',
            party_size: guest.party_size,
            side: guest.side || '',
            notes: guest.notes || '',
            invited: guest.invited,
        });
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

    if (loading) return <div className="p-8">Loading...</div>;

    const totalGuests = rsvps.reduce((acc, curr) => acc + (curr.attending ? curr.number_of_guests : 0), 0);
    const totalAttending = rsvps.filter(r => r.attending).length;
    const totalDeclined = rsvps.filter(r => !r.attending).length;
    const totalInvited = guests.filter(g => g.invited).length;
    const totalGuestListSize = guests.reduce((acc, curr) => acc + curr.party_size, 0);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900">RSVP & Guest Management</h1>

                {/* Tab Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('rsvps')}
                        className={`px-4 py-2 rounded-md font-medium transition-colors ${
                            activeTab === 'rsvps'
                                ? 'bg-accent text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        RSVP Management
                    </button>
                    <button
                        onClick={() => setActiveTab('guestlist')}
                        className={`px-4 py-2 rounded-md font-medium transition-colors ${
                            activeTab === 'guestlist'
                                ? 'bg-accent text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Guest List
                    </button>
                </div>
            </div>

            {/* RSVP Management Tab */}
            {activeTab === 'rsvps' && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <p className="text-sm font-medium text-gray-500">Total Guests</p>
                            <p className="text-3xl font-bold text-gray-900">{totalGuests}</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <p className="text-sm font-medium text-green-600">Parties Attending</p>
                            <p className="text-3xl font-bold text-gray-900">{totalAttending}</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <p className="text-sm font-medium text-red-600">Declined</p>
                            <p className="text-3xl font-bold text-gray-900">{totalDeclined}</p>
                        </div>
                    </div>

                    {/* RSVP Table */}
                    <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
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
                                    {rsvps.map((rsvp) => (
                                        <tr key={rsvp.id} className="group hover:bg-gray-50 relative">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{rsvp.guest_name}</div>
                                                <div className="text-sm text-gray-500">{rsvp.email}</div>
                                                {rsvp.phone && <div className="text-sm text-gray-500">{rsvp.phone}</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${rsvp.attending ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {rsvp.attending ? 'Attending' : 'Declined'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {rsvp.attending ? rsvp.number_of_guests : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                                {rsvp.dietary_restrictions || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                                {rsvp.message || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 relative">
                                                {new Date(rsvp.created_at).toLocaleDateString()}
                                                <div className="absolute right-0 inset-y-0 flex items-center pr-4 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-gray-50 via-gray-50 to-transparent pl-8">
                                                    <button
                                                        onClick={() => {
                                                            setDeletingRsvp(rsvp);
                                                            setConfirmName('');
                                                        }}
                                                        className="text-red-600 hover:text-red-900 bg-white border border-gray-200 shadow-sm px-3 py-1 rounded-md text-xs font-medium"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <p className="text-sm font-medium text-gray-500">Total Invited</p>
                            <p className="text-3xl font-bold text-gray-900">{totalInvited}</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <p className="text-sm font-medium text-gray-500">Expected Guests</p>
                            <p className="text-3xl font-bold text-gray-900">{totalGuestListSize}</p>
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
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                                    >
                                        Mark as Invited
                                    </button>
                                    <button
                                        onClick={handleBulkDelete}
                                        className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 text-sm"
                                    >
                                        Delete Selected
                                    </button>
                                </>
                            )}
                        </div>
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
                                });
                            }}
                            className="bg-accent text-white px-4 py-2 rounded-md hover:bg-accent/90"
                        >
                            Add Guest
                        </button>
                    </div>

                    {/* Guest List Table */}
                    <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left">
                                            <input
                                                type="checkbox"
                                                checked={selectedGuests.length === guests.length && guests.length > 0}
                                                onChange={toggleSelectAll}
                                                className="rounded border-gray-300 text-accent focus:ring-accent"
                                            />
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Party Size</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RSVP Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invited</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {guests.map((guest) => (
                                        <tr key={guest.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedGuests.includes(guest.id)}
                                                    onChange={() => toggleGuestSelection(guest.id)}
                                                    className="rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{guest.guest_name}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-500">{guest.email || '-'}</div>
                                                <div className="text-sm text-gray-500">{guest.phone || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {guest.party_size}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {guest.rsvp_status ? (
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                        guest.rsvp_status === 'attending' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {guest.rsvp_status === 'attending' ? 'Attending' : 'Declined'}
                                                    </span>
                                                ) : (
                                                    <span className="text-sm text-gray-400">No Response</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                                {guest.notes || '-'}
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
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Delete RSVP Modal */}
            {deletingRsvp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-lg max-w-md w-full p-6">
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm mb-6"
                            placeholder="Type guest name here"
                        />
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setDeletingRsvp(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteRsvp}
                                disabled={confirmName !== deletingRsvp.guest_name}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={guestForm.email}
                                        onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                                        onChange={(e) => setGuestForm({ ...guestForm, party_size: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Side
                                    </label>
                                    <select
                                        value={guestForm.side}
                                        onChange={(e) => setGuestForm({ ...guestForm, side: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setIsAddingGuest(false);
                                    setEditingGuest(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveGuest}
                                disabled={!guestForm.guest_name}
                                className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-50"
                            >
                                {editingGuest ? 'Update' : 'Add'} Guest
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
