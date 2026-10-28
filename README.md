# Fine Looks Hair & Beauty — online store

Marketplace and inventory platform for Fine Looks Hair and Beauty Store, Garner, NC.
Built by Jatelo Technologies to the *Software Architecture & MVP Scope* (28 Oct 2026).

## What's inside

| Area | Where |
| --- | --- |
| Storefront (home, shop, categories, product, cart, checkout, order tracking, accounts, visit, policies) | `src/app/(store)` |
| Admin dashboard (orders, products, inventory, customers, discounts, integrations, alerts, staff, settings, audit log) | `src/app/admin` |
| Inventory engine — reservations, ledger, `available_to_sell = on_hand − reserved − safety_stock` | `src/server/inventory` |
| Checkout, Stripe, order state machine, refunds | `src/server/orders`, `src/server/payments` |
| Clover connector — OAuth, import, mapping, webhooks, two-way stock sync, reconciliation | `src/server/clover` |
| Durable webhook pipeline + worker (queues, schedules, retries, alerts) | `src/server/events.ts`, `src/worker` |
| Database schema and migrations (PostgreSQL, Drizzle) | `src/server/db/schema.ts`, `drizzle/` |
| Tests for the section 16 must-pass scenarios | `tests/` |

Stack: Next.js 16 (App Router, TypeScript), PostgreSQL, Redis + BullMQ, Stripe Checkout + Stripe Tax,
Clover REST API, S3-compatible storage, SMTP email.

## Run it locally

Needs Node 22+, PostgreSQL and (optionally) Redis.

```bash
cp .env.example .env          # fill DATABASE_URL, APP_URL, APP_ENCRYPTION_KEY
npm install
npm run db:migrate
npm run db:seed               # location, categories, starter shipping rates
npm run seed:demo             # optional demo catalog (staging only; --remove to delete)
npm run dev                   # website on http://localhost:3000
npm run worker                # second terminal, needs REDIS_URL
npm test                      # needs a disposable local database
```

## Deploying on Railway

One repository, two services, plus Postgres and Redis (all in **US East**):

1. **web** — start command `npm start`. Applies migrations and base data, then serves the site.
2. **worker** — same repo, variable `SERVICE_ROLE=worker`, start command `npm start`.

Both services get the variables in `.env.example`. Use Railway references for the databases
(`DATABASE_URL=${{Postgres.DATABASE_URL}}`, `REDIS_URL=${{Redis.REDIS_URL}}`) so traffic stays on the
private network — the databases need no public address.

After the first deploy:

1. Open `/admin/setup?token=<SETUP_TOKEN>`, create the owner, scan the QR code, save recovery codes.
   Then delete `SETUP_TOKEN`.
2. **Stripe** → Developers → Webhooks → add `https://<domain>/api/webhooks/stripe` with the events listed
   on Admin → Integrations. Put the signing secret in `STRIPE_WEBHOOK_SECRET`. Turn on Stripe Tax with the
   store's North Carolina registration.
3. **Clover** → developer dashboard: create the app (inventory + orders read/write), set the OAuth redirect to
   `https://<domain>/admin/clover/callback` and the webhook URL to `https://<domain>/api/webhooks/clover`.
   The verification code appears under Admin → Alerts. Then Admin → Integrations → Connect Clover, review
   the imported items and approve each link.
4. Settings → Store details: street address, ZIP and opening hours (needed for map, structured data and
   pickup tax). Settings → Policies: have the store's attorney review the templates.

## Decisions still needed from the store (section 18)

Opening hours and street address, shipping rates, returns/restocking rules, Stripe and Clover accounts,
staff list and roles, and the inventory authority policy (default here: Clover is the source of truth for
in-store stock, with a safety-stock buffer and stale-sync pause for online sales).
