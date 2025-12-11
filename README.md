# Wedding Website

A beautiful, customizable wedding website built with Next.js 16. Features include photo galleries, timeline of your relationship, RSVP management, and a comprehensive admin panel for content management.

## Features

### Public Site
- **Home Page**: Welcome message with countdown timer to your wedding day
- **About**: Your love story with customizable text and photos
- **Timeline**: Interactive vertical timeline of relationship milestones with photos
- **Wedding Party**: Display your bridesmaids, groomsmen, and important people
- **Schedule**: Wedding day timeline and events
- **Photo Gallery**: Beautiful photo gallery with lightbox view (only shows "hearted" photos)
- **RSVP**: Guest RSVP form with name verification
- **Responsive Design**: Mobile-friendly across all pages

### Admin Panel
- **Dashboard**: Centralized admin panel at `/admin`
- **RSVP Management**: View and manage guest responses
- **Photo Management**: Upload, edit, reorder (drag-drop), heart photos, add titles/descriptions
- **Timeline Editor**: Create and manage relationship milestones with up to 2 photos each
- **Content Editors**: Edit content for Home, About, Wedding Party, Schedule, and Q&A pages
- **General Settings**: Customize colors, dates, times, venue information
- **Work-in-Progress Control**: Toggle which pages are visible to public vs. in WIP mode
- **Guest List Import**: Import pre-populated guest list from CSV

## Quick Start

### Using Portainer (Recommended & Easiest)

This is the **preferred method** for production deployment. It's the simplest way to get your wedding website running.

1. **Copy the Docker Compose configuration**
   - Open `docker-compose.prod.yml` in this repository
   - Copy the entire contents

2. **Create a new Stack in Portainer**
   - Log into your Portainer instance
   - Navigate to "Stacks" → "Add stack"
   - Give it a name (e.g., "wedding-website")
   - Paste the `docker-compose.prod.yml` contents into the web editor

3. **Add environment variables**
   Click on "Advanced mode" or scroll to "Environment variables" section and add:
   ```env
   ADMIN_PASSWORD=your_secure_password
   POSTGRES_USER=wedding_user
   POSTGRES_PASSWORD=secure_db_password
   POSTGRES_DB=wedding_db
   DATABASE_URL=postgresql://wedding_user:secure_db_password@db:5432/wedding_db
   NODE_ENV=production
   ```

   **Important**: Replace the password values with your own secure passwords!

4. **Deploy the stack**
   - Click "Deploy the stack"
   - Wait for Portainer to pull the image and start containers
   - This may take a few minutes on first deployment

5. **Access your site**
   - Public site: `http://your-server-ip:3000`
   - Admin panel: `http://your-server-ip:3000/admin`
   - Login with the `ADMIN_PASSWORD` you set

6. **Configure DNS** (Optional)
   - Point your domain to your server's IP address
   - Set up reverse proxy (nginx/Caddy) for HTTPS
   - Update Portainer port mapping if needed

**Why Portainer?**
- ✅ No need to clone repository or install dependencies
- ✅ Easy updates via "Pull and redeploy" button
- ✅ Web-based management and monitoring
- ✅ Automatic container restarts
- ✅ Built-in log viewer
- ✅ Persistent volumes handled automatically

### Using Docker Compose Locally

If you prefer running locally or don't have Portainer:

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd weddingwebsite
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your values:
   ```env
   ADMIN_PASSWORD=your_secure_password
   POSTGRES_USER=wedding_user
   POSTGRES_PASSWORD=secure_db_password
   POSTGRES_DB=wedding_db
   DATABASE_URL=postgresql://wedding_user:secure_db_password@db:5432/wedding_db
   NODE_ENV=production
   ```

3. **Start the application**
   ```bash
   docker-compose up -d --build
   ```

4. **Access the site**
   - Public site: `http://localhost:3000`
   - Admin panel: `http://localhost:3000/admin`
   - Login with the password you set in `ADMIN_PASSWORD`

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

