# Claude LLM Documentation - Wedding Website Project

## Project Overview
This is a Next.js 16 wedding website with an admin panel for content management. The site uses file-based JSON storage for configuration and PostgreSQL for RSVPs and guest lists. It's deployed via Docker to a Portainer instance.

## Technology Stack
- **Framework**: Next.js 16.0.8 with App Router and Turbopack
- **Runtime**: Node.js 20 (Alpine Linux in Docker)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL 15
- **Image Optimization**: Next.js Image component with `unoptimized` flag
- **Deployment**: Docker multi-stage builds → GitHub Container Registry (ghcr.io) → Portainer
- **File Storage**: Local file system with Docker volumes

## Architecture

### File Structure
```
src/
├── app/
│   ├── (public pages)
│   │   ├── page.tsx                    # Home page with countdown
│   │   ├── about/page.tsx              # About page
│   │   ├── our-story/page.tsx          # Timeline page (vertical timeline)
│   │   ├── wedding-party/page.tsx      # Wedding party page
│   │   ├── schedule/page.tsx           # Schedule page
│   │   ├── photos/page.tsx             # Photo gallery (hearted photos only)
│   │   └── rsvp/page.tsx               # RSVP form
│   ├── admin/
│   │   ├── layout.tsx                  # Admin sidebar navigation
│   │   ├── login/page.tsx              # Admin login
│   │   ├── rsvps/page.tsx              # RSVP management
│   │   ├── photos/page.tsx             # Photo upload/manage with drag-drop
│   │   ├── timeline/page.tsx           # Timeline milestone management
│   │   ├── home/page.tsx               # Home page content editor
│   │   ├── about/page.tsx              # About page content editor
│   │   ├── wedding-party/page.tsx      # Wedding party editor
│   │   ├── schedule/page.tsx           # Schedule editor
│   │   ├── faqs/page.tsx               # Q&A editor
│   │   ├── settings/page.tsx           # General settings (date/time/colors)
│   │   └── wip-control/page.tsx        # Work-in-progress page toggles
│   └── api/
│       ├── admin/
│       │   ├── photos/route.ts         # Photo CRUD operations
│       │   ├── timeline/route.ts       # Timeline milestone CRUD
│       │   ├── site-config/route.ts    # Site settings CRUD
│       │   ├── rsvps/route.ts          # RSVP management (PostgreSQL)
│       │   ├── guest-list/route.ts     # Guest list CRUD (PostgreSQL)
│       │   └── wip-toggles/route.ts    # WIP toggles CRUD (PostgreSQL)
│       ├── auth/
│       │   ├── login/route.ts          # Admin authentication
│       │   ├── logout/route.ts         # Admin logout
│       │   └── check/route.ts          # Auth status check
│       ├── photos/[filename]/route.ts  # Dynamic photo serving (important!)
│       ├── rsvp/route.ts               # Public RSVP submission
│       └── guest-verification/route.ts # Guest name verification
├── components/
│   ├── Navigation.tsx                  # Public navigation bar
│   ├── Footer.tsx                      # Site footer
│   ├── PhotoGallery.tsx                # Photo gallery with lightbox
│   └── CountdownClock.tsx              # Wedding countdown timer
└── middleware.ts                       # Auth + WIP page redirects

public/
├── photos/                             # User-uploaded photos (Docker volume)
└── config/                             # JSON configuration files (Docker volume)
    ├── site.json                       # Site settings, colors, dates
    ├── photos.json                     # Photo metadata with order/hearted
    └── timeline.json                   # Timeline milestones
```

### Data Storage Strategy

#### File-Based Storage (public/config/)
Used for content that needs to be easily editable and portable:
- **site.json**: Wedding date, time, venue, colors, about text, etc.
- **photos.json**: Array of photo objects with `id`, `filename`, `alt`, `title`, `description`, `hearted`, `order`
- **timeline.json**: Array of milestone objects with `id`, `title`, `date`, `description`, `photos[]`

#### PostgreSQL Database
Used for relational data and forms:
- **rsvps**: Guest RSVP submissions
- **guest_list**: Pre-populated guest list with email/phone
- **wip_toggles**: Work-in-progress page toggles

### Docker Architecture

#### Multi-Stage Build (Dockerfile)
```dockerfile
# Stage 1: deps - Install dependencies
# Stage 2: builder - Build Next.js app
# Stage 3: production - Final production image
```

**Key Details:**
- Uses `output: "standalone"` in next.config.ts
- Creates volume mount points: `/app/public/photos` and `/app/public/config`
- Runs as non-root user `nextjs:nodejs` (UID 1001)
- Database initialization script runs on container start

