# Backups and restore

Everything worth backing up is in two places: the PostgreSQL database and the uploaded images.

## Back up

```bash
# Database
docker compose exec -T postgres pg_dump -U traureise -Fc traureise > traureise-$(date +%F).dump

# Uploads (local storage)
docker run --rm -v traureise_uploads:/data -v "$PWD":/backup debian:bookworm-slim \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

## Restore

```bash
docker compose exec -T postgres pg_restore -U traureise -d traureise --clean --if-exists < traureise-2026-10-18.dump
docker run --rm -v traureise_uploads:/data -v "$PWD":/backup debian:bookworm-slim \
  tar xzf /backup/uploads-2026-10-18.tar.gz -C /data
```

With S3 storage, back up the bucket with your provider's tools (for example versioning or replication).

!!! note "Backups contain personal data"
    Couples' names, email addresses and photos are in these files. Keep backups encrypted and
    delete them on the same schedule you promise in your privacy policy.
