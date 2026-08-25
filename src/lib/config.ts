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

export interface WeddingPartyMember {
    id?: string;
    name: string;
    role: string;
    relationship: string;
    photo?: string;
    photoAlign?: 'top' | 'top-center' | 'center' | 'center-bottom' | 'bottom';
    bio?: string;
}

export interface WeddingParty {
    brideParty?: WeddingPartyMember[];
    groomParty?: WeddingPartyMember[];
    somethingBlueCrew?: WeddingPartyMember[];
    officiant?: Omit<WeddingPartyMember, 'role'> & { role?: string };
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
    /** Shown on the RSVP page for guests having trouble. */
    contactEmail?: string;
    // Accommodations / room block (shown on RSVP confirmation)
    roomBlockHotel?: string;
    roomBlockUrl?: string;
    roomBlockMessage?: string;  // editable body; supports {names} {hotel} {book} tokens
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
    /** Optional "Getting there" card under the schedule (shuttles, parking). */
    scheduleShuttleText?: string;
    /** Optional dress-code card under the schedule. */
    scheduleDressCode?: string;
    // Wedding Party Page
    weddingParty?: WeddingParty;
    weddingPartySubtitle?: string;
    bridePartyTitle?: string;
    groomPartyTitle?: string;
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
        showFinancials?: boolean;
        title: string;
        subtitle: string;
        description: string;
        zelle?: { handle: string; label: string };
        venmo?: { handle: string; label: string };
        cashapp?: { handle: string; label: string };
        paypal?: { handle: string; label: string };
        items?: FundItem[];
    };
    /** Target/Amazon/other wish-list items, managed by /api/admin/registry-items. */
    registryItems?: unknown[];
}

const CONFIG_DIR = path.join(process.cwd(), 'public/config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'site.json');

export const DEFAULT_SITE_CONFIG: SiteConfig = {
    brideName: 'Sarah',
    groomName: 'James',
    weddingDate: 'June 15, 2024',
    weddingLocation: 'The Garden Estate',
    weddingTime: '4:00 PM',
};

export function getSiteConfig(): SiteConfig {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading site config', e);
    }

    return { ...DEFAULT_SITE_CONFIG };
}

/**
 * Write a JSON file so it is never half-written.
 *
 * `writeFileSync` straight onto the target leaves a truncated file if the
 * process dies mid-write — and a truncated `site.json` is not an error anyone
 * sees: `getSiteConfig()` fails to parse it and quietly returns the template
 * defaults, so the whole site turns back into "Sarah & James, June 15, 2024".
 * Writing beside the file and renaming is atomic on every filesystem we run on.
 */
export function writeJsonAtomic(filePath: string, data: unknown) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
}

/**
 * Serialise every change to site.json through one queue.
 *
 * A dozen routes each did read → modify → write on the same file. Two admin
 * tabs saving within the same second — or the RSVP page updating a fund total
 * while Settings saved — meant the second write carried a stale copy of the
 * first's keys and silently undid it. Funnelling every mutation through this
 * promise chain makes each one read the file the previous one wrote.
 *
 * The mutator receives the current config and returns the next one (or mutates
 * and returns the same object). Any exception rolls the queue on to the next
 * caller; nothing is written.
 */
let queue: Promise<unknown> = Promise.resolve();

export function updateSiteConfig(
    mutate: (current: SiteConfig) => SiteConfig | void,
): Promise<SiteConfig> {
    const run = queue.then(() => {
        const current = getSiteConfig();
        const next = mutate(current) ?? current;
        writeJsonAtomic(CONFIG_PATH, next);
        return next;
    });
    // Keep the chain alive even when a step throws.
    queue = run.catch(() => undefined);
    return run;
}
