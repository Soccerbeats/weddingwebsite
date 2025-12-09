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

export default function RSVPCashboard() {
    const [rsvps, setRsvps] = useState<RSVP[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingRsvp, setDeletingRsvp] = useState<RSVP | null>(null);
    const [confirmName, setConfirmName] = useState('');

    useEffect(() => {
        fetchRsvps();
    }, []);

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

    const handleDelete = async () => {
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

    if (loading) return <div className="p-8">Loading...</div>;

    const totalGuests = rsvps.reduce((acc, curr) => acc + (curr.attending ? curr.number_of_guests : 0), 0);
    const totalAttending = rsvps.filter(r => r.attending).length;
    const totalDeclined = rsvps.filter(r => !r.attending).length;

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">RSVP Management</h1>

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

            {/* Table */}
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

                                        {/* Hover Actions Overlay */}
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

            {/* Delete Modal */}
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
                                onClick={handleDelete}
                                disabled={confirmName !== deletingRsvp.guest_name}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Delete RSVP
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
