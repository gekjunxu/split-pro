# Upstream SplitPro Preview Design

## Goal

Deploy the current upstream `oss-apps/split-pro` main branch at
`https://prodesk.tail960ba6.ts.net/splitprointegration` so it can be compared with
the existing fork at `/`. The existing root deployment and its data must remain
available and unchanged.

## Selected architecture

- Pin the preview build to the upstream commit selected at deployment time and
  record that full SHA for comparison and rollback. Do not merge upstream into
  the fork's `main` branch.
- Build the upstream source in a separate checkout and run it as a separate
  Compose project on `prodesk`.
- Configure Next.js with the `/splitprointegration` base path at build time. Set
  the preview's public and internal auth URLs to that path, and ensure static
  assets, API routes, service worker requests, and auth cookies stay within the
  preview path.
- Give the preview its own app container, database container, database volume,
  uploads volume, Compose project name, port, and auth secret. Bind its host port
  to localhost and add only the `/splitprointegration` Tailscale Funnel route to
  that port. Do not alter the existing `/` or other Serve/Funnel routes.
- The existing deployment workflow points both `main` and `test` at
  `/home/junxu/split-pro`; do not use that workflow for the preview.

## Data copy and sanitation

- Make one point-in-time copy of the current production database into the
  preview database. Never configure both apps to use the same database, and do
  not refresh the preview copy automatically.
- Restore into the isolated database, sanitize it there, then apply upstream
  migrations only to that copy before starting the preview app. A failed restore
  or migration must not modify production.
- Replace user names and email addresses with synthetic values; clear profile
  images, bank/provider identifiers, auth accounts and tokens, sessions,
  verification tokens, push subscriptions, and cached bank data.
- Replace group, expense, card, and note text with generic labels; clear expense
  file references. Do not copy the production uploads volume.
- Preserve amounts, currencies, dates, split types, and relationships to retain
  realistic comparison behavior. This removes direct identifiers and free text,
  but the remaining transaction history is still sensitive financial data; the
  preview must continue to require authentication.

## Authentication and external integrations

- Use preview-specific auth settings and isolate the preview's auth cookie from
  the root app's cookie.
- Do not copy provider access/refresh tokens or payment/banking credentials, and
  disable preview email invitations, notifications, webhooks, and bank sync.
- The auth provider must accept the preview callback URL under
  `/splitprointegration/api/auth/...`. Do not change external identity-provider
  settings as part of deployment. If no already-configured provider accepts the
  preview callback, stop and ask for the required provider-side update or
  alternative login arrangement.

## Verification and rollback

- Build the pinned upstream source and confirm the preview page, static assets,
  API/auth endpoints, and sign-in flow work under the path prefix.
- Exercise a small read/write flow using only the preview database, then confirm
  the production root and its existing paths still respond normally.
- Record the upstream SHA, preview Compose project, route, and database snapshot
  timestamp. Rollback by removing only the preview Funnel route and stopping the
  preview Compose project; leave production containers, volumes, and routes
  untouched.

## Known boundary

The preview URL is reachable from the public internet because Tailscale Funnel
is enabled on this hostname. Application authentication remains required, and
the preview copy retains sensitive transaction values and dates even after
direct identifiers and free text are removed.
