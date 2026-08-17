/**
 * A complete fictional wedding, for the demo instance.
 *
 * Everything here is invented. It exists so the demo can be as filled-out as a
 * real install — every page populated, every admin tab with something in it —
 * without carrying one word of anyone's actual wedding into a site that gets
 * shown to other people.
 *
 * The couple, the guests, the venue, the honeymoon and the money are all made
 * up. The *places* on the honeymoon map are real Portuguese landmarks with
 * approximate coordinates, because a map of invented points looks like a bug,
 * and a demo map wants to look like a map.
 *
 * Loaded by `scripts/seed-demo.mts`. Never imported by the app.
 */

export const DEMO_COUPLE = { bride: 'Maya', groom: 'Theo' };

/**
 * Far enough out that the countdown always has something to count.
 *
 * Two shapes, because the app stores two: `weddingDate` is the written form that
 * the hero prints verbatim, while `rsvpDeadline` is ISO. Getting this wrong put
 * "2027-06-12" across the front page in place of a date.
 */
export const DEMO_WEDDING_DATE = 'June 12, 2027';
export const DEMO_RSVP_DEADLINE = '2027-04-30';
/** ISO form of the wedding day, for the honeymoon trip that follows it. */
export const DEMO_WEDDING_ISO = '2027-06-12';

/* ------------------------------------------------------------------ */
/* Site configuration                                                  */
/* ------------------------------------------------------------------ */

export const DEMO_FAQS = [
    {
        question: 'What should we wear?',
        answer: 'Garden formal. Long dresses or a suit, and shoes you can stand on grass in — the ceremony is on the lawn and the ground is soft after rain. The reception moves indoors after dinner, so a layer for the evening is worth bringing.',
    },
    {
        question: 'Can we bring our children?',
        answer: 'Yes, and we would love to see them. There is a supervised room off the ballroom from seven o\'clock with films, floor cushions and someone keeping an eye, so you can stay for the dancing.',
    },
    {
        question: 'Is there parking at the venue?',
        answer: 'There is space for about eighty cars in the lower field, free and unattended. If you would rather not drive back, the shuttle runs to the two hotels below every half hour from ten until half past midnight.',
    },
    {
        question: 'What time should we arrive?',
        answer: 'Doors open at half past three for a four o\'clock ceremony. Arriving twenty minutes early gives you time to find a seat, find the drinks table, and find whoever you have not seen since the last wedding.',
    },
    {
        question: 'Are you doing a registry?',
        answer: 'There is one, and there is also a fund for the honeymoon if you would rather put something towards a night somewhere than a thing for the kitchen. Neither is expected. Turning up is the gift.',
    },
    {
        question: 'Will the ceremony be outside?',
        answer: 'On the lawn if the weather holds, in the orangery if it does not. The decision gets made at noon on the day and we will put it on this page, so check here before you leave.',
    },
    {
        question: 'Can we take photos?',
        answer: 'Everywhere except during the ceremony itself — those twenty minutes are the only ones we have asked to keep to the photographer and our own eyes. After that, please do, and please send them to us.',
    },
    {
        question: 'What food is there?',
        answer: 'A seated dinner: three courses with a vegetarian main as standard and a vegan and gluten-free option on request. Tell us on the RSVP and it will be at your place, not something you have to ask a waiter about.',
    },
    {
        question: 'Is there a dress code colour we should avoid?',
        answer: 'Only ivory, and only because it makes the photographs confusing. Everything else is fair game, including the bold thing you have been waiting for an excuse to wear.',
    },
    {
        question: 'How do we get there without a car?',
        answer: 'The nearest station is a twenty-minute taxi from the venue, and taxis do not reliably wait there in the evening. Book one, or take the shuttle from either hotel — the schedule is on the Schedule page.',
    },
    {
        question: 'Can we bring a plus one?',
        answer: 'If your invitation names one, absolutely. If it does not, the room is genuinely at capacity rather than us being coy — do ask us anyway and we will tell you honestly.',
    },
];

export const DEMO_SCHEDULE = [
    { time: '3:30 PM', title: 'Doors open', description: 'Drinks on the terrace while everyone finds a seat.', location: 'The Terrace' },
    { time: '4:00 PM', title: 'Ceremony', description: 'Twenty minutes, and then it is done.', location: 'The Lawn' },
    { time: '4:30 PM', title: 'Drinks & photographs', description: 'Canapés, the group photograph, and the receiving line.', location: 'The Orangery' },
    { time: '6:00 PM', title: 'Dinner', description: 'Three courses, seated. Find your name on the board.', location: 'The Ballroom' },
    { time: '7:45 PM', title: 'Speeches', description: 'Four of them, and we have asked them all to be brief.', location: 'The Ballroom' },
    { time: '8:30 PM', title: 'First dance & dancing', description: 'The band plays until eleven, then the playlist takes over.', location: 'The Ballroom' },
    { time: '12:30 AM', title: 'Last shuttle', description: 'The final run down to both hotels. Do not miss it.', location: 'Lower Field' },
];

