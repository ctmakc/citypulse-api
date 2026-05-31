#!/bin/bash
set -e
echo "Starting CityPulse API..."
npx prisma db push
npx prisma db seed 2>/dev/null || echo "Seed already done"
node dist/main
