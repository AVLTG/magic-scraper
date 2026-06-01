# TableTally

A web application that allows you to check which cards from your Magic: The Gathering decklist are available in your friends' collections. The app scrapes Moxfield collections and provides an easy-to-use interface for deck checking.

## Features

- **Deck Checking**: Paste a decklist and see which cards your friends own
- **Multiple Printings**: View all available printings of each card across all collections
- **Hover Preview**: Hover over any printing to see the card image
- **Automatic Updates**: Daily collection updates at 2 AM (configurable)
- **Manual Updates**: Admin panel for manual collection refreshes
- **Compact View**: Grid layout showing multiple printings efficiently

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite with Prisma ORM
- **Scraping**: Puppeteer for Moxfield collection data
- **Deployment**: Raspberry Pi with Cloudflare Tunnel (recommended)

## Prerequisites

- Node.js 18+ and npm
- Git

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/AVLTG/tabletally.git
cd tabletally
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="file:./dev.db"
ADMIN_SECRET="your-secure-admin-password-here"
CRON_SECRET="your-secure-cron-secret-here"
```

Replace the placeholder values with strong, random passwords.

### 4. Configure Users

Create a `src/lib/seedUsers.ts` file (this file is gitignored for privacy):

```typescript
import { prisma } from './prisma';

export async function seedUsers() {
  const users = [
    { name: 'Your Name', moxfieldCollectionId: 'your-moxfield-collection-id' },
    { name: 'Friend 1', moxfieldCollectionId: 'friend-1-collection-id' },
    { name: 'Friend 2', moxfieldCollectionId: 'friend-2-collection-id' },
    // Add more friends as needed
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { moxfieldCollectionId: user.moxfieldCollectionId },
      update: {},
      create: user,
    });
  }

  console.log('Users seeded successfully');
}
```

**How to find Moxfield Collection IDs:**
1. Go to your Moxfield collection page
2. Click "Share" to get the share link
3. The collection ID is the random string at the end of the URL
   - Example: `https://moxfield.com/collection/ABC123xyz` → ID is `ABC123xyz`

### 5. Initialize the Database

```bash
# Create database and run migrations
npx prisma migrate dev --name init

# Generate Prisma Client
npx prisma generate

# Seed users
npx tsx src/scripts/seed.ts
```

### 6. Populate Collections

Start the development server:

```bash
npm run dev
```

Then visit `http://localhost:3000/admin` and:
1. Enter your admin password (from `.env`)
2. Click "Update All Collections"

This will scrape all users' Moxfield collections and populate the database. This process may take several minutes depending on collection sizes.

### 7. Verify Setup

Open Prisma Studio to verify data:

```bash
npx prisma studio
```

Check that:
- All users are in the `users` table
- Cards are populated in the `collection_cards` table

## Usage

### Checking a Deck

1. Navigate to `http://localhost:3000/checkDeck`
2. Paste your decklist in the format:
   ```
   1 Card Name
   2 Another Card
   4 Sol Ring
   ```
3. Click "Check Deck"
4. Expand any card to see all available printings
5. Hover over a printing to see the card image

### Admin Panel

Visit `http://localhost:3000/admin` to manually update collections:
1. Enter your admin password
2. Click "Update All Collections"

### Adding New Users

1. Update `src/lib/seedUsers.ts` with the new user's info
2. Run: `npx tsx src/scripts/seed.ts`
3. Update collections via the admin panel

## Deployment on Raspberry Pi

### Prerequisites

- Raspberry Pi (3B+ or newer recommended)
- Raspberry Pi OS (64-bit recommended)
- Node.js 18+ installed
- Cloudflare account (free tier works)

### Setup Steps

#### 1. Install Node.js on Raspberry Pi

```bash
# Download and install nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# in lieu of restarting the shell
\. "$HOME/.nvm/nvm.sh"

# Download and install Node.js:
nvm install 20 # LTS with arm support

# Verify the Node.js version:
node -v

# Verify npm version:
npm -v
```

#### 2. Clone and Set Up Project