#### Docker Volumes (Portainer)
```yaml
volumes:
  - photos_data:/app/public/photos    # Persisted user-uploaded photos
  - config_data:/app/public/config    # Persisted JSON configuration
  - postgres_data:/var/lib/postgresql/data  # Database persistence
```

**Critical**: Photos uploaded at runtime are stored in Docker volumes, NOT in the image!

### Photo Serving Architecture

**Problem**: With Next.js standalone output, static files uploaded to `public/photos` at runtime (via Docker volume) are NOT automatically served by the Next.js server.

**Solution**: API route serving (`src/app/api/photos/[filename]/route.ts`)
```typescript
// Dynamically serves photos from public/photos directory
GET /api/photos/[filename]
```

**Image References**: All Image components use `/api/photos/[filename]` instead of `/photos/[filename]`

**Example**:
```tsx
<Image src={`/api/photos/${photo}`} alt="Photo" fill unoptimized />
```

## Important Implementation Details

### 1. Photo Management
**Location**: `src/app/admin/photos/page.tsx`

**Features**:
- Drag-and-drop reordering using `@dnd-kit/sortable`
- Heart button to mark favorites (only hearted photos show on public gallery)
- Edit modal for title/description
- Delete functionality
- Photos stored with metadata: `{ id, filename, alt, title, description, hearted, order }`

**Data Flow**:
1. Upload → File saved to `public/photos/` + entry in `photos.json`
2. Reorder → Updates `order` field in `photos.json`
3. Heart → Updates `hearted` field in `photos.json`
4. Public gallery → Filters `photos.json` for `hearted: true`, sorts by `order`

### 2. Timeline Feature
**Public Page**: `src/app/our-story/page.tsx`
**Admin Page**: `src/app/admin/timeline/page.tsx`
**API**: `src/app/api/admin/timeline/route.ts`

**Structure**:
```typescript
interface Milestone {
  id: number;
  title: string;
  date: string;  // YYYY-MM-DD format
  description: string;
  photos: string[];  // Up to 2 photos
}
```

**Display Logic**:
- API sorts milestones oldest-first for chronological order
- Public timeline alternates left/right layout
- Single photo: Full width with `rotate-2` tilt
- Two photos: Side-by-side with `-rotate-3` and `rotate-3` tilts
- Centered accent-colored dots on vertical timeline line

**Photo Management**:
- Can upload 2 photos per milestone
- Can add/change/delete photos after creation via edit modal
- Photos deleted from `public/photos/` when milestone deleted or photo removed

### 3. Countdown Clock
**Component**: `src/components/CountdownClock.tsx`
**Location**: Home page, between intro text and decorative line

**Features**:
- Real-time countdown updating every second
- Reads from `weddingDate` and `weddingTime` in site.json
- Displays: Days | Hours | Minutes | Seconds
- Proper hydration handling with `mounted` state
- Responsive sizing (20x20 mobile, 24x24 desktop)

### 4. RSVP System
**Public Form**: `src/app/rsvp/page.tsx`
**Admin Management**: `src/app/admin/rsvps/page.tsx`

**Flow**:
1. User enters name → Checks against `guest_list` table for verification
2. If match found → Pre-fills email/phone, allows editing
3. User submits RSVP → Saved to `rsvps` table
4. User can edit existing RSVP by re-entering name

**Guest List Features**:
- Import from CSV
- Manual add/edit/delete
- Fields: name, email, phone, party_size, side, notes, plus_one_name
- RSVP status tracking

### 5. Work-in-Progress Control
**Admin Page**: `src/app/admin/wip-control/page.tsx`
**Middleware**: `src/middleware.ts`

**Pages**:
- Home (`/`)
- About (`/about`)
- Timeline (`/our-story`)
- Wedding Party (`/wedding-party`)
- Schedule (`/schedule`)
- Photos (`/photos`)
- RSVP (`/rsvp`)

**Behavior**:
- Non-admin users redirected to `/work-in-progress` when page marked as WIP
- Admin users (authenticated) always have access
- Toggle stored in PostgreSQL `wip_toggles` table

### 6. Authentication
**System**: Cookie-based with bcrypt password hashing
**Admin Password**: Set via `ADMIN_PASSWORD` environment variable
**Session**: Stored in HTTP-only cookie

**Protected Routes**: All `/admin/*` pages except `/admin/login`

## Build & Deployment Workflow

### Local Development
```bash
npm run dev  # Starts on localhost:3000
```

### Docker Build & Deploy
```bash
# 1. Build production image
docker build -t ghcr.io/soccerbeats/weddingwebsite:latest --target production .

# 2. Push to GitHub Container Registry
docker push ghcr.io/soccerbeats/weddingwebsite:latest

# 3. Deploy to Portainer
# User manually pulls and redeploys via Portainer UI
# OR Portainer webhook auto-deploys on new image push
```