## Admin Panel Guide

### First Time Setup

1. **Login**: Navigate to `/admin` and enter your admin password
2. **General Settings**: Set your wedding date, time, venue, and color scheme
3. **Upload Photos**: Go to Photos tab and upload your images
4. **Create Timeline**: Add milestones to your relationship timeline
5. **Import Guest List**: Upload a CSV with guest names and contact info
6. **Customize Content**: Edit About page, Wedding Party, Schedule, etc.

### Managing Photos

**Upload Photos**:
1. Go to Admin → Photos
2. Click the upload area or drag files
3. Photos appear in the grid

**Organize Photos**:
- **Drag to reorder**: Photos display in the order you arrange them
- **Heart photos**: Click the heart icon - only hearted photos show in public gallery
- **Edit details**: Click edit icon to add title and description
- **Delete**: Click delete icon to remove photos

**Best Practices**:
- Heart only your favorite photos (these appear in public gallery)
- Add descriptive titles for better organization
- Recommended image size: 1920x1080px or larger

### Timeline Management

1. Go to Admin → Timeline
2. Click "Add Milestone"
3. Fill in:
   - Title (e.g., "First Date", "The Proposal")
   - Date
   - Description of the event
   - Upload 1-2 photos (optional)
4. Click "Add Milestone"

**Editing Milestones**:
- Click "Edit" on any milestone
- Update text fields
- Add, change, or delete photos
- Photos display side-by-side with elegant tilt effect

**Timeline appears oldest to newest** on both admin panel and public site.

### RSVP Management

**View RSVPs**:
1. Go to Admin → RSVPs
2. See all guest responses with attendance status
3. Filter and search through responses
4. Export to CSV if needed

**Manage Guest List**:
1. Go to Admin → RSVPs → Guest List tab
2. Manually add guests OR import from CSV
3. CSV format:
   ```csv
   name,email,phone,party_size,side,notes,plus_one_name
   John Doe,john@email.com,555-1234,2,Bride,Vegan meal,Jane Doe
   ```

**Guest RSVP Flow**:
1. Guest enters their name on RSVP page
2. System checks against guest list
3. If found, pre-fills email/phone (editable)
4. Guest completes RSVP form
5. Confirmation page shows with edit instructions

### Customizing Colors

1. Go to Admin → General Settings
2. Choose from preset color schemes OR set custom colors:
   - **Accent Color**: Primary color for headings, buttons, highlights
   - **Accent Light**: Lighter shade for backgrounds
   - **Accent Dark**: Darker shade for hover states
3. Click "Save Settings"
4. Colors update across entire site instantly

### Work-in-Progress Mode

**Use Case**: Hide pages from public while you're still working on them

1. Go to Admin → Work in Progress
2. Toggle any page to "Work in Progress"
3. Non-admin visitors see a WIP message
4. Admins (logged in) always see full site
5. Toggle back to "Live" when ready

## Docker Management

### View Logs
```bash
docker-compose logs -f web      # Application logs
docker-compose logs -f db       # Database logs
```

