# Recipe Ledger

Recipe Ledger is a self-hosted recipe collection with a review queue. A Python scraper imports recipes from configured feeds and blogs; the web app lets you review them and search by ingredients or nutrition.

I built it to collect recipes I wanted to cook and keep useful nutrition information alongside them. The app uses Next.js and PostgreSQL, with Prisma for database access.

## What it does

The collection supports saved recipes, tags, and protein/fiber filters. Imported recipes keep a link to their source. Nutrition comes from the source when available, with optional USDA-based estimates when it is missing. Estimates depend on ingredient matching and serving sizes.

Authentication uses locally configured users and signed session cookies. This is a small trusted-user application; it does not provide public account registration or a complete internet-facing identity system.

## Local setup

Requires Python 3 and Docker Compose.

```bash
git clone https://github.com/swagsystems/recipe-ledger.git
cd recipe-ledger
python3 scripts/init_demo.py
docker compose up --build
```

Open `http://localhost:8093`. The generated `.env` contains the demo username and PIN under `RECIPE_TRACKER_USERS`; it also holds unique database and session secrets. The setup script leaves existing configuration intact. PostgreSQL data lives in the `recipe-data` volume. The web port binds to loopback.

The initial seed adds recipe sources and tags, without fetching recipes. A scraper pass is explicit:

```bash
docker compose --profile scrape run --rm scraper
```

An optional `USDA_API_KEY` enables nutrition lookup. Review source permissions and request volume before enabling scheduled collection. Recipe text and images retain their original owners' rights.

## Development

```bash
cd app
npm ci
npm run build
```

Database setup uses `prisma db push` and stops if a schema change would lose data. The container does not accept destructive schema changes automatically. Existing installations need a reviewed migration process.

## Limits

The default setup is for local use. Shared public hosting needs additional access controls and login throttling. Set `RECIPE_COOKIE_SECURE=true` in the app environment when serving through HTTPS. Sessions use a shared signing secret; rotating it signs out existing sessions.

Private deployment configuration and collected user data are excluded. The application source is licensed under [MIT](LICENSE).
