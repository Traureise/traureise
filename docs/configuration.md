# Configuration

All settings are environment variables. `docker-compose.yml` reads them from `.env`; start from
`.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Public URL of the instance, used in login and share links. If it starts with `https://`, the session cookie is marked `Secure`. |
| `APP_PORT` | `3000` | Host port the app is published on. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `traureise` / – / `traureise` | Credentials for the bundled PostgreSQL. The app's `DATABASE_URL` is built from these. |
| `POSTGRES_PORT` | `5432` | Host port for PostgreSQL, bound to `127.0.0.1` only (used by the integration tests). |
| `SMTP_HOST` / `SMTP_PORT` | `mailpit` / `1025` | SMTP server for login emails. See [Email](email.md). |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (usually port 465). With `false`, STARTTLS is used when the server offers it. |
| `SMTP_USER` / `SMTP_PASSWORD` | empty | SMTP credentials. Leave empty for servers without authentication. |
| `MAIL_FROM` | `Traureise <no-reply@traureise.localhost>` | Sender of login emails. |
| `STORAGE_DRIVER` | `local` | `local` (Docker volume) or `s3`. See [File storage](storage.md). |
| `STORAGE_LOCAL_DIR` | `/data/uploads` | Upload directory inside the container, backed by the `uploads` volume. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | empty, `true` | S3 settings when `STORAGE_DRIVER=s3`. |
| `THEMES_DIR` | `./themes` | Directory with theme packages. See [Themes](themes.md). |
| `MAILPIT_UI_PORT` / `MAILPIT_SMTP_PORT` | `8025` / `1025` | Host ports of the bundled Mailpit, bound to `127.0.0.1`. |

Empty values count as "not set", so unused lines from `.env.example` can stay in place.
