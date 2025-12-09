# Wedding Website Implementation Plan

## Overview
Building a modern, containerized wedding website with 4 main sections: About, RSVP, Schedule, and Photos. The site will feature black & white photography with colorful accents and run entirely in Docker.

## Architecture

### Tech Stack (Recommended)
- **Framework**: Next.js 14+ (React-based, with App Router)
- **Styling**: Tailwind CSS (easy color customization)
- **Database**: PostgreSQL (for RSVP data)
- **API**: Next.js API Routes (built-in backend)
- **Containerization**: Docker + Docker Compose
- **Image Management**: Config-file based (JSON) with static assets

### Why This Stack?
- **Next.js**: Single codebase for frontend + backend, great performance, modern
- **Tailwind**: Utility-first CSS, easy to customize colors for accent scheme
- **PostgreSQL**: Reliable, supports Docker well, perfect for RSVP data
- **Config-based photos**: Simple JSON file listing photo paths - easy to update without code changes

## Project Structure

```
weddingwebsite/
├── docker-compose.yml          # Orchestrates all containers
├── Dockerfile                  # Next.js app container
├── .env.example               # Environment variables template
├── .env                       # Local environment config (gitignored)
├── package.json
├── next.config.js
├── tailwind.config.js
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout with navigation
│   │   ├── page.tsx           # Home/landing page
│   │   ├── about/
│   │   │   └── page.tsx       # About page
│   │   ├── rsvp/
│   │   │   └── page.tsx       # RSVP form page
│   │   ├── schedule/
│   │   │   └── page.tsx       # Daily schedule page
│   │   ├── photos/
│   │   │   └── page.tsx       # Photo gallery page
│   │   └── api/
│   │       └── rsvp/
│   │           └── route.ts   # RSVP submission endpoint
│   ├── components/
│   │   ├── Navigation.tsx     # Site navigation
│   │   ├── Footer.tsx         # Footer component
│   │   ├── PhotoGallery.tsx   # Photo grid component
│   │   └── RSVPForm.tsx       # RSVP form component
│   ├── lib/
│   │   └── db.ts              # Database connection
│   └── styles/
│       └── globals.css        # Global styles
├── public/
│   ├── photos/                # Wedding photos (B&W)
│   │   ├── photo1.jpg
│   │   ├── photo2.jpg
│   │   └── ...
│   └── config/
│       └── photos.json        # Photo metadata & ordering
└── database/
    └── init.sql               # Database initialization script
```

## Implementation Plan

### Phase 1: Project Setup & Docker Configuration
1. **Initialize Next.js project**
   - Create Next.js app with TypeScript
   - Install dependencies (Tailwind, PostgreSQL client)
   - Configure Tailwind with custom color scheme

2. **Docker Setup**
   - Create Dockerfile for Next.js app
   - Create docker-compose.yml with:
     - Next.js service (port 3000)
     - PostgreSQL service (port 5432)
   - Create database initialization script
   - Set up environment variables

3. **Database Schema**
   - Create RSVP table:
     ```sql
     CREATE TABLE rsvps (
       id SERIAL PRIMARY KEY,
       guest_name VARCHAR(255) NOT NULL,
       email VARCHAR(255) NOT NULL,
       phone VARCHAR(50),
       attending BOOLEAN NOT NULL,
       number_of_guests INTEGER DEFAULT 1,
       dietary_restrictions TEXT,
       message TEXT,
       created_at TIMESTAMP DEFAULT NOW()
     );
     ```

### Phase 2: Core Layout & Navigation
1. **Root Layout**
   - Create responsive navigation bar
   - Implement mobile menu (hamburger)
   - Design footer with wedding details
   - Set up color scheme (B&W + accent color)

2. **Design System**
   - Define Tailwind color palette
   - Create reusable component styles
   - Implement typography system
   - Add animations/transitions

### Phase 3: Page Implementation

#### 3.1 About Page
- Hero section with couple's photo (B&W)
- "Our Story" section
- Meet the wedding party (optional)
- Venue information
- Accommodations info
- FAQ section

#### 3.2 RSVP Page
- RSVP form with fields:
  - Guest name(s)
  - Email
  - Phone
  - Attending (Yes/No)
  - Number of guests
  - Dietary restrictions
  - Special message
- Form validation
- Success/error messaging
- API endpoint to save to PostgreSQL
- **Email notifications**:
  - Confirmation email to guest
  - Notification email to couple with RSVP details
  - Using Nodemailer with SMTP

#### 3.3 Schedule Page
- Timeline of wedding day events
- Date/time for each event
- Location for each event
- Dress code information
- Transportation details
- Interactive or static timeline design

#### 3.4 Photos Page
- Responsive photo gallery grid
- Lightbox/modal for full-size viewing
- Photos loaded from photos.json config
- Lazy loading for performance
- Optional: Photo categories (Engagement, Venue, etc.)

