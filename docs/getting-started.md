# Quick start

## Requirements

- Docker with Compose v2
- About 1 GB of free RAM for the app, PostgreSQL and Mailpit

## Start the stack

```bash
git clone https://github.com/Traureise/traureise.git
cd traureise
cp .env.example .env        # then set POSTGRES_PASSWORD
docker compose up -d --build
```

`docker-compose.yml` starts three services:

| Service | Purpose | Address |
|---|---|---|
| `app` | Traureise itself | <http://localhost:3000> |
| `postgres` | PostgreSQL 17, data in the `pgdata` volume | `127.0.0.1:5432` (host only) |
| `mailpit` | Catches outgoing email for testing | <http://localhost:8025> (host only) |

Database migrations run automatically every time the app container starts.

## First login

1. Open <http://localhost:3000> and choose **Jetzt anmelden**.
2. Enter any email address. Traureise sends a login link; with the default settings it lands in
   Mailpit at <http://localhost:8025>.
3. Open the link. On the first login Traureise asks for your first name, then shows the dashboard.
4. **Erstellen → Hochzeitswebsite** creates your first website and opens the editor.

The link is valid for 15 minutes and works once.

## Next steps

- Put Traureise behind HTTPS: [Reverse proxy and HTTPS](reverse-proxy.md).
- Send real emails: [Email (SMTP)](email.md).
- Store photos in S3-compatible object storage: [File storage](storage.md).
- Set up [backups](backups.md).

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations run on start. Back up the database first (see [Backups](backups.md)).
