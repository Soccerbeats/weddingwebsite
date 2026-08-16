/**
 * Honeymoon seed data, extracted from the Bali travel guide.
 *
 * Same convention as financeSeed.ts: plain data, inserted once by
 * scripts/seed-honeymoon.mts and fully editable afterwards. Nothing in here is
 * consulted at runtime — once a row is in the database the seed is inert, so
 * editing a place in the admin never gets reverted by a redeploy.
 *
 * Coordinates are deliberately absent. The seed script geocodes each name and
 * flags every result `needs_review`, because a geocoder will confidently return
 * *a* match for a half-recognised name — several of these waterfalls share names
 * across regions and would otherwise land silently on the wrong side of Bali.
 *
 * Source of record: docs/honeymoon/bali-guide.md
 */

export interface SeedRegion {
    name: string;
    country: string;
    description: string | null;
    /** Bias geocoding toward this area; not stored as the region centre. */
    searchHint: string;
}

export interface SeedPlace {
    name: string;
    region: string;
    category: string;
    description?: string;
    /** Website / booking links, stored on the place as JSONB. */
    links?: { label: string; url: string }[];
}

export interface SeedNote {
    title: string;
    body: string;
    category: string;
}

export const SEED_REGIONS: SeedRegion[] = [
    {
        name: 'Canggu',
        country: 'Indonesia',
        searchHint: 'Canggu, Badung, Bali, Indonesia',
        description:
            'Bali\'s newest and hippest destination, nestled between the boutique haven of Seminyak and '
            + 'the sacred temple of Tanah Lot. Traveling surfers searching for less crowded waves outside '
            + 'Uluwatu and Kuta found the once-sleepy village and kept it quiet for a while — but as '
            + 'surfers, photographers and digital nomads caught on, cafes, beach clubs, nightlife and '
            + 'luxury villas grew out of the rice fields. Covers Pererenan, Seseh and Nyanyi. '
            + 'What you do here: surf, work, art, healthy living, parties. Where you stay: villas '
            + 'mainly, some good guesthouses, very few hotels.',
    },
    {
        name: 'Uluwatu & The Bukit',
        country: 'Indonesia',
        searchHint: 'Uluwatu, Badung, Bali, Indonesia',
        description:
            'The Bukit peninsula — Bingin, Nusa Dua, Jimbaran and Ungasan. Clifftop views, world-class '
            + 'surf and Bali\'s most dramatic beach clubs, many of them built into the limestone cliffs '
            + 'above white-sand beaches with private access.',
    },
    {
        name: 'Ubud',
        country: 'Indonesia',
        searchHint: 'Ubud, Gianyar, Bali, Indonesia',
        description:
            'A small, bustling town in central Bali, 1.5 hours from Ngurah Rai airport and roughly an '
            + 'hour from both the southern beach towns and the northern mountains — which makes it one of '
            + 'the best bases on the island. Known as a cultural and spiritual hub. Its recorded history '
            + 'goes back to the 8th century, when it was the island\'s centre for natural medicine and '
            + 'spiritual healing; the ancient Balinese word "ubad" means medicine, and that is where the '
            + 'name comes from. Its modern reputation started in the 1930s when painters and writers were '
            + 'drawn by the rice fields and waterfalls. Central Ubud can feel like a commercialised jungle '
            + 'theme park at first glance, but the town is actually 14 separate villages, each with its own '
            + 'traditions — village life carries on largely untouched a stone\'s throw from the boutiques. '
            + 'Everything is within a 10–30 minute drive, so no choice of neighbourhood rules anything out. '
            + 'First-timers should stay near the Monkey Forest and Art Market; for quiet, look at '
            + 'Penestanan and New Kuning, or push out to Tegalalang and Tampaksiring.',
    },
    {
        name: 'North Bali',
        country: 'Indonesia',
        searchHint: 'Singaraja, Buleleng, Bali, Indonesia',
        description:
            'Waterfall country. Rougher roads than the south — worth timing long drives for early morning '
            + 'or after 9pm — but home to Bali\'s most impressive falls, including the Aling Aling complex '
            + 'where four connected waterfalls allow jumping, swimming and sliding.',
    },
    {
        name: 'Central Bali',
        country: 'Indonesia',
        searchHint: 'Bangli, Bali, Indonesia',
        description:
            'The waterfall and rice-terrace belt around and beyond Ubud, stretching toward Bedugul and '
            + 'the volcanic interior.',
    },
    {
        name: 'Seminyak & Kuta',
        country: 'Indonesia',
        searchHint: 'Seminyak, Badung, Bali, Indonesia',
        description:
            'The established boutique-and-beach-club strip south of Canggu. Walkable by Bali standards, '
            + 'with sidewalks — though motorbikes treat those as their own lane in heavy traffic.',
    },
    {
        name: 'Singapore',
        country: 'Singapore',
        searchHint: 'Singapore',
        description:
            'The other half of the trip. A short flight from Denpasar and an easy contrast to Bali — '
            + 'a dense, walkable, air-conditioned city with world-class food, where the tap water is '
            + 'safe and the transit actually runs on time.',
    },
];

