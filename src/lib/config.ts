import fs from 'fs';
import path from 'path';

export interface ScheduleEvent {
    time: string;
    title: string;
    description: string;
    location: string;
}

export interface SiteConfig {
    homeHero?: string;
    homeHeadline?: string;
    homeIntroTitle?: string;
    homeIntroBody?: string;
    aboutHero?: string;
    brideName: string;
    groomName: string;
    weddingDate: string;
    weddingLocation: string;
    weddingVenue?: string;
    weddingTime: string;
    rsvpDeadline?: string;
    // About Page
    ourStoryTitle?: string;
    ourStoryBody?: string;
    venueDescription?: string;
    // Schedule Page
    scheduleEvents?: ScheduleEvent[];
}

const CONFIG_PATH = path.join(process.cwd(), 'public/config/site.json');

export function getSiteConfig(): SiteConfig {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading site config', e);
    }

    return {
        brideName: 'Sarah',
        groomName: 'James',
        weddingDate: 'June 15, 2024',
        weddingLocation: 'The Garden Estate',
        weddingTime: '4:00 PM'
    };
}
