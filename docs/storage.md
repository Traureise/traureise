# File storage

Couples upload a cover photo, gallery images, portraits and event pictures.

## What happens to an upload

- Accepted: JPEG, PNG, WebP, GIF or AVIF, up to 10 MB. The browser checks this before uploading, and the
  server checks it again.
- Every image is re-encoded to WebP, at most 2400 px on the long edge. This removes EXIF, XMP and
  other metadata such as GPS positions.
- Files get random names and are served by the app itself under `/uploads/<key>`; nothing links to a
  storage host directly. Replaced and deleted images are removed from storage.

## Local storage (default)

`STORAGE_DRIVER=local` keeps files in the `uploads` Docker volume, mounted at `/data/uploads`. Back it
up together with the database (see [Backups](backups.md)).

## S3-compatible object storage

Any S3-compatible service works, for example an EU-hosted provider.

1. Create a **private** bucket. The app serves the files, so the bucket never needs public access.
2. Create access keys limited to that bucket.
3. Configure:

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.example.eu
S3_REGION=eu-central-1
S3_BUCKET=traureise-uploads
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_FORCE_PATH_STYLE=true   # most non-AWS providers need this
```

Because the app serves every image, responses carry long cache lifetimes (the keys never change); a
caching reverse proxy in front of Traureise takes most of that traffic.