### Phase 4: Photo Management System
1. **Config-based approach**
   - Create `public/config/photos.json`:
     ```json
     {
       "photos": [
         {
           "id": 1,
           "filename": "photo1.jpg",
           "alt": "Description",
           "category": "engagement"
         }
       ]
     }
     ```

2. **Photo update process**
   - Add photos to `public/photos/` folder
   - Update `photos.json` with metadata
   - Restart container (or hot-reload in dev)

### Phase 5: Styling & Polish
1. **Color Scheme Implementation**
   - B&W photos throughout
   - **Gold accent color** (#D4AF37) applied to:
     - Buttons and CTAs
     - Links and navigation highlights
     - Section dividers
     - Form elements and focus states
     - Hover states
     - Decorative elements

2. **Responsive Design**
   - Mobile-first approach
   - Tablet breakpoints
   - Desktop layout
   - Test on multiple devices

3. **Animations**
   - Subtle fade-ins on scroll
   - Smooth page transitions
   - Hover effects
   - Loading states

### Phase 6: Testing & Deployment
1. **Testing**
   - Test RSVP form submission
   - Verify database storage
   - Check responsive design
   - Test Docker build process
   - Cross-browser testing

2. **Production Setup**
   - Environment variables configuration
   - Database backups
   - SSL/HTTPS setup (if deploying to server)
   - Performance optimization

## Docker Commands

### Development
```bash
# Build and start containers
docker-compose up --build

# Stop containers
docker-compose down

# View logs
docker-compose logs -f

# Access database
docker-compose exec db psql -U wedding_user -d wedding_db
```

### Production
```bash
# Build for production
docker-compose -f docker-compose.prod.yml up -d

# View RSVPs from database
docker-compose exec db psql -U wedding_user -d wedding_db -c "SELECT * FROM rsvps;"
```

## Photo Update Workflow

1. **Add new photos**:
   - Place images in `public/photos/`
   - Use descriptive filenames

2. **Update config**:
   - Edit `public/config/photos.json`
   - Add new photo entries with metadata

3. **Deploy changes**:
   - Rebuild container: `docker-compose up --build`
   - Or use volume mount for hot-reload in dev

## Customization Points

### Colors
- Gold accent color scheme in `tailwind.config.js`:
  ```js
  colors: {
    accent: '#D4AF37', // Gold - main accent
    'accent-light': '#F4E5C3', // Light gold
    'accent-dark': '#B8941F', // Dark gold
  }
  ```

### Content
- About page: Edit `src/app/about/page.tsx`
- Schedule: Edit `src/app/schedule/page.tsx`
- Photos: Edit `public/config/photos.json`

### Styling
- Global styles: `src/styles/globals.css`
- Component styles: Inline Tailwind classes

## Optional Enhancements (Future)

1. **Admin Dashboard**
   - View all RSVPs
   - Export to CSV
   - Edit/delete entries
   - Protected with authentication

2. **Email Notifications**
   - Send confirmation emails to guests
   - Notify couple when RSVP submitted
   - Use SendGrid or similar service

3. **Guest Upload**
   - Allow guests to upload their own photos
   - Integration with WeddingShare

4. **Countdown Timer**
   - Days until wedding counter on homepage

5. **Registry Integration**
   - Links to gift registries
   - Embed registry widgets

## Estimated Implementation Steps

1. **Setup & Config** (Steps 1-5): Project initialization, Docker, database
2. **Navigation & Layout** (Steps 6-8): Root layout, navigation, footer
3. **About Page** (Steps 9-12): Content sections, styling
4. **RSVP Page** (Steps 13-18): Form, validation, API, database integration
5. **Schedule Page** (Steps 19-21): Timeline design and content
6. **Photos Page** (Steps 22-25): Gallery, config system, lightbox
7. **Photo Management** (Steps 26-27): Config file setup, update workflow
8. **Styling Polish** (Steps 28-32): Colors, responsive design, animations
9. **Testing & Launch** (Steps 33-35): Testing, deployment

## Next Steps

Once approved, implementation will begin with:
1. Initialize Next.js project with TypeScript
2. Set up Docker and docker-compose configuration
3. Create database schema and connection
4. Build core layout and navigation
5. Implement each page systematically
6. Add styling and polish
7. Test and deploy

## Design Decisions (Confirmed)

1. **Accent color**: **Gold** - Warm metallic, luxurious and classic
2. **RSVP notifications**: **Yes** - Email notifications on RSVP submission
3. **Tech stack**: **Next.js + PostgreSQL** - Modern, maintainable stack

## Email Notification Setup

For RSVP email notifications, we'll use **Nodemailer** with SMTP:
- Configure email service (Gmail, SendGrid, or custom SMTP)
- Send confirmation email to guest
- Send notification email to couple with RSVP details
- Include in API route implementation

Environment variables needed:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
NOTIFICATION_EMAIL=your-notification@email.com
```
