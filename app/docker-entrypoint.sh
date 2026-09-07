#!/bin/sh
set -eu

npx prisma db push
node prisma/seed.mjs

exec "$@"
