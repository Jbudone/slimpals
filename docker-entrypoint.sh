#!/bin/sh
set -e

echo "Running database migrations..."
npm run db:migrate

echo "Starting server..."
exec node dist/server/server/index.js
