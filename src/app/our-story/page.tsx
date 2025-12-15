'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Milestone {
    id: number;
    title: string;
    date: string;
    dateFormat?: 'exact' | 'month-year';
    description: string;
    photos: string[];
    photoAligns?: ('top' | 'top-center' | 'center' | 'center-bottom' | 'bottom')[];
}

export default function OurStoryPage() {
    const [milestones, setMilestones] = useState<Milestone[]>([]);

    useEffect(() => {
        fetch('/api/admin/timeline')
            .then(res => res.json())
            .then(data => {
                // Sort by date (oldest first for timeline)
                const sorted = (data.milestones || []).sort((a: Milestone, b: Milestone) => {
                    return new Date(a.date).getTime() - new Date(b.date).getTime();
                });
                setMilestones(sorted);
            })
            .catch(err => console.error('Error loading timeline:', err));
    }, []);

    const formatDate = (dateString: string, dateFormat?: 'exact' | 'month-year') => {
        // Parse date as local timezone to avoid day-before issue
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day || 1);

        if (dateFormat === 'month-year') {
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long'
            });
        }

        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getObjectPositionClass = (align?: 'top' | 'top-center' | 'center' | 'center-bottom' | 'bottom') => {
        switch (align) {
            case 'top':
                return 'object-top';
            case 'top-center':
                return 'object-[50%_25%]';
            case 'center-bottom':
                return 'object-[50%_75%]';
            case 'bottom':
                return 'object-bottom';
            case 'center':
            default:
                return 'object-center';
        }
    };

    return (
        <div className="bg-white py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-serif text-gray-900 tracking-tight sm:text-5xl mb-4">
                        Our Story
                    </h1>
                    <p className="text-xl text-gray-500">
                        The journey of our love
                    </p>
                </div>

                {/* Timeline */}
                <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-1/2 transform -translate-x-1/2 w-0.5 h-full bg-accent/20"></div>

                    {/* Timeline items */}
                    <div className="space-y-12">
                        {milestones.map((milestone, index) => (
                            <div
                                key={milestone.id}
                                className={`relative flex items-center ${
                                    index % 2 === 0 ? 'flex-row' : 'flex-row-reverse'
                                }`}
                            >
                                {/* Content */}
                                <div className={`w-5/12 ${index % 2 === 0 ? 'text-right pr-8' : 'text-left pl-8'}`}>
                                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                                        <h3 className="text-2xl font-serif text-gray-900 mb-2">
                                            {milestone.title}
                                        </h3>
                                        <p className="text-sm text-accent font-medium mb-3">
                                            {formatDate(milestone.date, milestone.dateFormat)}
                                        </p>
                                        <p className="text-gray-600 leading-relaxed">
                                            {milestone.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Center dot */}
                                <div className="absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-accent rounded-full border-4 border-white shadow-lg z-10"></div>

                                {/* Photos */}
                                <div className={`w-5/12 ${index % 2 === 0 ? 'pl-8' : 'pr-8'}`}>
                                    {milestone.photos && milestone.photos.length > 0 && (
                                        <>
                                            {milestone.photos.length === 1 ? (
                                                <div className="relative h-64 w-full rounded-2xl overflow-hidden shadow-lg border-4 border-white transform hover:rotate-0 transition-transform duration-500 rotate-2">
                                                    <Image
                                                        src={`/api/photos/${milestone.photos[0]}`}
                                                        alt={milestone.title}
                                                        fill
                                                        unoptimized
                                                        className={`object-cover ${getObjectPositionClass(milestone.photoAligns?.[0])}`}
                                                        sizes="(max-width: 768px) 100vw, 50vw"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex gap-4 items-center">
                                                    {milestone.photos.map((photo, photoIdx) => (
                                                        <div
                                                            key={photoIdx}
                                                            className={`relative h-56 flex-1 rounded-2xl overflow-hidden shadow-lg border-4 border-white transform hover:rotate-0 transition-transform duration-500 ${
                                                                photoIdx === 0 ? '-rotate-3' : 'rotate-3'
                                                            }`}
                                                        >
                                                            <Image
                                                                src={`/api/photos/${photo}`}
                                                                alt={`${milestone.title} ${photoIdx + 1}`}
                                                                fill
                                                                unoptimized
                                                                className={`object-cover ${getObjectPositionClass(milestone.photoAligns?.[photoIdx])}`}
                                                                sizes="(max-width: 768px) 50vw, 25vw"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {milestones.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No milestones have been added yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