export const DEMO_BRIDE_PARTY = [
    { name: 'Priya Raman', role: 'Maid of Honour', relationship: 'Roommate, then best friend, for eleven years' },
    { name: 'Nora Whitfield', role: 'Bridesmaid', relationship: 'Little sister, loudest person in any room' },
    { name: 'Simone Achebe', role: 'Bridesmaid', relationship: 'Met on the first day of work and never stopped talking' },
    { name: 'Hana Kobayashi', role: 'Bridesmaid', relationship: 'The one who taught Maya to swim in open water' },
    { name: 'Delia Marchetti', role: 'Bridesmaid', relationship: 'Cousin, co-conspirator, keeper of the family recipes' },
    { name: 'Bex Okonkwo', role: 'Bridesmaid', relationship: 'Bandmate from the years of playing to eleven people' },
    { name: 'Ivy Castellanos', role: 'Flower Girl', relationship: 'Niece, aged six, extremely serious about the job' },
];

export const DEMO_GROOM_PARTY = [
    { name: 'Rafael Almeida', role: 'Best Man', relationship: 'Brother, and the reason Theo learned to cook' },
    { name: 'Callum Beckett', role: 'Groomsman', relationship: 'Shared a tent across four countries and stayed friends' },
    { name: 'Dev Choudhury', role: 'Groomsman', relationship: 'University, and every disastrous car they owned since' },
    { name: 'Marcus Kell', role: 'Groomsman', relationship: 'Football on Sundays for fifteen years, rain included' },
    { name: 'Oskar Lindqvist', role: 'Groomsman', relationship: 'The friend who answers the phone at 3am' },
];

export const DEMO_TIMELINE = [
    {
        title: 'A queue for the wrong film',
        date: '2018-10-04',
        description: 'Both of them had tickets for a sold-out screening and both of them were in the wrong queue. By the time the usher sorted it out they had missed the trailers and agreed to see something else entirely.',
    },
    {
        title: 'The first proper trip',
        date: '2019-05-18',
        description: 'Four days on the coast in weather that never once cleared. They spent most of it in a café with a broken window, playing cards for the last pastry, and came home certain.',
    },
    {
        title: 'Moving in, badly',
        date: '2020-02-29',
        description: 'A third-floor flat with no lift and a sofa that did not fit through the door. It went back to the shop. They ate off the coffee table for a month and called it minimalism.',
    },
    {
        title: 'The dog',
        date: '2021-07-11',
        description: 'They went to look. Everyone says they went to look. Juniper came home the same afternoon and has slept in the middle of the bed every night since.',
    },
    {
        title: 'The kitchen year',
        date: '2022-03-20',
        description: 'Theo took a knife-skills course and got competitive about it. Maya learned to make bread that did not need to be described as rustic. Friends stopped bringing food to dinner.',
    },
    {
        title: 'A very long walk',
        date: '2023-09-02',
        description: 'Two hundred kilometres over eleven days, most of it uphill, one blister they still argue about. Somewhere on day nine they started talking about doing this.',
    },
    {
        title: 'The question, at the wrong moment',
        date: '2024-12-21',
        description: 'The plan involved a restaurant, a reservation and a speech. What happened was a power cut, a torch, and the question asked eleven days early on the kitchen floor.',
    },
    {
        title: 'Saying yes to the date',
        date: '2025-04-06',
        description: 'They saw the estate in the rain, which is the honest way to see anywhere, and booked it before they had left the car park.',
    },
];

export const DEMO_FUND_ITEMS = [
    { title: 'A night in the Douro', description: 'One night in a room that looks straight down the terraced vineyards.', emoji: '🍷', price: '320', funded: '320' },
    { title: 'The cooking day in Lisbon', description: 'A morning at the market and an afternoon learning to cook what they bought.', emoji: '🥘', price: '180', funded: '95' },
    { title: 'Two seats on the boat', description: 'Out past the headland at Madeira to see whatever surfaces.', emoji: '🐬', price: '140', funded: '140' },
    { title: 'Dinner, no budget', description: 'One dinner on the trip where nobody looks at the right-hand column.', emoji: '🕯️', price: '250', funded: '60' },
];

export const DEMO_REGISTRY_ITEMS = [
    { store: 'Target', title: 'Enamelled cast-iron pot, 5.5qt', description: 'The one thing that survives every move and outlives the marriage of anyone who owns it.', price: '$89.99' },
    { store: 'Target', title: 'Linen sheet set, king', description: 'Stone-washed, so it looks intentional when unironed.', price: '$139.00' },
    { store: 'Amazon', title: 'Stand mixer, 4.5qt', description: 'For the bread year, which shows no sign of ending.', price: '$279.95' },
    { store: 'Amazon', title: 'Espresso grinder, conical burr', description: 'Theo has opinions. This is where the opinions live.', price: '$164.50' },
    { store: 'Target', title: 'Wool throw, charcoal', description: 'The dog will claim it within a day. That is fine.', price: '$54.00' },
    { store: 'Amazon', title: 'Cast-iron skillet, 12"', description: 'Pre-seasoned, unkillable, improves for thirty years.', price: '$42.00' },
];

/* ------------------------------------------------------------------ */
/* Guests                                                              */
/* ------------------------------------------------------------------ */

