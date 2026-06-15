import fs from 'fs';
import path from 'path';

export interface ScheduleEvent {
    time: string;
    title: string;
    description: string;
    location: string;
}

export interface FAQItem {
    question: string;
    answer: string;
}

export interface FundItem {
    id: string;
    title: string;
    description: string;
    emoji: string;
    price: number;
    funded: number;
}

export interface SiteConfig {
    homeHero?: string;
    heroSlideshowEnabled?: boolean;
    heroSlideshowImages?: string[];  // filenames from public/photos
    heroSlideshowInterval?: number;  // milliseconds, default 5000
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
    // Accommodations / room block (shown on RSVP confirmation)
    roomBlockHotel?: string;
    roomBlockUrl?: string;
    countdownMode?: 'full' | 'simple' | 'days-only';
    // Theme Colors
    accentColor?: string;
    accentLightColor?: string;
    accentDarkColor?: string;
    // About Page
    ourStoryTitle?: string;
    howWeMetTitle?: string; // Editable "How We Met" title
    ourStoryBody?: string;
    venueDescription?: string;
    venueAddress?: string;
    venuePhoto?: string;
    ceremonyText?: string;
    receptionText?: string;
    faqs?: FAQItem[];
    // Schedule Page
    scheduleEvents?: ScheduleEvent[];
    // Wedding Party Page
    weddingPartySubtitle?: string;
    somethingBlueCrewTitle?: string;
    // Basic Mode (pre-release mode)
    basicMode?: boolean;
    basicModeShowVenue?: boolean;
    // Footer/Hero Images
    footerHeroImage?: string;
    // Logo Mode
    logoMode?: boolean;
    weddingLogo?: string;
    // Page Subtitles
    timelineSubtitle?: string;
    photosSubtitle?: string;
    aboutSubtitle?: string;
    scheduleSubtitle?: string;
    registryPageSubtitle?: string;
    rsvpSubtitle?: string;
    // Nav Cards image map (key = page slug)
    navCards?: Record<string, string>;
    // Wedding Color Palette
    weddingColorPalette?: string[]; // 5 custom colors
    // Public Page Background Colors
    pageBgColors?: {
        home?: string;
        about?: string;
        ourStory?: string;
        weddingParty?: string;
        schedule?: string;
        photos?: string;
        rsvp?: string;
        registry?: string;
    };
    // Registry
    registry?: {
        enabled: boolean;
        title: string;
        subtitle: string;
        description: string;
        zelle?: { handle: string; label: string };
        venmo?: { handle: string; label: string };
        cashapp?: { handle: string; label: string };
        paypal?: { handle: string; label: string };
        items?: FundItem[];
    };
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
