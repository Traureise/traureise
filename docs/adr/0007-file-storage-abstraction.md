---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# File storage behind a port, with local-disk and S3 adapters

## Context and Problem Statement

Couples upload cover photos, gallery images and portraits. Self-hosters want files on a Docker volume; the
SaaS may prefer EU object storage. Photos often carry EXIF GPS data.

## Considered Options

* A `FileStorage` port with local-disk (default) and S3-compatible adapters; the app serves every file
* Store images in PostgreSQL
* Upload directly to a bucket and link to it publicly

## Decision Outcome

Chosen option: "A `FileStorage` port with local and S3 adapters; the app serves every file", because use
cases stay storage-agnostic, both deployment styles are covered by configuration, and guests' browsers only
ever talk to the instance (ADR 0005).

* Every upload is validated (type, size up to 10 MB) and re-encoded to WebP at 2400 px at most with sharp.
  This removes EXIF/XMP metadata.
* Keys are random. Ownership is tracked in an `uploads` table, so items can only reference images of
  their own website. Replaced or deleted images are removed from storage.

### Consequences

* Good, because the bucket can stay private.
* Bad, because the app serves all image traffic itself. Responses can be cached indefinitely, so a caching
  proxy in front of the app helps.