const FIRST = [
    'Adaeze', 'Alina', 'Amara', 'Anders', 'Aoife', 'Arjun', 'Aurelio', 'Beatriz', 'Bram', 'Caleb',
    'Camila', 'Cassian', 'Cerys', 'Dara', 'Delphine', 'Dmitri', 'Eamon', 'Elif', 'Emeka', 'Esther',
    'Fabian', 'Farrah', 'Fenella', 'Gethin', 'Giulia', 'Hamza', 'Harriet', 'Ida', 'Imani', 'Ines',
    'Isaac', 'Jonah', 'Juno', 'Kaveh', 'Keiko', 'Kwame', 'Lena', 'Lorcan', 'Lucia', 'Magnus',
    'Mariam', 'Mateo', 'Milena', 'Nadia', 'Niall', 'Nkechi', 'Odette', 'Omar', 'Otto', 'Petra',
    'Quentin', 'Rania', 'Reuben', 'Rosalind', 'Sabine', 'Salim', 'Saoirse', 'Sasha', 'Sena', 'Silas',
    'Solveig', 'Tamsin', 'Tariq', 'Thandiwe', 'Tobias', 'Ursula', 'Vidar', 'Wren', 'Yara', 'Zeynep',
];

const LAST = [
    'Abara', 'Alvarez', 'Baptiste', 'Beckett', 'Cardoso', 'Dahl', 'Ferreira', 'Gallagher', 'Halvorsen',
    'Ibrahim', 'Jankovic', 'Kaur', 'Lindqvist', 'Maroney', 'Nakamura', 'Okonkwo', 'Petrova', 'Quinlan',
    'Ravel', 'Sandoval', 'Teixeira', 'Ustinov', 'Vasquez', 'Whitfield', 'Yilmaz', 'Zabala',
];

const STREETS = [
    'Alder Row', 'Bramble Lane', 'Cathedral Close', 'Dockside Walk', 'Elm Terrace', 'Fennel Street',
    'Granary Yard', 'Harrow Hill', 'Ivy Court', 'Juniper Way', 'Kiln Road', 'Lantern Street',
    'Mulberry Rise', 'Nettlebed Lane', 'Orchard Gate', 'Pellow Street', 'Quarry Bank', 'Rope Walk',
];

const TOWNS: [string, string, string][] = [
    ['Asheville', 'NC', '28801'], ['Savannah', 'GA', '31401'], ['Charleston', 'SC', '29401'],
    ['Raleigh', 'NC', '27601'], ['Knoxville', 'TN', '37902'], ['Athens', 'GA', '30601'],
    ['Greenville', 'SC', '29601'], ['Durham', 'NC', '27701'], ['Chattanooga', 'TN', '37402'],
];

const RELATIONSHIPS = [
    'College friend', 'Work', 'Family friend', 'Cousin', 'Aunt', 'Uncle', 'Neighbour',
    'Football', 'Book club', 'Choir', 'Theo\'s side', 'Maya\'s side',
];

export interface DemoGuest {
    guest_name: string;
    email: string | null;
    phone: string | null;
    party_size: number;
    side: 'bride' | 'groom';
    invited: boolean;
    rsvp_status: string | null;
    notes: string | null;
    address: string | null;
    party_members: { name: string; dietary?: string }[];
    plus_one_name: string | null;
    flag: string | null;
    relationship: string | null;
}

/**
 * A deterministic pseudo-random generator.
 *
 * The demo has to be reproducible: seeding it twice must give the same guest
 * list, or a screenshot taken today stops matching the site tomorrow.
 */