/**
 * Places named in the guide. Region assignment follows the guide's own headings;
 * the waterfall lists are split North/Central exactly as the guide splits them.
 */
export const SEED_PLACES: SeedPlace[] = [
    /* ---- Canggu: beach clubs & bars ---- */
    { name: 'La Brisa', region: 'Canggu', category: 'beach_club', description: 'Also hosts the La Brisa Sunday Market.' },
    { name: 'FINNS Beach Club', region: 'Canggu', category: 'beach_club' },
    { name: 'The Lawn Canggu', region: 'Canggu', category: 'beach_club' },
    { name: 'ATLAS Beach Club', region: 'Canggu', category: 'beach_club' },
    { name: 'Potato Head Beach Club', region: 'Seminyak & Kuta', category: 'beach_club' },
    { name: 'Mrs Sippy', region: 'Seminyak & Kuta', category: 'beach_club' },
    { name: 'Caravan Canggu', region: 'Canggu', category: 'beach_club' },
    { name: 'Surfers Bar Canggu', region: 'Canggu', category: 'beach_club' },
    { name: 'Sol Beach Club', region: 'Canggu', category: 'beach_club' },

    /* ---- Canggu: bars ---- */
    { name: 'Deus Ex Machina Canggu', region: 'Canggu', category: 'bar' },
    { name: 'Black Sand Brewery', region: 'Canggu', category: 'bar' },
    { name: 'Shady Fox', region: 'Canggu', category: 'bar' },
    { name: 'Shady Pig', region: 'Canggu', category: 'bar' },

    /* ---- Canggu: late night ---- */
    { name: 'Morabito Art Cliff', region: 'Canggu', category: 'nightlife' },
    { name: 'Green Door', region: 'Canggu', category: 'nightlife' },
    { name: 'Miss Fish', region: 'Canggu', category: 'nightlife' },
    { name: 'Vault Canggu', region: 'Canggu', category: 'nightlife' },
    { name: "Luigi's Hot Pizza", region: 'Canggu', category: 'nightlife' },
    { name: "Old Man's", region: 'Canggu', category: 'nightlife' },
    { name: 'Sandbar Canggu', region: 'Canggu', category: 'nightlife' },
    { name: 'La Favela', region: 'Seminyak & Kuta', category: 'nightlife' },

    /* ---- Canggu: fine dining ---- */
    { name: "Mason's", region: 'Canggu', category: 'restaurant' },
    { name: 'Skool Kitchen', region: 'Canggu', category: 'restaurant' },
    { name: 'WOODS Canggu', region: 'Canggu', category: 'restaurant' },
    { name: 'Billy Ho', region: 'Canggu', category: 'restaurant' },
    { name: 'Ulekan', region: 'Canggu', category: 'restaurant' },
    { name: 'Red Gunpowder', region: 'Canggu', category: 'restaurant' },

    /* ---- Canggu: breakfast & cafes ---- */
    { name: 'Sensorium', region: 'Canggu', category: 'cafe' },
    { name: 'Two Face Coffee', region: 'Canggu', category: 'cafe' },
    { name: 'Crate Cafe', region: 'Canggu', category: 'cafe' },
    { name: 'Nude Canggu', region: 'Canggu', category: 'cafe' },
    { name: 'Hungry Bird Coffee', region: 'Canggu', category: 'cafe' },
    { name: 'Satu Satu', region: 'Canggu', category: 'cafe' },

    /* ---- Canggu: lunch & casual dinner ---- */
    { name: 'Lusa By/Suka', region: 'Canggu', category: 'restaurant' },
    { name: 'Nook Bali', region: 'Seminyak & Kuta', category: 'restaurant' },
    { name: 'Bottega Italiana', region: 'Canggu', category: 'restaurant' },
    { name: 'Milk & Madu Canggu', region: 'Canggu', category: 'restaurant' },
    { name: 'TIGA Canggu', region: 'Canggu', category: 'restaurant' },
    { name: 'Dua Tiga', region: 'Canggu', category: 'restaurant' },
    { name: 'Tygr Sushi', region: 'Canggu', category: 'restaurant' },
    { name: 'Rise Canggu', region: 'Canggu', category: 'restaurant' },
    { name: 'Arte Canggu', region: 'Canggu', category: 'restaurant' },
    { name: 'Honey Canggu', region: 'Canggu', category: 'restaurant' },
    { name: 'The Village Tumbak Bayuh', region: 'Canggu', category: 'restaurant' },
    { name: 'Front Canggu', region: 'Canggu', category: 'restaurant' },
    { name: 'Noah Canggu', region: 'Canggu', category: 'restaurant' },
    { name: 'Sundays Kitchen', region: 'Canggu', category: 'restaurant' },
    { name: 'Bokashi Canggu', region: 'Canggu', category: 'restaurant' },

    /* ---- Canggu: spas ---- */
    { name: 'AMO Spa', region: 'Canggu', category: 'spa' },
    { name: 'Nirvana Spa Canggu', region: 'Canggu', category: 'spa', description: 'Has a -140°C cryo chamber.' },
    { name: 'Spring Spa Canggu', region: 'Canggu', category: 'spa' },
    { name: 'Therapy Spa Bali', region: 'Canggu', category: 'spa' },
    { name: 'Gold Dust Beauty', region: 'Canggu', category: 'spa' },
    { name: 'Solace Float', region: 'Canggu', category: 'spa' },

    /* ---- Canggu: hair & nails ---- */
    { name: 'Keluncum Barber', region: 'Canggu', category: 'beauty' },
    { name: 'Dirty Sanchez Barbershop', region: 'Canggu', category: 'beauty' },
    { name: 'Sick Boy Barbershop', region: 'Canggu', category: 'beauty' },
    { name: 'House of Orange', region: 'Canggu', category: 'beauty' },
    { name: 'Jet Black Ginger', region: 'Canggu', category: 'beauty' },

    /* ---- Canggu: cheap & cheerful ---- */
    { name: 'Warung Men Lari', region: 'Canggu', category: 'restaurant', description: 'Cheap and cheerful local warung.' },
    { name: 'Varuna Warung', region: 'Canggu', category: 'restaurant', description: 'Cheap and cheerful local warung.' },
    { name: 'Warung Local Canggu', region: 'Canggu', category: 'restaurant', description: 'Cheap and cheerful local warung.' },
    { name: 'Warung Men Agus', region: 'Canggu', category: 'restaurant', description: 'GoJek-only local favourite.' },
    { name: 'Warung Men Swari', region: 'Canggu', category: 'restaurant', description: 'GoJek-only local favourite.' },

    /* ---- Canggu: gyms & wellness ---- */
    { name: 'Nirvana Gym Canggu', region: 'Canggu', category: 'gym' },
    { name: 'Wanderlust Gym Canggu', region: 'Canggu', category: 'gym' },
    { name: 'Wrong Gym', region: 'Canggu', category: 'gym' },
    { name: 'Obsidian Gym Bali', region: 'Canggu', category: 'gym' },
    { name: 'Suriya Gym', region: 'Canggu', category: 'gym' },
    { name: 'Bali MMA', region: 'Canggu', category: 'gym' },
    { name: 'SOMA Bali', region: 'Canggu', category: 'gym' },
    { name: 'The Udara Bali', region: 'Canggu', category: 'gym', description: 'Static dance, breath work and yoga.' },
    { name: 'Jungle Paddle Bali', region: 'Canggu', category: 'activity' },
    { name: 'Bali Social Club', region: 'Canggu', category: 'gym' },
    { name: 'FINNS Recreation Club', region: 'Canggu', category: 'gym' },
    { name: 'Elite Fitness Bali', region: 'Canggu', category: 'gym' },

    /* ---- Canggu: cowork ---- */
    { name: 'BeWork Bali', region: 'Canggu', category: 'cowork' },
    { name: 'Tropical Nomad Coworking', region: 'Canggu', category: 'cowork' },
    { name: 'Outpost Canggu', region: 'Canggu', category: 'cowork' },
    { name: 'Genesis Coworking Bali', region: 'Canggu', category: 'cowork' },
    { name: 'Nebula Coworking Bali', region: 'Canggu', category: 'cowork' },

    /* ---- Canggu: stays ---- */
    { name: 'Desa Hay', region: 'Canggu', category: 'stay' },
    { name: 'The Lost Creator House', region: 'Canggu', category: 'stay' },
    { name: 'Lost Villa Bali', region: 'Canggu', category: 'stay' },
    { name: 'Aston Canggu Beach Resort', region: 'Canggu', category: 'stay' },
    { name: 'Villa Culture Canggu', region: 'Canggu', category: 'stay' },

    /* ---- Canggu: misc ---- */
    { name: 'Shooters Canggu', region: 'Canggu', category: 'nightlife' },
    { name: 'Labyrinth Nyanyi', region: 'Canggu', category: 'attraction' },
    { name: 'Tanah Lot Temple', region: 'Canggu', category: 'temple', description: 'The sacred sea temple just north of Canggu.' },

    /* ---- Uluwatu & The Bukit ---- */
    { name: 'Savaya Bali', region: 'Uluwatu & The Bukit', category: 'beach_club', description: "Luxury day club and Bali's top music venue." },
    { name: 'Sundays Beach Club', region: 'Uluwatu & The Bukit', category: 'beach_club', description: 'Nestled beneath the six-star Ungasan Clifftop Resort.' },
    { name: 'Ulu Cliffhouse', region: 'Uluwatu & The Bukit', category: 'beach_club', description: '25-metre infinity pool and an exclusive cliffside beach with private access.' },
    { name: 'Karma Beach Bali', region: 'Uluwatu & The Bukit', category: 'beach_club', description: "Locally grown bamboo exterior alongside Karma Kandara's beach resort." },
    { name: 'Tropical Temptation Beach Club', region: 'Uluwatu & The Bukit', category: 'beach_club', description: 'Mediterranean beach club on Melasti Beach.' },
    { name: 'White Rock Beach Club', region: 'Uluwatu & The Bukit', category: 'beach_club', description: 'Melasti Beach.' },
    { name: 'Palmilla Beach Club Bali', region: 'Uluwatu & The Bukit', category: 'beach_club', description: 'Melasti Beach.' },
    { name: 'One Eighty Beach Club', region: 'Uluwatu & The Bukit', category: 'beach_club', description: 'Pecatu — glass-floored cliff edge.' },
    { name: 'Melasti Beach', region: 'Uluwatu & The Bukit', category: 'attraction' },
    { name: 'Bingin Beach', region: 'Uluwatu & The Bukit', category: 'attraction' },
    { name: 'Uluwatu Temple', region: 'Uluwatu & The Bukit', category: 'temple' },
    { name: 'Jimbaran Bay', region: 'Uluwatu & The Bukit', category: 'attraction' },
    { name: 'Nusa Dua Beach', region: 'Uluwatu & The Bukit', category: 'attraction' },

    /* ---- Ubud: day clubs & pool bars ---- */
    { name: 'JungleFish Pool Bar', region: 'Ubud', category: 'beach_club' },
    { name: 'Folk Pool & Gardens', region: 'Ubud', category: 'beach_club' },
    { name: 'Titi Batu Ubud Club', region: 'Ubud', category: 'beach_club' },
    { name: 'Wanna Jungle Pool & Bar', region: 'Ubud', category: 'beach_club' },
    { name: 'Aksari Resort Ubud', region: 'Ubud', category: 'beach_club' },
    { name: 'Tlaga Singha', region: 'Ubud', category: 'beach_club' },
    { name: 'Cabana Lounge Alila Ubud', region: 'Ubud', category: 'beach_club' },
    { name: 'Cretya Ubud by Alas Harum', region: 'Ubud', category: 'beach_club' },
    { name: 'Omma Day Club Bali', region: 'Ubud', category: 'beach_club' },
    { name: 'Kabana Ubud Jungle Pool Club', region: 'Ubud', category: 'beach_club' },
    { name: 'CP Lounge Ubud', region: 'Ubud', category: 'nightlife' },

    /* ---- Ubud: bars ---- */
    { name: 'Donna Ubud', region: 'Ubud', category: 'nightlife', description: 'South American themed dining and clubbing, three bars and a dance floor beneath the stars.' },
    { name: 'The Laughing Buddha Bar', region: 'Ubud', category: 'bar', description: "One of Ubud's most popular bars, live music nearly every night." },
    { name: 'Room4Dessert', region: 'Ubud', category: 'bar', description: 'Late night tapas and cocktails.' },
    { name: 'Bacari Ubud', region: 'Ubud', category: 'bar', description: 'Premium wine bar with international dinner pairings.' },
    { name: 'Pasir Ubud', region: 'Ubud', category: 'bar', description: 'Mediterranean inspired dinner and cocktail lounge.' },
    { name: 'Jati Bar Four Seasons Sayan', region: 'Ubud', category: 'bar', description: 'Jungle-side bar at the Four Seasons Resort at Sayan.' },
    { name: 'Night Rooster', region: 'Ubud', category: 'bar', description: 'Intimate late night speakeasy from the Locavore team.' },
    { name: 'Ambar at Mandapa', region: 'Ubud', category: 'bar', description: 'Ritz-Carlton Reserve.' },
    { name: 'Dumbo Ubud', region: 'Ubud', category: 'bar', description: "Brooklyn-style pizza joint and arguably Ubud's most popular bar." },
    { name: 'Hujan Locale', region: 'Ubud', category: 'restaurant', description: 'Excellent restaurant that doubles as a late night jazz bar.' },
    { name: 'The Blue Door Ubud', region: 'Ubud', category: 'bar', description: 'Beer garden and sports bar by day, exclusive speakeasy at night.' },
    { name: 'Boliche Bar Ubud', region: 'Ubud', category: 'bar', description: "Late night classic in the home of Ubud's first bar from the 1970s." },
    { name: 'Belle Ubud', region: 'Ubud', category: 'bar', description: 'Premium wine bar and pairings.' },
    { name: 'Kyoka Japanese Kitchen', region: 'Ubud', category: 'bar', description: 'Premium cocktails and traditional Japanese pairings.' },
    { name: 'Current Social Club & Kitchen', region: 'Ubud', category: 'bar' },
    { name: 'No Mas Ubud', region: 'Ubud', category: 'bar', description: 'Casual downtown bar with daily live music.' },
    { name: 'Lazy Cats Cafe', region: 'Ubud', category: 'cafe', description: 'Relaxed premium cocktail lounge and cafe.' },
    { name: "The Bar at Murni's", region: 'Ubud', category: 'bar', description: "A true hidden gem, down a few flights of stairs beneath Murni's restaurant." },
    { name: 'Round Bar Cafe Ubud', region: 'Ubud', category: 'bar' },
    { name: 'MNKY Beat Ubud', region: 'Ubud', category: 'nightlife' },
    { name: 'Ubud Shisha', region: 'Ubud', category: 'bar' },
    { name: 'The Melting Pot Saloon', region: 'Ubud', category: 'bar' },
    { name: 'The Garden Bar Ubud', region: 'Ubud', category: 'bar' },
    { name: 'Kawi Ubud', region: 'Ubud', category: 'bar' },

    /* ---- Ubud: fine dining ---- */
    { name: 'Melali Ubud', region: 'Ubud', category: 'restaurant' },
    { name: 'Apéritif Bali', region: 'Ubud', category: 'restaurant' },
    { name: 'Ibu Susu Bar & Kitchen', region: 'Ubud', category: 'restaurant', description: 'Small, quiet, intimate — some of the best cocktails in Bali.' },

    /* ---- Ubud: cafes ---- */
    { name: 'Pison Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Clear Cafe Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Tucky Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'The Elephant Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Seniman Coffee Studio', region: 'Ubud', category: 'cafe' },
    { name: 'Milk & Madu Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Suka Espresso Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Anomali Coffee Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'RUSTERS Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Pubas Coffee', region: 'Ubud', category: 'cafe' },
    { name: 'Huma Cafe by Goldmine', region: 'Ubud', category: 'cafe' },
    { name: 'KAFE Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Muse Cafe & Art', region: 'Ubud', category: 'cafe' },
    { name: 'Watercress Cafe Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Monsieur Spoon Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'FREAK Coffee Ubud', region: 'Ubud', category: 'cafe' },
    { name: 'Yellow Flower Cafe', region: 'Ubud', category: 'cafe' },
    { name: 'Green Kubu Cafe', region: 'Ubud', category: 'cafe' },
    { name: 'Namaskara Coffee & Superfood', region: 'Ubud', category: 'cafe' },
    { name: 'WYAH Art & Creative Space', region: 'Ubud', category: 'attraction' },

    /* ---- Ubud: attractions, temples, activities ---- */
    { name: 'Sacred Monkey Forest Sanctuary', region: 'Ubud', category: 'attraction' },
    { name: 'Campuhan Ridge Walk', region: 'Ubud', category: 'attraction' },
    { name: 'Goa Gajah Elephant Cave', region: 'Ubud', category: 'attraction' },
    { name: 'Ubud Traditional Art Market', region: 'Ubud', category: 'shop' },
    {
        name: 'Tegalalang Rice Terrace',
        region: 'Ubud',
        category: 'attraction',
        description: 'The rice terraces — and the swings.',
    },
    { name: 'Pura Taman Kemuda Saraswati', region: 'Ubud', category: 'temple' },
    { name: 'Goa Garba', region: 'Ubud', category: 'temple' },
    { name: 'Mason Adventures', region: 'Ubud', category: 'activity' },
    { name: 'Ayung River White Water Rafting', region: 'Ubud', category: 'activity' },
    { name: 'Mason Elephant Park', region: 'Ubud', category: 'activity' },
    { name: 'Ubud Jungle Buggies', region: 'Ubud', category: 'activity' },
    { name: 'Bali Helicopter Tours', region: 'Ubud', category: 'activity' },
    { name: 'Ubud Jungle Trekking', region: 'Ubud', category: 'activity' },
    { name: 'Ubud Mountain Biking', region: 'Ubud', category: 'activity' },

    /* ---- Central Bali waterfalls ---- */
    { name: 'Tukad Cepung Waterfall', region: 'Central Bali', category: 'waterfall', description: 'One of the most spectacular in Bali, in a cave ravine — light rays between 9 and 11am.' },
    { name: 'Goa Raja Waterfall', region: 'Central Bali', category: 'waterfall', description: 'Short walk through the canyon from Tukad Cepung.' },
    { name: 'Kanto Lampo Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Nung Nung Waterfall', region: 'Central Bali', category: 'waterfall', description: "One of Bali's most powerful, about an hour from Ubud." },
    { name: 'Tegenungan Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Layana Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Uma Anyar Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Sumampan Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Beji Griya Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Pengempu Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Manuaba Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Suwat Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Goa Giri Campuhan Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Tibumana Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Taman Sari Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Goa Rang Reng Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Kuning Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Leke Leke Waterfall', region: 'Central Bali', category: 'waterfall', description: 'About an hour from Ubud.' },
    { name: 'Campuhan Antapan Waterfall', region: 'Central Bali', category: 'waterfall' },
    { name: 'Yeh Bulan Waterfall', region: 'Central Bali', category: 'waterfall' },

    /* ---- North Bali waterfalls ---- */
    { name: 'Sekumpul Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Hidden Waterfall Bali', region: 'North Bali', category: 'waterfall' },
    { name: 'Air Fiji Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Tirta Buana Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Banyumala Twin Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Gitgit Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Colek Pamor Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Campuhan Waterfall North Bali', region: 'North Bali', category: 'waterfall' },
    { name: 'Aling Aling Waterfall', region: 'North Bali', category: 'waterfall', description: 'Singaraja — four connected waterfalls. Great for jumping, swimming and sliding.' },
    { name: 'Kroya Waterfall', region: 'North Bali', category: 'waterfall', description: '2nd of the Aling Aling falls, with a 5-metre jump.' },
    { name: 'Kembar Waterfall', region: 'North Bali', category: 'waterfall', description: '3rd of the Aling Aling falls, with 10–15 metre jumps.' },
    { name: 'Pucak Waterfall', region: 'North Bali', category: 'waterfall', description: 'Last of the four Aling Aling falls.' },
    { name: 'Jembong Waterfall', region: 'North Bali', category: 'waterfall', description: '30 minutes from Lovina.' },
    { name: 'Cemara Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Dedari Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Canging Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Munduk Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Golden Valley Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Banyu Wana Amertha Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Bhuana Sari Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Banyuatis Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Santhipala Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Umejero Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Yeh Mampeh Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Jagasatru Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Lower Yeh Labuh Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Upper Yeh Labuh Waterfall', region: 'North Bali', category: 'waterfall' },
    { name: 'Gembleng Waterfall', region: 'North Bali', category: 'waterfall' },

    /* ---- Kuta / Seminyak (Austin & Heaven's own list) ---- */
    { name: 'Hard Rock Bali', region: 'Seminyak & Kuta', category: 'stay' },
    { name: 'Courtyard Bali Seminyak', region: 'Seminyak & Kuta', category: 'stay' },
    {
        name: 'Beachwalk Shopping Center',
        region: 'Seminyak & Kuta',
        category: 'shop',
        description: 'Shopping and restaurants — the more Americanised end of Kuta. '
            + 'See the separate shopping document.',
    },

    /* ---- Ubud day out (Austin & Heaven's own list) ---- */
    {
        name: 'Chez Monique Jewelry',
        region: 'Ubud',
        category: 'activity',
        description: 'Jewellery-making class.',
        links: [{ label: 'Website', url: 'https://chezmoniquejewelry.com/' }],
    },
    {
        name: 'Bali Zen',
        region: 'Ubud',
        category: 'shop',
        description: 'Worth stopping into on the walk down Jl. Monkey Forest Road.',
    },
    {
        name: 'Cafe Lotus',
        region: 'Ubud',
        category: 'restaurant',
        description: 'On Jl. Raya Ubud, just after the Starbucks. Lotus pond and temple views.',
    },
    {
        name: 'Ubud Palace',
        region: 'Ubud',
        category: 'attraction',
        description: 'Puri Saren Agung — right by the Art Market.',
    },

    /* ---- Transport anchors ---- */
    { name: 'Ngurah Rai International Airport', region: 'Seminyak & Kuta', category: 'transport', description: 'DPS — Bali arrival and departure.' },
    { name: 'Singapore Changi Airport', region: 'Singapore', category: 'transport', description: 'SIN.' },
];

export const SEED_NOTES: SeedNote[] = [
    {
        title: 'Do not drink the tap water',
        category: 'Health',
        body:
            'Tap water in Bali is not safe to drink. "Bali Belly" — severe stomach issues and indigestion — '
            + 'is common among tourists, travellers and expats alike. Stick to bottled or filtered water and '
            + 'avoid unclean food and ice.',
    },
    {
        title: 'Currency and cash',
        category: 'Money',
        body:
            'Indonesian rupiah (IDR), roughly 15,000 IDR to 1 USD. Cash is still king even as cards spread '
            + 'with foreign-owned businesses, so carry a handful of 10,000–100,000 IDR notes for daily '
            + 'expenses. Since 2015 businesses are not allowed to charge in dollars, so always keep rupiah '
            + 'on hand. ATMs are easy to find island-wide — tell your bank about the travel dates first so '
            + 'nothing gets flagged or held.',
    },
    {
        title: 'Climate and when to go',
        category: 'Weather',
        body:
            'Warm year-round. The rainy seasons run January to April and October to November — worth '
            + 'planning around if the trip is built on outdoor activities.',
    },
    {
        title: 'Grab and Gojek are the first apps to install',
        category: 'Transport',
        body:
            'Download both on arrival. Think Uber but cheaper — most rides under 30 minutes cost less than '
            + '$1. Both do motorbike and car taxis, and also food delivery, laundry, moving and household '
            + 'repairs. They get scarce once you head out of the major towns into rural areas.',
    },
    {
        title: 'Motorbikes: the honest safety brief',
        category: 'Transport',
        body:
            'Motorbikes rule the roads and are the most convenient way around — from 50,000 IDR (about '
            + '$3.20) per day, delivered to your accommodation. But road rules effectively do not exist. '
            + 'Riding without a helmet is illegal and the fine varies with the officer\'s mood. Never drink '
            + 'and drive, and take extra care at night around Canggu, Uluwatu, Kuta and Seminyak — the most '
            + 'dangerous thing on the road is other drivers. Southern Bali has the best roads in Indonesia, '
            + 'so get comfortable there before heading north.',
    },
    {
        title: 'Timing long drives',
        category: 'Transport',
        body:
            'Traffic is a real constraint. Roads are narrow and usually one lane each way. Time longer '
            + 'journeys for early morning or after 9pm — it removes most of the stress, and avoids sitting '
            + 'behind trucks breathing exhaust in midday heat.',
    },
    {
        title: 'Private drivers',
        category: 'Transport',
        body:
            'About $30–50 for a full day (8–10 hours) depending on distance. Driving is a respected career '
            + 'here and drivers take real pride in showing you the island. Pick one and stick with them — '
            + 'they often end up taking you to their village, a local ceremony, or introducing their family.',
    },
    {
        title: 'Driver contacts',
        category: 'Transport',
        body:
            'Two recommended drivers:\n'
            + '  • contact@thebalidriver.com\n'
            + '  • poetoealit@yahoo.com\n\n'
            + 'Work with your driver for entry to temples and events — they know which ones need a sarong, '
            + 'which are closed for ceremonies, and can get you in where turning up alone is awkward. '
            + 'There are many temples worth visiting; let the driver build that part of the day.',
    },
    {
        title: 'A day in Ubud — suggested walking route',
        category: 'Itinerary ideas',
        body:
            'Rice terraces and the swings first, then into town:\n\n'
            + '1. Monkey Forest — walk the paths and see the monkeys.\n'
            + '2. Walk down Jl. Monkey Forest Road for a snack and some shopping. '
            + 'Stop in at Bali Zen.\n'
            + '3. At Jl. Raya Ubud turn left and eat at Cafe Lotus, just past the Starbucks.\n'
            + '4. After eating, visit the Ubud Art Market and Ubud Palace — they are next to '
            + 'each other.\n\n'
            + 'Separately: the jewellery-making class at Chez Monique, and the rice terraces at '
            + 'Tegalalang where you can ride the swings.',
    },
    {
        title: 'Skip the rental car',
        category: 'Transport',
        body:
            'Not worth it unless you are an exceptionally patient and skilled driver. Expect to pay fines '
            + 'for damage caused while you were not even in the vehicle, and to be honked at, cut off and '
            + 'bumped into by other foreigners on bikes.',
    },
    {
        title: 'Language',
        category: 'Culture',
        body:
            'The official language is Bahasa Indonesia, usually just called Bahasa or Indonesian. In Bali '
            + 'you will also hear Balinese mixed in — there are three Balinese dialects on the island alone, '
            + 'on top of Bahasa and English. Indonesia has 718 actively spoken languages, second only to '
            + 'Papua New Guinea.',
    },
    {
        title: 'Balinese Hinduism',
        category: 'Culture',
        body:
            'Bali practises a form of Hinduism found nowhere else, in a country that is nearly 90% Muslim. '
            + 'Unlike Indian Hinduism it is monotheistic — a blend of Hindu literature with animistic and '
            + 'ancestral worship. You will see daily offerings (canang sari) outside every business, home '
            + 'and street, and ceremonial processions through the streets. If you arrive during a holiday '
            + 'you get something you will not see anywhere else on the planet.',
    },
    {
        title: 'A short history',
        category: 'Culture',
        body:
            'Bali\'s recorded story runs from the Stone Age, but the legacy visible today began with the '
            + 'Majapahit Empire in the 13th century, when Javanese Hindus migrated across with the art and '
            + 'literature that founded Balinese culture. After the empire fell in Java in the 15th century, '
            + 'a mass exodus of Hindu priests, artists and royal families settled alongside the original '
            + 'Bali Aga (mountain Balinese). Dutch colonists built the Dutch East Indies in the 19th '
            + 'century; Bali reached independent statehood in the 20th, having held its beliefs through '
            + 'centuries of religious pressure from its Javanese neighbours.',
    },
    {
        title: 'The people',
        category: 'Culture',
        body:
            'Ask anyone what stayed with them from Bali and the answer usually starts with the people. The '
            + 'culture is built on karma and balance, and a smile gets warmth back. Break down on a scooter '
            + 'anywhere on the island and you will have a community around you within minutes offering '
            + 'help, a hot meal and local palm wine — which is sweet, and much stronger than it tastes.',
    },
];
