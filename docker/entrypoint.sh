#!/bin/sh
set -e
node dist/migrate.mjs
exec node server.js
