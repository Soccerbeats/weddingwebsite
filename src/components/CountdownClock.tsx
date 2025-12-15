'use client';

import { useState, useEffect } from 'react';

interface CountdownClockProps {
    weddingDate: string;
    weddingTime: string;
    countdownMode?: 'full' | 'simple' | 'days-only';
}

interface TimeLeft {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
}

export default function CountdownClock({ weddingDate, weddingTime, countdownMode = 'full' }: CountdownClockProps) {
    const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
    const [mounted, setMounted] = useState(false);
    const isSimpleMode = countdownMode === 'simple';
    const isDaysOnlyMode = countdownMode === 'days-only';

    useEffect(() => {
        setMounted(true);

        const calculateTimeLeft = (): TimeLeft => {
            const weddingDateTime = new Date(`${weddingDate} ${weddingTime}`);
            const now = new Date();
            const difference = weddingDateTime.getTime() - now.getTime();

            if (difference > 0) {
                return {
                    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60)
                };
            }

            return { days: 0, hours: 0, minutes: 0, seconds: 0 };
        };

        setTimeLeft(calculateTimeLeft());

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, [weddingDate, weddingTime]);

    if (!mounted || !timeLeft) {
        // Days-only mode: larger, single display
        if (isDaysOnlyMode) {
            return (
                <div className="flex justify-center">
                    <div className="flex flex-col items-center">
                        <div className="w-32 h-32 sm:w-40 sm:h-40 bg-white rounded-3xl shadow-2xl flex items-center justify-center border-4 border-accent/30">
                            <span className="text-6xl sm:text-7xl font-serif text-accent font-bold">0</span>
                        </div>
                        <span className="text-base sm:text-xl text-gray-700 mt-3 uppercase tracking-widest font-semibold">
                            Days
                        </span>
                    </div>
                </div>
            );
        }

        // Simple or full mode
        const labels = isSimpleMode ? ['Days', 'Hours'] : ['Days', 'Hours', 'Minutes', 'Seconds'];
        return (
            <div className="flex justify-center gap-4 sm:gap-8">
                {labels.map((label, i) => (
                    <div key={i} className="flex flex-col items-center">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl shadow-lg flex items-center justify-center border-2 border-accent/20">
                            <span className="text-3xl sm:text-4xl font-serif text-accent">0</span>
                        </div>
                        <span className="text-xs sm:text-sm text-gray-600 mt-2 uppercase tracking-wider font-medium">
                            {label}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    // Days-only mode: larger, single display
    if (isDaysOnlyMode) {
        return (
            <div className="flex justify-center">
                <div className="flex flex-col items-center">
                    <div className="w-32 h-32 sm:w-40 sm:h-40 bg-white rounded-3xl shadow-2xl flex items-center justify-center border-4 border-accent/30 hover:border-accent/50 transition-all hover:shadow-accent/20">
                        <span className="text-6xl sm:text-7xl font-serif text-accent font-bold">{timeLeft.days}</span>
                    </div>
                    <span className="text-base sm:text-xl text-gray-700 mt-3 uppercase tracking-widest font-semibold">
                        Days to go
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex justify-center gap-4 sm:gap-8">
            <div className="flex flex-col items-center">
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl shadow-lg flex items-center justify-center border-2 border-accent/20 hover:border-accent/40 transition-colors">
                    <span className="text-3xl sm:text-4xl font-serif text-accent">{timeLeft.days}</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-600 mt-2 uppercase tracking-wider font-medium">
                    Days
                </span>
            </div>

            <div className="flex flex-col items-center">
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl shadow-lg flex items-center justify-center border-2 border-accent/20 hover:border-accent/40 transition-colors">
                    <span className="text-3xl sm:text-4xl font-serif text-accent">{timeLeft.hours}</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-600 mt-2 uppercase tracking-wider font-medium">
                    Hours
                </span>
            </div>

            {!isSimpleMode && (
                <>
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl shadow-lg flex items-center justify-center border-2 border-accent/20 hover:border-accent/40 transition-colors">
                            <span className="text-3xl sm:text-4xl font-serif text-accent">{timeLeft.minutes}</span>
                        </div>
                        <span className="text-xs sm:text-sm text-gray-600 mt-2 uppercase tracking-wider font-medium">
                            Minutes
                        </span>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl shadow-lg flex items-center justify-center border-2 border-accent/20 hover:border-accent/40 transition-colors">
                            <span className="text-3xl sm:text-4xl font-serif text-accent">{timeLeft.seconds}</span>
                        </div>
                        <span className="text-xs sm:text-sm text-gray-600 mt-2 uppercase tracking-wider font-medium">
                            Seconds
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}