function rng(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

export function demoGuests(count = 90): DemoGuest[] {
    const rand = rng(20270612);
    const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
    const guests: DemoGuest[] = [];
    const used = new Set<string>();

    for (let i = 0; i < count; i += 1) {
        let name = `${pick(FIRST)} ${pick(LAST)}`;
        while (used.has(name)) name = `${pick(FIRST)} ${pick(LAST)}`;
        used.add(name);

        const side = rand() < 0.5 ? 'bride' : 'groom';
        // A real list is mostly couples, with a tail of singles and families.
        const roll = rand();
        const partySize = roll < 0.18 ? 1 : roll < 0.72 ? 2 : roll < 0.9 ? 3 : 4;
        const [town, state, zip] = pick(TOWNS);

        const members: { name: string; dietary?: string }[] = [];
        for (let m = 1; m < partySize; m += 1) {
            // Some party members are named, some are a plus-one nobody has met.
            members.push(rand() < 0.75
                ? { name: `${pick(FIRST)} ${name.split(' ')[1]}` }
                : { name: '' });
        }
        if (rand() < 0.2 && members[0]) members[0].dietary = pick(['Vegetarian', 'Vegan', 'Gluten free', 'No shellfish']);

        const answered = rand();
        const rsvpStatus = answered < 0.26 ? 'attending'
            : answered < 0.34 ? 'declined'
                : answered < 0.4 ? 'likely_not' : null;

        guests.push({
            guest_name: name,
            email: rand() < 0.85
                ? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`
                : null,
            phone: rand() < 0.6
                ? `(828) ${200 + Math.floor(rand() * 700)}-${1000 + Math.floor(rand() * 8999)}`
                : null,
            party_size: partySize,
            side,
            invited: rand() < 0.92,
            rsvp_status: rsvpStatus,
            notes: rand() < 0.15 ? pick([
                'Needs a ground-floor room',
                'Flying in Friday, leaving Sunday',
                'Do not seat with the Quinlans',
                'Bringing the cake stand',
                'Might be late — night shift',
            ]) : null,
            address: rand() < 0.88
                ? `${1 + Math.floor(rand() * 240)} ${pick(STREETS)}\n${town}, ${state} ${zip}`
                : null,
            party_members: members,
            plus_one_name: null,
            flag: rand() < 0.08 ? pick(['issue', 'need']) : null,
            relationship: rand() < 0.7 ? pick(RELATIONSHIPS) : null,
        });
    }
    return guests;
}

/** Free-text RSVP messages, so the admin table has something human in it. */
export const DEMO_MESSAGES = [
    'Would not miss it. Save us a seat near the band.',
    'So happy for you both. We will be there with bells on.',
    'Cannot wait! Let us know if you need help with anything the day before.',
    'We are in — and yes, we are bringing the dog to the hotel, not the wedding.',
    'Sadly we are away that week. We will be raising a glass wherever we are.',
    'Counting down. Tell Theo the speech had better be short.',
    'We will drive up Friday. Very much looking forward to it.',
    'Unfortunately work has me abroad. Devastated to miss it.',
    'Two of us, both eating everything. Congratulations!',
    'Yes! Finally. It has only taken you seven years.',
];

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export const DEMO_FINANCE = {
    categories: ['Venue & catering', 'Photography & music', 'Flowers, dress & rings'],
    items: [
        ['Venue hire, Saturday', 6800, 1, 0, true],
        ['Catering, per head', 92, 110, 0, false],
        ['Bar package', 2400, 1, 0, false],
        ['Cake', 480, 1, 0, true],
        ['Chair hire', 6, 110, 0, true],
        ['Linen & glassware', 740, 1, 0, false],
        ['Marquee lining', 1150, 1, 0, false],
        ['Late-night pizza van', 900, 1, 0, false],
        ['Photographer, full day', 3200, 1, 1, true],
        ['Second shooter', 850, 1, 1, false],
        ['Band, four hours', 2600, 1, 1, true],
        ['DJ, after the band', 600, 1, 1, false],
        ['String trio, ceremony', 700, 1, 1, true],
        ['Sound & lighting', 1180, 1, 1, false],
        ['Photo album, printed', 420, 1, 1, false],
        ['Drone footage', 500, 1, 1, false],
        ['Dress & alterations', 2450, 1, 2, true],
        ['Suit & shoes', 980, 1, 2, true],
        ['Rings, pair', 3100, 1, 2, true],
        ['Bridal bouquet', 260, 1, 2, true],
        ['Bridesmaid bouquets', 85, 6, 2, false],
        ['Buttonholes', 18, 12, 2, false],
        ['Table centres', 65, 13, 2, false],
        ['Ceremony arch', 540, 1, 2, false],
        ['Hair & make-up', 640, 1, 2, false],
        ['Stationery & signage', 380, 1, 2, true],
        ['Favours', 4, 110, 2, false],
        ['Transport, shuttle', 1250, 1, 0, false],
    ] as [string, number, number, number, boolean][],
    payers: [['Maya', 55], ['Theo', 45]] as [string, number][],
    contributors: [
        ['Almeida grandparents', 5000, 'Given in March, no strings'],
        ['Whitfield parents', 8000, 'Towards the venue specifically'],
        ['Aunt Delphine', 1500, 'Insisted on the flowers'],
        ['Raman family', 750, null],
        ['Office collection', 420, 'Envelope, in cash'],
    ] as [string, number, string | null][],
};

/* ------------------------------------------------------------------ */
/* Honeymoon — Portugal                                                */
/* ------------------------------------------------------------------ */

export const DEMO_REGIONS: { name: string; country: string; description: string }[] = [
    { name: 'Lisbon', country: 'Portugal', description: 'Steep, tiled and loud in the best way. Base yourselves in Alfama or Príncipe Real and accept that everything is uphill on the way back.' },
    { name: 'Sintra', country: 'Portugal', description: 'Forty minutes from Lisbon and about ten degrees cooler in the hills. Go early — the palaces are unbearable by eleven and empty again by five.' },
    { name: 'Cascais', country: 'Portugal', description: 'The sea end of the Lisbon train line. Good for a day of doing nothing in particular, which is a legitimate honeymoon activity.' },
    { name: 'Évora', country: 'Portugal', description: 'Walled, Roman, and hot. Worth the detour inland for one night on the way south.' },
    { name: 'Porto', country: 'Portugal', description: 'Granite and river and port lodges. Smaller than Lisbon and easier to walk, though the hills are no kinder.' },
    { name: 'Douro Valley', country: 'Portugal', description: 'Terraced vineyards for eighty miles. Hire a car or take the slow train along the river — both are the point.' },
    { name: 'Algarve', country: 'Portugal', description: 'Cliffs and caves in the west, resorts in the middle, quiet again towards the Spanish border. Aim west.' },
    { name: 'Madeira', country: 'Portugal', description: 'A volcano in the Atlantic with levada paths cut across it. Two hours from Lisbon and a different holiday entirely.' },
    { name: 'Azores — São Miguel', country: 'Portugal', description: 'Green craters, hot springs and weather that changes its mind hourly. The one place on the list worth its own trip.' },
    { name: 'Óbidos', country: 'Portugal', description: 'A whole town inside a wall, with cherry liqueur served in chocolate cups. Best after the coaches leave.' },
];

/** [name, category, region index, lat, lng, description] */
export const DEMO_PLACES: [string, string, number, number, number, string][] = [
    // Lisbon
    ['Belém Tower', 'attraction', 0, 38.6916, -9.2160, 'Queue before ten or admire it from the outside; the inside is a staircase.'],
    ['Jerónimos Monastery', 'attraction', 0, 38.6979, -9.2065, 'The cloister is the reason to go. Buy the combined ticket.'],
    ['Pastéis de Belém', 'cafe', 0, 38.6975, -9.2033, 'Warm, cinnamon on the side, eat standing up. The queue for takeaway moves fast.'],
    ['Time Out Market', 'restaurant', 0, 38.7071, -9.1459, 'Thirty kitchens under one roof. Go at noon or after nine, never at one.'],
    ['Miradouro da Senhora do Monte', 'attraction', 0, 38.7167, -9.1330, 'The best of the viewpoints and the least crowded. Sunset, obviously.'],
    ['Miradouro de Santa Catarina', 'attraction', 0, 38.7095, -9.1470, 'Beer, guitars and the river. Rowdier than the others.'],
    ['Castelo de São Jorge', 'attraction', 0, 38.7139, -9.1335, 'Walk the walls. Skip the museum unless it is raining.'],
    ['Alfama tram 28 stop', 'transport', 0, 38.7118, -9.1300, 'Ride it early or ride the 12 instead — same hills, fewer elbows.'],
    ['LX Factory', 'shop', 0, 38.7028, -9.1786, 'Old industrial block, bookshop, rooftop. Sunday market is the busy day.'],
    ['Cervejaria Ramiro', 'restaurant', 0, 38.7222, -9.1355, 'Shellfish, paper tablecloths, a wait. Order the garlic prawns and the steak sandwich after.'],
    ['A Cevicheria', 'restaurant', 0, 38.7166, -9.1520, 'No reservations, one octopus on the ceiling. Put your name down and go for a drink.'],
    ['Park Bar', 'bar', 0, 38.7113, -9.1470, 'On top of a car park. Take the lift to the sixth floor and keep walking up.'],
    ['Pensão Amor', 'bar', 0, 38.7078, -9.1443, 'Former brothel, now very pink. One drink, for the room.'],
    ['Feira da Ladra', 'shop', 0, 38.7152, -9.1252, 'Tuesday and Saturday flea market. Cash, and no illusions about the antiques.'],
    ['Museu Nacional do Azulejo', 'attraction', 0, 38.7250, -9.1150, 'Five hundred years of tiles, in a convent. Quieter than everything else on this list.'],
    ['Praça do Comércio', 'attraction', 0, 38.7075, -9.1364, 'The big square on the river. Walk through it rather than sitting in it.'],
    ['Bairro Alto', 'nightlife', 0, 38.7130, -9.1450, 'Everyone drinks in the street. Loud until three, silent by four.'],
    ['Estufa Fria', 'nature', 0, 38.7280, -9.1540, 'A greenhouse without glass in the middle of the park. Cool, damp and nearly empty.'],
    ['Ponte 25 de Abril viewpoint', 'attraction', 0, 38.6900, -9.1770, 'The bridge from underneath, with the same red as the other one.'],
    ['Casa Independente', 'bar', 0, 38.7200, -9.1370, 'Sofas, a garden and a good playlist. Start the evening here.'],

    // Sintra
    ['Pena Palace', 'attraction', 1, 38.7876, -9.3904, 'Absurd, and worth it. First ticket of the day or last two hours.'],
    ['Quinta da Regaleira', 'attraction', 1, 38.7963, -9.3963, 'The initiation well is the photograph; the grottoes are the fun.'],
    ['Moorish Castle', 'hiking', 1, 38.7924, -9.3889, 'A walk along the ramparts with the whole coast on one side.'],
    ['Sintra National Palace', 'attraction', 1, 38.7975, -9.3907, 'The two chimneys in the middle of town. Half an hour, well spent.'],
    ['Piriquita', 'cafe', 1, 38.7975, -9.3893, 'Travesseiros, hot, from the counter at the back.'],
    ['Cabo da Roca', 'nature', 1, 38.7803, -9.4989, 'The westernmost point of Europe. Windy enough to lean on.'],
    ['Praia da Ursa', 'beach', 1, 38.7869, -9.4894, 'A scramble down to a beach with rock stacks. Not for flip-flops.'],
    ['Monserrate Palace', 'attraction', 1, 38.7930, -9.4128, 'The garden is better than the palace, and both are emptier than Pena.'],

    // Cascais
    ['Praia da Rainha', 'beach', 2, 38.6960, -9.4200, 'A pocket of sand between two rocks in the middle of town.'],
    ['Boca do Inferno', 'nature', 2, 38.6944, -9.4288, 'A collapsed sea cave. Better in a swell than in flat calm.'],
    ['Guincho', 'beach', 2, 38.7328, -9.4728, 'Wind, waves, kite surfers. Not a swimming beach.'],
    ['Mercado da Vila', 'restaurant', 2, 38.6982, -9.4210, 'Buy fish downstairs, have it cooked upstairs. Wednesdays and Saturdays.'],

    // Évora
    ['Roman Temple of Évora', 'attraction', 3, 38.5729, -7.9077, 'Fourteen columns in the middle of a working town.'],
    ['Chapel of Bones', 'attraction', 3, 38.5697, -7.9083, 'Exactly what it says. Ten minutes and a long think.'],
    ['Évora Cathedral roof', 'attraction', 3, 38.5720, -7.9075, 'Pay the extra for the roof terrace and the whole plain is in view.'],
    ['Adega Cartuxa', 'activity', 3, 38.5760, -7.9260, 'Alentejo reds, tasted properly, ten minutes from the walls.'],

    // Porto
    ['Livraria Lello', 'shop', 4, 41.1470, -8.6148, 'Buy the timed ticket. The staircase is the point and it is always full.'],
    ['São Bento station', 'transport', 4, 41.1456, -8.6106, 'Twenty thousand tiles in the entrance hall. Free, and takes five minutes.'],
    ['Dom Luís I Bridge', 'attraction', 4, 41.1399, -8.6094, 'Walk the top deck for the view and the bottom deck for the shade.'],
    ['Ribeira', 'attraction', 4, 41.1408, -8.6132, 'The river frontage. Eat one street back from it.'],
    ['Clérigos Tower', 'attraction', 4, 41.1456, -8.6146, 'Two hundred and forty steps, narrow, worth it.'],
    ['Mercado do Bolhão', 'shop', 4, 41.1496, -8.6069, 'Restored and still a real market. Mornings only.'],
    ['Cantina 32', 'restaurant', 4, 41.1443, -8.6141, 'Small plates, industrial room, book ahead.'],
    ['Taylor\'s port lodge', 'activity', 4, 41.1367, -8.6169, 'The tour ends on a terrace over the river. Do this one rather than the biggest one.'],
    ['Majestic Café', 'cafe', 4, 41.1471, -8.6060, 'Overpriced and beautiful. Coffee, not lunch.'],
    ['Foz do Douro', 'beach', 4, 41.1500, -8.6700, 'Where the river meets the sea. Tram 1 along the water gets you there.'],
    ['Serralves', 'attraction', 4, 41.1596, -8.6588, 'Modern art in an art-deco house with eighteen hectares of garden.'],

    // Douro
    ['Quinta do Crasto', 'activity', 5, 41.1700, -7.6800, 'Terraces, an infinity pool, and a tasting on the edge of it.'],
    ['Pinhão station', 'transport', 5, 41.1900, -7.5450, 'Tiled panels of the harvest. The slow train from Porto stops here.'],
    ['Miradouro de São Leonardo', 'nature', 5, 41.1580, -7.6180, 'The bend in the river everyone photographs, from above.'],
    ['Quinta Nova', 'stay', 5, 41.1830, -7.6420, 'A wine hotel with its own walking trails between the vines.'],
    ['Régua river cruise', 'activity', 5, 41.1620, -7.7900, 'Two hours upstream through the locks. Sit on the left going up.'],

    // Algarve
    ['Benagil sea cave', 'nature', 6, 37.0880, -8.4270, 'By kayak from Praia de Benagil, early, before the boats.'],
    ['Praia da Marinha', 'beach', 6, 37.0900, -8.4120, 'The arches and the clear water. Steep steps down.'],
    ['Ponta da Piedade', 'nature', 6, 37.0810, -8.6690, 'Stacks and arches at Lagos. Walk the boardwalk at the top.'],
    ['Praia do Camilo', 'beach', 6, 37.0870, -8.6690, 'Two hundred steps and a beach split by a tunnel.'],
    ['Cape St Vincent', 'nature', 6, 37.0230, -8.9970, 'The south-west corner of Europe, a lighthouse, and a sausage van.'],
    ['Sagres fortress', 'attraction', 6, 37.0030, -8.9470, 'A flat headland with the wind coming straight off the Atlantic.'],
    ['Tavira', 'attraction', 6, 37.1270, -7.6480, 'Roman bridge, salt pans and no crowds. The quiet end.'],
    ['Ria Formosa boat', 'activity', 6, 37.0180, -7.9300, 'Lagoon islands and flamingos, out of Olhão.'],

    // Madeira
    ['Levada do Caldeirão Verde', 'hiking', 7, 32.7830, -16.9060, 'Nine miles along a water channel through laurel forest. Take a torch for the tunnels.'],
    ['Pico do Arieiro', 'hiking', 7, 32.7350, -16.9280, 'Above the clouds at sunrise. Drive up in the dark and wear a coat.'],
    ['Funchal market', 'shop', 7, 32.6480, -16.9080, 'Fruit you will be pressured to buy. Do buy the passionfruit.'],
    ['Monte toboggan', 'activity', 7, 32.6660, -16.9010, 'Two men, a wicker sledge and a road. Completely daft.'],
    ['Porto Moniz pools', 'beach', 7, 32.8670, -17.1730, 'Volcanic rock pools with the sea coming over the edge.'],
    ['Câmara de Lobos', 'attraction', 7, 32.6500, -16.9770, 'The fishing village Churchill painted. Espetada at the water.'],
    ['Cabo Girão skywalk', 'attraction', 7, 32.6560, -17.0000, 'A glass floor on a six-hundred-metre cliff.'],

    // Azores
    ['Sete Cidades', 'nature', 8, 37.8600, -25.7900, 'Twin lakes in a crater, one green and one blue. Go on a clear morning or not at all.'],
    ['Lagoa do Fogo', 'nature', 8, 37.7700, -25.4750, 'The best of the craters and the hardest to catch without cloud.'],
    ['Terra Nostra hot spring', 'spa', 8, 37.8500, -25.3200, 'Iron-orange water at forty degrees in a botanical garden. It stains swimwear.'],
    ['Furnas cozido', 'restaurant', 8, 37.7700, -25.3150, 'Lunch cooked underground by the volcano. Order it a day ahead.'],
    ['Ponta Delgada gates', 'attraction', 8, 37.7400, -25.6690, 'The three arches on the harbour front. Start a walk here.'],
    ['Whale watching, São Miguel', 'activity', 8, 37.7370, -25.6650, 'Sperm whales most of the year, blues in April and May.'],
    ['Gorreana tea estate', 'activity', 8, 37.8200, -25.4000, 'The only tea plantation in Europe. Free, and oddly moving.'],

    // Óbidos
    ['Óbidos walls', 'hiking', 9, 39.3600, -9.1570, 'Walk the full circuit. No railings, so watch your footing.'],
    ['Ginjinha in chocolate', 'bar', 9, 39.3605, -9.1580, 'Cherry liqueur in an edible cup, from any doorway in the main street.'],
    ['Livraria de Santiago', 'shop', 9, 39.3610, -9.1565, 'A bookshop in a church, which sounds twee and is not.'],

    // Stays, spread across the trip
    ['Casa Alfama, Lisbon', 'stay', 0, 38.7120, -9.1290, 'Four rooms, a roof terrace, and the tram going past the window.'],
    ['Quinta da Bela Vista, Sintra', 'stay', 1, 38.7940, -9.3980, 'Old house in the hills, breakfast under the trees.'],
    ['Torel Palace, Porto', 'stay', 4, 41.1490, -8.6180, 'Two townhouses above the river, ten minutes from everything.'],
    ['Vineyard rooms, Douro', 'stay', 5, 41.1750, -7.6500, 'The room with the balcony over the terraces. Worth the upgrade.'],
    ['Memmo Baleeira, Sagres', 'stay', 6, 37.0080, -8.9400, 'White, low and quiet, with surfboards in the lobby.'],
    ['Quinta do Furão, Madeira', 'stay', 7, 32.8250, -16.8830, 'On the cliff edge on the north coast, miles from Funchal.'],
];

export const DEMO_NOTES: { title: string; body: string; category: string }[] = [
    { title: 'Tap water is fine', body: 'Drinkable everywhere in Portugal, including the islands. Bottled water is a habit, not a necessity.', category: 'Practical' },
    { title: 'Cards, and a little cash', body: 'Cards work nearly everywhere, including small cafés. Keep €20 or so for markets, the toboggan men and the ginjinha doorways.', category: 'Money' },
    { title: 'Coffee vocabulary', body: 'A "café" is an espresso. If you want what you mean by coffee, ask for a "meia de leite" (half milk) or an "abatanado" (long black). Nobody minds you asking.', category: 'Food' },
    { title: 'Couvert is not free', body: 'The bread and olives that arrive unasked are charged for, a euro or two. Waving them away is completely normal and nobody takes offence.', category: 'Food' },
    { title: 'Lunch is early, dinner is late', body: 'Kitchens fill at one and again at half past eight. Turning up for dinner at seven means an empty room and a bored waiter.', category: 'Food' },
    { title: 'The hills are the point and the problem', body: 'Lisbon and Porto are both built on hills with cobbles polished by two centuries of feet. Bring shoes with grip; the funiculars and the Santa Justa lift are not cheating.', category: 'Getting around' },
    { title: 'Trains beat driving in the north', body: 'Lisbon–Porto is under three hours and Porto–Pinhão along the river is one of the great slow train rides. Hire a car for the Douro, the Algarve and Madeira, not for the cities.', category: 'Getting around' },
    { title: 'Book the two that sell out', body: 'Livraria Lello and Pena Palace both use timed tickets and both run out in high season. Everything else can be decided on the morning.', category: 'Booking' },
    { title: 'Madeira and the Azores are separate trips', body: 'Both are two-hour flights from Lisbon and neither is a day trip. Three nights is the minimum that stops feeling rushed.', category: 'Planning' },
    { title: 'Weather in the islands changes hourly', body: 'On São Miguel a clouded-in crater can clear in twenty minutes. Keep the viewpoints flexible and go when the sky says so, not when the plan says so.', category: 'Planning' },
    { title: 'Sunscreen, even in cloud', body: 'The Atlantic light is stronger than it feels, especially on boats and in the Douro. Reapply after swimming in the rock pools.', category: 'Practical' },
    { title: 'Tipping is light', body: 'Rounding up, or five to ten per cent for a proper dinner. There is no expectation of more and no awkwardness in leaving nothing at a café.', category: 'Money' },
    { title: 'Plugs and power', body: 'Type F, 230V — the same as most of Europe. One adaptor between two of you is enough if you charge overnight.', category: 'Practical' },
    { title: 'A few words go a long way', body: '"Bom dia", "obrigado" if you are a man, "obrigada" if you are a woman, "a conta, por favor" for the bill. English is widely spoken and the effort is still noticed.', category: 'Language' },
];

export const DEMO_TODOS: [string, string, boolean, string | null][] = [
    ['Renew both passports', 'Admin', true, 'Back on 14 March, valid to 2037'],
    ['Book Lisbon flights', 'Travel', true, 'TAP, out on the 14th, back on the 29th — ref QK4R2M'],
    ['Book the Madeira leg', 'Travel', true, 'Funchal on the 22nd, one bag each'],
    ['Hire car for the Douro', 'Travel', false, null],
    ['Timed ticket: Livraria Lello', 'Booking', false, null],
    ['Timed ticket: Pena Palace', 'Booking', true, 'First slot, 09:30 on the 17th'],
    ['Reserve the Furnas cozido', 'Booking', false, null],
    ['Travel insurance', 'Admin', true, 'Annual policy, covers hiking to 2000m'],
    ['Tell the bank the dates', 'Admin', false, null],
    ['Buy walking shoes for the levadas', 'Packing', false, null],
    ['Charge and clear the camera', 'Packing', false, null],
    ['Sort out Juniper for the fortnight', 'Home', true, 'Priya has her, keys dropped off'],
];

/** [day number, title, notes, [stop place names]] */
export const DEMO_DAYS: [number, string, string | null, string[]][] = [
    [1, 'Land in Lisbon', 'Nothing planned after the flight. Walk, eat, sleep.', ['Casa Alfama, Lisbon', 'Miradouro da Senhora do Monte', 'Cervejaria Ramiro']],
    [2, 'Belém and the river', null, ['Jerónimos Monastery', 'Pastéis de Belém', 'Belém Tower', 'LX Factory']],
    [3, 'Alfama, slowly', 'Tram early or not at all.', ['Alfama tram 28 stop', 'Castelo de São Jorge', 'Museu Nacional do Azulejo', 'Park Bar']],
    [4, 'Sintra', 'Pena at 09:30 — the ticket is timed and they do not bend.', ['Pena Palace', 'Piriquita', 'Quinta da Regaleira', 'Quinta da Bela Vista, Sintra']],
    [5, 'The coast road', null, ['Cabo da Roca', 'Praia da Ursa', 'Boca do Inferno', 'Mercado da Vila']],
    [6, 'Inland to Évora', 'Long drive; leave before nine to beat the heat.', ['Roman Temple of Évora', 'Chapel of Bones', 'Adega Cartuxa']],
    [7, 'Train north to Porto', null, ['São Bento station', 'Livraria Lello', 'Torel Palace, Porto']],
    [8, 'Porto on foot', null, ['Clérigos Tower', 'Mercado do Bolhão', 'Dom Luís I Bridge', 'Taylor\'s port lodge', 'Cantina 32']],
    [9, 'Up the Douro', 'Slow train along the river — sit on the left.', ['Pinhão station', 'Miradouro de São Leonardo', 'Vineyard rooms, Douro']],
    [10, 'Vineyards', null, ['Quinta do Crasto', 'Régua river cruise']],
    [11, 'South to the Algarve', null, ['Memmo Baleeira, Sagres', 'Cape St Vincent']],
    [12, 'Caves and cliffs', 'Kayak at eight, before the tour boats.', ['Benagil sea cave', 'Praia da Marinha', 'Ponta da Piedade']],
    [13, 'The quiet end', null, ['Tavira', 'Ria Formosa boat']],
    [14, 'Fly to Madeira', null, ['Quinta do Furão, Madeira', 'Câmara de Lobos']],
    [15, 'Levada walk', 'Torch for the tunnels. Nine miles, mostly flat.', ['Levada do Caldeirão Verde']],
    [16, 'Above the clouds', 'Leave at four in the morning. Genuinely worth it.', ['Pico do Arieiro', 'Funchal market', 'Monte toboggan']],
];

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/* ------------------------------------------------------------------ */

/**
 * Captions for the demo gallery, paired with a placeholder image each.
 *
 * The images come from Lorem Picsum at seed time, so the demo ships with real
 * photographs rather than grey rectangles, and the same seeds always give the
 * same pictures.
 */
export const DEMO_PHOTO_CAPTIONS = [
    'The lane up to the house', 'Rehearsal, from the back row', 'Priya and Nora, laughing at nothing',
    'The orangery before anyone arrived', 'Juniper in a bow tie, briefly',
    'Rafael practising the speech', 'The cake, on the way in', 'Maya\'s grandmother\'s ring',
    'Table nine, mid-argument', 'The band setting up', 'Confetti, most of it airborne',
    'Theo\'s cousins on the terrace', 'The long table at dusk', 'First dance, second song',
    'Delia and the family recipes', 'Rain, twenty minutes of it', 'The lawn, dried out again',
    'Bex with the borrowed guitar', 'Ivy taking the job seriously', 'Shoes off by ten',
    'The last of the pizza van', 'Sparklers, badly timed', 'Hana in the doorway',
    'The card table, overflowing', 'Somebody\'s uncle dancing', 'Coffee at midnight',
    'Marcus and the football story', 'The view from the top field', 'Oskar, asleep in a chair',
    'Callum and Dev, conspiring', 'The morning after, kitchen table', 'Wellingtons by the door',
    'Simone in the good light', 'The estate gates', 'Breakfast for eleven',
    'Keys going back to the office',
];