### Environment Variables (Portainer)
```env
DATABASE_URL=postgresql://user:password@db:5432/dbname
ADMIN_PASSWORD=securepassword
NODE_ENV=production
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=dbname
```

## Common Tasks & Patterns

### Adding a New Public Page
1. Create `src/app/new-page/page.tsx`
2. Add to navigation: `src/components/Navigation.tsx` (links array)
3. Add to WIP control: `src/app/admin/wip-control/page.tsx` (publicPages array)
4. Create admin editor if needed: `src/app/admin/new-page/page.tsx`
5. Add to admin nav: `src/app/admin/layout.tsx` (navItems array)
6. Rebuild and push Docker image

### Adding File-Based Config
1. Create JSON structure in `public/config/`
2. Create API route in `src/app/api/admin/`
3. Use `fs.readFileSync` and `fs.writeFileSync`
4. Ensure directory exists before writing
5. Use Docker volume mount for persistence

### Working with Images
**Always use**:
```tsx
<Image
  src={`/api/photos/${filename}`}  // NOT /photos/${filename}
  alt="Description"
  fill  // or width/height
  unoptimized  // Required for dynamic volume photos
  className="object-cover"
/>
```

### Updating Colors/Theme
**Location**: `src/app/admin/settings/page.tsx`
**Storage**: `public/config/site.json`
**CSS Variables**: Injected in layout via `<style>` tag
```css
:root {
  --accent: #D4AF37;
  --accent-light: #F4E5C3;
  --accent-dark: #B8941F;
}
```

## Debugging Tips

### Photos Not Displaying
1. Check if file exists in Docker volume: `docker exec -it <container> ls /app/public/photos`
2. Verify image path uses `/api/photos/` prefix
3. Check API route: `curl http://localhost:3000/api/photos/filename.jpg`
4. Ensure `unoptimized` prop on Image component

### Build Warnings/Errors
1. TypeScript errors: Check `params` is Promise in Next.js 16 dynamic routes
2. ENV warnings: Use `ENV KEY=value` format in Dockerfile
3. Module not found: Check imports and file paths

### Data Not Persisting
1. Verify Docker volumes are mounted correctly
2. Check file permissions (should be `nextjs:nodejs`)
3. Ensure API route creates directory before writing
4. Check JSON parsing/stringification

### Authentication Issues
1. Verify `ADMIN_PASSWORD` environment variable is set
2. Check cookie is being set (HttpOnly, SameSite)
3. Middleware should redirect to `/admin/login` if not authenticated
4. Use `fetch('/api/auth/check')` to verify auth status

## Code Style & Conventions

### File Naming
- Components: PascalCase (`PhotoGallery.tsx`)
- Pages: lowercase (`page.tsx`)
- API routes: lowercase (`route.ts`)

### TypeScript
- Always define interfaces for data structures
- Use `React.FC` sparingly (prefer explicit function components)
- Avoid `any` types - use proper interfaces

### Tailwind Classes
- Order: layout → sizing → spacing → colors → effects
- Use arbitrary values sparingly: `h-[300px]`
- Prefer semantic spacing: `gap-4`, `p-6`, `mb-8`

### API Routes
- Use proper HTTP methods: GET, POST, PATCH, DELETE
- Return consistent JSON responses: `{ success: true }` or `{ error: 'message' }`
- Use try-catch for error handling
- Validate input before processing

## Deployment Checklist

Before pushing new Docker image:
- [ ] All TypeScript compilation successful
- [ ] No console errors in browser
- [ ] Test all admin panel features
- [ ] Test public pages
- [ ] Verify image uploads/display work
- [ ] Check responsive design (mobile)
- [ ] Test authentication flow
- [ ] Verify WIP toggles work
- [ ] Build completes without errors/warnings
- [ ] Push to ghcr.io
- [ ] Pull and redeploy in Portainer
- [ ] Verify live site works

## Known Limitations

1. **Photo Storage**: Photos are stored in Docker volumes, not committed to git
2. **Database**: PostgreSQL data in Docker volume, requires separate backup strategy
3. **No CDN**: Images served directly from Next.js (consider Cloudflare/CDN for production)
4. **Single Admin User**: Only one admin password, no user management
5. **No Image Optimization**: Using `unoptimized` flag on all images for volume compatibility

## Future Improvements

- Add image compression/optimization before upload
- Implement proper CDN for photo delivery
- Add multi-user admin system with roles
- Add email notifications for RSVPs
- Add calendar integration (.ics file generation)
- Add analytics/tracking
- Add sitemap generation
- Add social media meta tags