```bash
cd ~
git clone https://github.com/AVLTG/tabletally.git
cd tabletally

# Install dependencies
npm install

# Set up environment variables
nano .env
# (Paste your production environment variables)

# Initialize database
npx prisma migrate deploy
npx prisma generate
npx tsx src/scripts/seed.ts

# Build the project
npm run build
```

#### 3. Set Up PM2 for Process Management

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the application
pm2 start npm --name "tabletally" -- start

# Enable startup on boot
pm2 startup
pm2 save
```

#### 4. Set Up Cloudflare Tunnel

**Install cloudflared:**

```bash
# Download and install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared-linux-arm64.deb

# Authenticate with Cloudflare
cloudflared tunnel login
```

**Create and configure tunnel:**

```bash
# Create tunnel
cloudflared tunnel create tabletally

# Note the tunnel ID from the output

# Create config file
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

**Config file contents:**

```yaml
tunnel: <your-tunnel-id>
credentials-file: /home/pi/.cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: your-domain.com
    service: http://localhost:3000
  - service: http_status:404
```

**Route tunnel to your domain:**

```bash
cloudflared tunnel route dns tabletally your-domain.com
```

**Run tunnel as a service:**

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

#### 5. Set Up Automatic Daily Updates

**Create cron job:**

```bash
crontab -e
```

**Add this line (runs at 2 AM daily):**

```
0 2 * * * curl -X POST http://localhost:3000/api/cron/updateCollections -H "Authorization: Bearer your-cron-secret-here"
```

Replace `your-cron-secret-here` with your `CRON_SECRET` from `.env`.

### Monitoring

**Check application status:**

```bash
pm2 status
pm2 logs tabletally
```

**Check tunnel status:**

```bash
sudo systemctl status cloudflared
```

**Check database:**

```bash
cd ~/tabletally
npx prisma studio
```

## Project Structure

```
tabletally/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── dev.db                 # SQLite database (gitignored)
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   └── page.tsx       # Admin panel
│   │   ├── checkDeck/
│   │   │   └── page.tsx       # Deck checker page
│   │   └── api/
│   │       ├── checkDeck/
│   │       │   └── route.ts   # Deck checking API
│   │       ├── admin/
│   │       │   └── updateCollections/
│   │       │       └── route.ts  # Manual update API
│   │       └── cron/
│   │           └── updateCollections/
│   │               └── route.ts  # Cron update API
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client
│   │   ├── parseDeck.ts       # Decklist parser
│   │   ├── updateCollections.ts  # Collection update logic
│   │   ├── seedUsers.ts       # User seeding (gitignored)
│   │   └── scrapeMoxfield/
│   │       └── scrapeMoxfield.ts  # Moxfield scraper
│   └── scripts/
│       └── seed.ts            # Seed script runner
├── types/
│   └── moxfield.ts            # TypeScript types
├── .env                       # Environment variables (gitignored)
├── .gitignore
├── package.json
└── README.md
```

## Troubleshooting

### "Module not found" errors

```bash
npm install
npx prisma generate
```

### Empty database after update

Check terminal logs during update for errors. Common issues:
- Invalid Moxfield collection IDs
- Network connectivity
- Puppeteer dependencies missing

Install Puppeteer dependencies on Raspberry Pi:

```bash
sudo apt install -y chromium-browser chromium-codecs-ffmpeg
```

### Slow scraping

The scraper uses Puppeteer which can be slow on Raspberry Pi. Consider:
- Using a more powerful device for initial population
- Reducing update frequency
- Running updates during off-peak hours

### Port 3000 already in use

```bash
# Kill process using port 3000
sudo lsof -ti:3000 | xargs kill -9

# Or change port
PORT=3001 npm run dev
```

## Security Notes

- Never commit `.env` to Git
- Never commit `seedUsers.ts` to Git
- Never commit the database file (`dev.db`) to Git
- Use strong passwords for `ADMIN_SECRET` and `CRON_SECRET`
- Keep your Cloudflare tunnel credentials secure
- Consider adding rate limiting to the admin endpoint

## Contributing

This is a personal project, but feel free to fork and adapt for your own use!

## License

MIT License - feel free to use and modify as needed.

## Acknowledgments

- [Moxfield](https://moxfield.com) for providing collection hosting
- [Scryfall](https://scryfall.com) for card images and data
