# SplitPro upstream preview

This Compose project runs the merged upstream preview at
`https://prodesk.tail960ba6.ts.net/splitprointegration`. It uses a separate
PostgreSQL database and uploads volume. The database and uploads are initialized
from one production snapshot; later preview writes stay in these preview-owned
resources.

## Configure the server

1. Check out the `staging` branch in a dedicated directory. Do not
   use `/home/junxu/split-pro`, which is the production checkout.
2. In `docker/preview`, copy `.env.example` to `.env`. Set new preview-only
   database credentials and a new `NEXTAUTH_SECRET`, then set `GOOGLE_CLIENT_ID`
   and `GOOGLE_CLIENT_SECRET` to the existing production OAuth client values.
   Use URL-safe random values such as `openssl rand -hex 32` for the database
   password, and set file permissions to `600`.
3. In that Google OAuth client's authorized redirect URIs, keep the production
   callback and add:

   `https://prodesk.tail960ba6.ts.net/splitprointegration/api/auth/callback/google`

   The callback uses the same host and Google client, with the preview path. The
   Google client requires this exact additional redirect URI.

4. Confirm the production containers are named `splitpro-db` and `splitpro`, or
   pass `SOURCE_DB_CONTAINER` and `SOURCE_APP_CONTAINER` when running the restore.

## Restore once and start the preview

After the one-time preview setup, pushes to `staging` deploy this stack
automatically through GitHub Actions. The workflow keeps the preview checkout
separate from the production checkout at `/home/junxu/split-pro`.

Run from the checked-out branch on `prodesk`:

```sh
CONFIRM_PREVIEW_RESTORE=yes bash scripts/preview/restore-and-prepare.sh
```

The script streams `pg_dump` directly from the production database container to
the preview database container; it does not create a dump file. It pauses
`pg_cron` during the restore, then disables copied jobs before resuming it. It
removes copied sessions, verification tokens, push subscriptions, bank access
IDs and cache data, and OAuth tokens. It preserves
user/provider identity mappings and SplitPro's product records. Production
uploads are copied directly into the preview uploads volume. The app is started
only after the copy is sanitized, so its migrations run only against the preview
database.

The restore replaces data in the preview database and requires the explicit
`CONFIRM_PREVIEW_RESTORE=yes` guard. Do not repeat it after test data has been
created unless you intend to reset the preview copy.

## Route and smoke checks

The app listens only on `127.0.0.1:3001`; PostgreSQL has no published port. After
the local health check succeeds, add only the Tailscale Funnel path route
`/splitprointegration` to `http://127.0.0.1:3001`. Preserve the current `/`,
`/parkcast`, and `/parkcastsit` targets.

Verify the landing page, page assets, `/splitprointegration/api/healthz`, Google
sign-in, the callback, a preview-only expense write, and sign-out. Confirm the
root application still signs in with its existing session and that its data is
unchanged.

## Roll back

Remove only the `/splitprointegration` Funnel route and stop the preview stack:

```sh
docker compose --env-file docker/preview/.env -f docker/preview/compose.yml down
```

This leaves the production Compose project, database, uploads, and existing
Funnel routes untouched. To retain the test copy for later, do not add `-v` to
the `down` command.