### Stop Services
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
```

### Update to Latest Version
```bash
docker-compose pull
docker-compose up -d
```

### Database Operations

**View RSVPs**:
```bash
docker-compose exec db psql -U wedding_user -d wedding_db -c "SELECT * FROM rsvps;"
```

**Backup Database**:
```bash
docker-compose exec db pg_dump -U wedding_user wedding_db > backup.sql
```

**Restore Database**:
```bash
cat backup.sql | docker-compose exec -T db psql -U wedding_user wedding_db
```

## Production Deployment (Portainer)

### Initial Setup

1. **Push to GitHub Container Registry**:
   ```bash
   docker build -t ghcr.io/yourusername/weddingwebsite:latest --target production .
   docker push ghcr.io/yourusername/weddingwebsite:latest
   ```

2. **Create Stack in Portainer**:
   - Use `docker-compose.yml` as template
   - Set environment variables in Portainer
   - Create persistent volumes for photos and config
   - Deploy stack

3. **Configure DNS**: Point your domain to server IP

### Updating Production

1. **Build and push new image**:
   ```bash
   docker build -t ghcr.io/yourusername/weddingwebsite:latest --target production .
   docker push ghcr.io/yourusername/weddingwebsite:latest
   ```

2. **Update in Portainer**:
   - Go to your stack
   - Click "Pull and redeploy"
   - Wait for containers to restart

## File Storage

### Photos
- Stored in: `public/photos/` (Docker volume)
- Accessed via: `/api/photos/[filename]` API route
- **Important**: Photos are NOT in git - backed up via Docker volumes

### Configuration
- Stored in: `public/config/` (Docker volume)
- Files:
  - `site.json`: General settings, colors, dates, content
  - `photos.json`: Photo metadata (order, hearted status, titles)
  - `timeline.json`: Timeline milestones
- **Important**: Config files are NOT in git - backed up via Docker volumes

### Database
- PostgreSQL data in Docker volume
- Tables: `rsvps`, `guest_list`, `wip_toggles`
- Regular backups recommended

## Backup Strategy

### Essential Data to Backup

1. **Docker Volumes**:
   ```bash
   # Backup photos
   docker cp <container-id>:/app/public/photos ./backup/photos

   # Backup config
   docker cp <container-id>:/app/public/config ./backup/config
   ```

2. **Database**:
   ```bash
   docker-compose exec db pg_dump -U wedding_user wedding_db > backup-$(date +%Y%m%d).sql
   ```

3. **Environment Variables**: Save your `.env` file securely

### Restore from Backup

1. **Restore volumes**:
   ```bash
   docker cp ./backup/photos <container-id>:/app/public/photos
   docker cp ./backup/config <container-id>:/app/public/config
   ```

2. **Restore database**:
   ```bash
   cat backup.sql | docker-compose exec -T db psql -U wedding_user wedding_db
   ```

## Troubleshooting

### Photos Not Showing
- **Check**: Photos must be uploaded through admin panel (not FTP)
- **Verify**: File exists in Docker volume: `docker exec <container> ls /app/public/photos`
- **Solution**: Re-upload through admin panel if missing

### Can't Login to Admin
- **Check**: Verify `ADMIN_PASSWORD` environment variable is set
- **Reset**: Update password in Portainer environment variables and restart
- **Clear cookies**: Try in incognito/private browsing mode

### RSVP Form Not Working
- **Check**: Database connection (verify `DATABASE_URL`)
- **Logs**: `docker-compose logs web` for errors
- **Guest List**: Ensure guest names match exactly (case-sensitive)

### Timeline Photos Missing
- **Check**: Navigate to Admin → Timeline and verify photos are uploaded
- **Verify**: Each milestone can have 0-2 photos
- **Solution**: Click Edit on milestone and re-upload photos

### Site Showing as Work-in-Progress
- **Check**: Go to Admin → Work in Progress
- **Toggle**: Ensure page is set to "Live" (green)
- **Note**: Admins always see full site regardless of WIP status

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL 15
- **Authentication**: Cookie-based with bcrypt
- **File Storage**: Local file system with Docker volumes
- **Deployment**: Docker, Portainer, GitHub Container Registry
- **Image Optimization**: Next.js Image component

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Tips

- Keep photo file sizes under 2MB each
- Use JPG format for photos (smaller than PNG)
- Heart only your favorite photos for public gallery
- Limit timeline to 10-15 key milestones

## Security

- Admin panel password-protected
- Cookies are HTTP-only and secure
- SQL injection protection via parameterized queries
- File upload validation (images only)
- Environment variables for sensitive data

## Support & Documentation

- **Developer Docs**: See `CLAUDE.md` for technical details
- **Issues**: Open an issue on GitHub
- **Updates**: Check GitHub releases for new features

## License

Private project - All rights reserved

---

**Made with ❤️ for your special day**
