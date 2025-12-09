'use client';

import { useState, useEffect } from 'react';

interface ScheduleEvent {
    time: string;
    title: string;
    description: string;
    location: string;
}

export default function AdminSchedule() {
    const [events, setEvents] = useState<ScheduleEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => {
                if (data.scheduleEvents) {
                    setEvents(data.scheduleEvents);
                } else {
                    // Default starter event if empty
                    setEvents([{ time: '4:00 PM', title: 'Ceremony', description: '', location: '' }]);
                }
            });
    }, []);

    const handleEventChange = (index: number, field: keyof ScheduleEvent, value: string) => {
        const newEvents = [...events];
        newEvents[index][field] = value;
        setEvents(newEvents);
    };

    const addEvent = () => {
        setEvents([...events, { time: '', title: '', description: '', location: '' }]);
    };

    const removeEvent = (index: number) => {
        const newEvents = events.filter((_, i) => i !== index);
        setEvents(newEvents);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            // Only update scheduleEvents property
            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scheduleEvents: events }),
            });

            if (res.ok) {
                setMessage('Schedule updated successfully!');
            } else {
                setMessage('Failed to update.');
            }
        } catch (err) {
            console.error(err);
            setMessage('An error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Schedule Management</h1>

            {message && (
                <div className={`p-4 rounded-md mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="bg-white p-8 rounded-lg border border-gray-200 shadow-sm space-y-6">

                    {events.map((event, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-md border border-gray-200 relative group">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 uppercase">Time</label>
                                    <input
                                        type="text"
                                        value={event.time}
                                        onChange={(e) => handleEventChange(index, 'time', e.target.value)}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                        placeholder="e.g. 4:00 PM"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 uppercase">Event Title</label>
                                    <input
                                        type="text"
                                        value={event.title}
                                        onChange={(e) => handleEventChange(index, 'title', e.target.value)}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                        placeholder="e.g. Ceremony"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-gray-500 uppercase">Location</label>
                                    <input
                                        type="text"
                                        value={event.location}
                                        onChange={(e) => handleEventChange(index, 'location', e.target.value)}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                        placeholder="e.g. Garden Courtyard"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-gray-500 uppercase">Description</label>
                                    <input
                                        type="text"
                                        value={event.description}
                                        onChange={(e) => handleEventChange(index, 'description', e.target.value)}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                        placeholder="Brief details..."
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => removeEvent(index)}
                                className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1"
                                title="Remove Event"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    ))}

                    <button
                        type="button"
                        onClick={addEvent}
                        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-accent hover:text-accent transition-colors font-medium flex items-center justify-center gap-2"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Add New Event
                    </button>

                </div>

                <div className="pt-4 sticky bottom-6">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full md:w-auto ml-auto flex justify-center py-3 px-8 border border-transparent rounded-md shadow-lg text-base font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Saving Schedule...' : 'Save Schedule Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}
