#!/bin/sh
set -eu

if [ "${RUN_ONCE:-0}" = "1" ]; then
  exec python -m recipe_tracker.scrape
fi

printenv | sed 's/^\(.*\)$/export \1/g' > /etc/recipe-tracker-env
cat >/etc/cron.d/recipe-tracker <<'EOF'
SHELL=/bin/sh
BASH_ENV=/etc/recipe-tracker-env
0 2 * * * root . /etc/recipe-tracker-env; cd /app && python -m recipe_tracker.scrape >> /proc/1/fd/1 2>> /proc/1/fd/2
EOF
chmod 0644 /etc/cron.d/recipe-tracker

echo "recipe-tracker scraper cron installed for 02:00 daily"
exec cron -f
