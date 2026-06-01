#!/bin/bash

echo "🔄 Updating TableTally..."

# Stop the application
echo "⏸️  Stopping application..."
pm2 stop tabletally

# Pull latest changes
echo "📥 Pulling latest code..."
git pull origin main

# Install any new dependencies
echo "📦 Installing dependencies..."
npm install

# Run any new database migrations
echo "🗄️  Running migrations..."
npx prisma migrate deploy
npx prisma generate

# Rebuild the application
echo "🔨 Building application..."
npm run build

# Restart the application
echo "▶️  Restarting application..."
pm2 restart tabletally

echo "✅ Update complete!"
pm2 status