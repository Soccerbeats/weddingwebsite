'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

interface Milestone {
    id: number;
    title: string;
    date: string;
    description: string;
    photos: string[];
}

export default function AdminTimeline() {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef1 = useRef<HTMLInputElement>(null);
    const fileInputRef2 = useRef<HTMLInputElement>(null);
    const editFileInputRef1 = useRef<HTMLInputElement>(null);
    const editFileInputRef2 = useRef<HTMLInputElement>(null);
    const [editFiles, setEditFiles] = useState<{ file1: File | null; file2: File | null }>({ file1: null, file2: null });

    const [formData, setFormData] = useState({
        title: '',
        date: '',
        description: '',
        file1: null as File | null,
        file2: null as File | null
    });

    useEffect(() => {
        fetchMilestones();
    }, []);

    const fetchMilestones = async () => {
        const res = await fetch('/api/admin/timeline');
        const data = await res.json();
        setMilestones(data.milestones || []);
    };

    const handleAddMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        try {
            const formDataToSend = new FormData();
            formDataToSend.append('title', formData.title);
            formDataToSend.append('date', formData.date);
            formDataToSend.append('description', formData.description);
            if (formData.file1) {
                formDataToSend.append('file1', formData.file1);
            }
            if (formData.file2) {
                formDataToSend.append('file2', formData.file2);
            }

            const res = await fetch('/api/admin/timeline', {
                method: 'POST',
                body: formDataToSend,
            });

            if (res.ok) {
                await fetchMilestones();
                setShowAddModal(false);
                setFormData({ title: '', date: '', description: '', file1: null, file2: null });
                if (fileInputRef1.current) fileInputRef1.current.value = '';
                if (fileInputRef2.current) fileInputRef2.current.value = '';
            }
        } catch (err) {
            console.error('Failed to add milestone:', err);
        } finally {
            setUploading(false);
        }
    };

    const handleEdit = (milestone: Milestone) => {
        setEditingMilestone(milestone);
    };

    const handleSaveEdit = async () => {
        if (!editingMilestone) return;
        setUploading(true);

        try {
            const formDataToSend = new FormData();
            formDataToSend.append('id', editingMilestone.id.toString());
            formDataToSend.append('title', editingMilestone.title);
            formDataToSend.append('date', editingMilestone.date);
            formDataToSend.append('description', editingMilestone.description);

            // Add existing photos
            formDataToSend.append('existingPhotos', JSON.stringify(editingMilestone.photos || []));

            // Add new photos if provided
            if (editFiles.file1) {
                formDataToSend.append('file1', editFiles.file1);
            }
            if (editFiles.file2) {
                formDataToSend.append('file2', editFiles.file2);
            }

            const res = await fetch('/api/admin/timeline', {
                method: 'PATCH',
                body: formDataToSend,
            });

            if (res.ok) {
                await fetchMilestones();
                setEditingMilestone(null);
                setEditFiles({ file1: null, file2: null });
                if (editFileInputRef1.current) editFileInputRef1.current.value = '';
                if (editFileInputRef2.current) editFileInputRef2.current.value = '';
            }
        } catch (err) {
            console.error('Failed to update milestone:', err);
        } finally {
            setUploading(false);
        }
    };

    const handleDeletePhoto = (photoToDelete: string) => {
        if (!editingMilestone) return;
        const updatedPhotos = editingMilestone.photos.filter(p => p !== photoToDelete);
        setEditingMilestone({ ...editingMilestone, photos: updatedPhotos });
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this milestone?')) return;

        try {
            const res = await fetch('/api/admin/timeline', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });

            if (res.ok) {
                await fetchMilestones();
            }
        } catch (err) {
            console.error('Failed to delete milestone:', err);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Timeline Management</h1>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-accent text-white px-4 py-2 rounded-md hover:bg-accent-dark transition-colors"
                >
                    Add Milestone
                </button>
            </div>

            {/* Milestones List */}
            <div className="space-y-4">
                {milestones.map((milestone) => (
                    <div
                        key={milestone.id}
                        className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"
                    >
                        <div className="flex gap-6">
                            {/* Photos */}
                            {milestone.photos && milestone.photos.length > 0 && (
                                <div className="flex gap-2 flex-shrink-0">
                                    {milestone.photos.map((photo, idx) => (
                                        <div key={idx} className="w-32 h-32 relative rounded-lg overflow-hidden">
                                            <Image
                                                src={`/api/photos/${photo}`}
                                                alt={`${milestone.title} ${idx + 1}`}
                                                fill
                                                unoptimized
                                                className="object-cover"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Content */}
                            <div className="flex-1">
                                <h3 className="text-xl font-serif text-gray-900 mb-1">
                                    {milestone.title}
                                </h3>
                                <p className="text-sm text-accent font-medium mb-2">
                                    {formatDate(milestone.date)}
                                </p>
                                <p className="text-gray-600 text-sm">
                                    {milestone.description}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => handleEdit(milestone)}
                                    className="text-blue-600 hover:text-blue-800 text-sm"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(milestone.id)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {milestones.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <p className="text-gray-500">No milestones added yet. Click "Add Milestone" to get started.</p>
                    </div>
                )}
            </div>

            {/* Add Milestone Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Milestone</h3>

                        <form onSubmit={handleAddMilestone} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Title *
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-accent focus:border-accent"
                                    placeholder="e.g., We Met"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Date *
                                </label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-accent focus:border-accent"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description *
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-accent focus:border-accent"
                                    placeholder="Tell the story of this milestone..."
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Photo 1 (optional)
                                </label>
                                <input
                                    ref={fileInputRef1}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setFormData({ ...formData, file1: e.target.files?.[0] || null })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Photo 2 (optional)
                                </label>
                                <input
                                    ref={fileInputRef2}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setFormData({ ...formData, file2: e.target.files?.[0] || null })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setFormData({ title: '', date: '', description: '', file1: null, file2: null });
                                        if (fileInputRef1.current) fileInputRef1.current.value = '';
                                        if (fileInputRef2.current) fileInputRef2.current.value = '';
                                    }}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploading}
                                    className="flex-1 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50"
                                >
                                    {uploading ? 'Adding...' : 'Add Milestone'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Milestone Modal */}
            {editingMilestone && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Milestone</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Title
                                </label>
                                <input
                                    type="text"
                                    value={editingMilestone.title}
                                    onChange={(e) => setEditingMilestone({ ...editingMilestone, title: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-accent focus:border-accent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Date
                                </label>
                                <input
                                    type="date"
                                    value={editingMilestone.date}
                                    onChange={(e) => setEditingMilestone({ ...editingMilestone, date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-accent focus:border-accent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={editingMilestone.description}
                                    onChange={(e) => setEditingMilestone({ ...editingMilestone, description: e.target.value })}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-accent focus:border-accent"
                                />
                            </div>

                            {/* Existing Photos */}
                            {editingMilestone.photos && editingMilestone.photos.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Current Photos
                                    </label>
                                    <div className="flex gap-2">
                                        {editingMilestone.photos.map((photo, idx) => (
                                            <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200">
                                                <Image
                                                    src={`/api/photos/${photo}`}
                                                    alt={`Photo ${idx + 1}`}
                                                    fill
                                                    unoptimized
                                                    className="object-cover"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeletePhoto(photo)}
                                                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                                >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Add New Photos */}
                            {(!editingMilestone.photos || editingMilestone.photos.length < 2) && (
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Add Photos (up to 2 total)
                                    </label>
                                    {(!editingMilestone.photos || editingMilestone.photos.length === 0) && (
                                        <>
                                            <input
                                                ref={editFileInputRef1}
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => setEditFiles({ ...editFiles, file1: e.target.files?.[0] || null })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                            />
                                            <input
                                                ref={editFileInputRef2}
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => setEditFiles({ ...editFiles, file2: e.target.files?.[0] || null })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                            />
                                        </>
                                    )}
                                    {editingMilestone.photos && editingMilestone.photos.length === 1 && (
                                        <input
                                            ref={editFileInputRef1}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => setEditFiles({ ...editFiles, file1: e.target.files?.[0] || null })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                        />
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setEditingMilestone(null)}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={uploading}
                                className="flex-1 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50"
                            >
                                {uploading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
