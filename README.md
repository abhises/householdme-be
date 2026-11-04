# householdme-be

REST API for HouseholdMe: Node, Express 5, TypeScript, Prisma 7 and PostgreSQL (Docker).
It serves the public site content, the admin panel's CRUD endpoints and media uploads.
Uploads are stored on local disk for now and can be switched to S3 with one env var.

The frontend lives in `../householdme-fe`.

## Quick start

```bash
cp .env.example .env              # then set AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:up                     # Postgres 17 in Docker on localhost:5436
npm run db:deploy                 # apply migrations
npm run db:seed                   # content from the HouseholdMe design + admin user
npm run dev                       # http://localhost:4100
```

Admin login after seeding: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`
(defaults `admin@householdme.com` / `admin12345`). Change it under **Admin → Account**.

| Script | What it does |
| --- | --- |
| `npm run dev` | API with reload (tsx watch) |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run db:up` / `db:down` | Start / stop the Postgres container |
| `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Upsert seed content (safe to re-run) |
| `npm run db:reset` | Drop, re-migrate and re-seed the database |
| `npm run extract:design` | Re-extract `prisma/seed-data.json` from `../HouseholdMe/Householdme v2.dc.html` |

## Project layout

```
prisma/
  schema.prisma        content model (guides, products, authors, categories, deals, info pages, media, settings)
  seed.ts              loads seed-data.json and creates the admin user
  seed-data.json       content extracted from the design file
scripts/extract-design.mjs
src/
  server.ts, app.ts    Express setup (helmet, CORS, cookies, logging, /uploads static)
  config/env.ts        validated environment variables
  routes/public.ts     /api/public/*  read-only site API + subscribe + feedback
  routes/auth.ts       /api/auth/*    login, logout, me, change password
  routes/admin/        /api/admin/*   CRUD for every resource, media, settings, stats
  storage/             StorageDriver interface with local and S3 implementations
  schemas/content.ts   zod validation for all writes
  lib/settings.ts      site/home/method settings with defaults
```

## API overview

Public (no auth): `GET /api/public/layout | home | categories/:slug | guides/:slug | products/:slug | authors/:slug | team | method | info/:slug | deals | search?q=`,
`POST /api/public/subscribe`, `POST /api/public/products/:slug/feedback`.

Auth: `POST /api/auth/login` sets an httpOnly `hm_admin` JWT cookie (7 days). A `Authorization: Bearer <jwt>` header also works.

Admin (requires session): `categories`, `authors`, `guides`, `products`, `deals`, `info-pages` each support
`GET /` (`?q=` search, filters such as `?guideId=`), `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id` and `DELETE /:id`.
Also `GET /stats`, `GET|DELETE /subscribers`, `GET /subscribers/export.csv`, `GET /settings`, `PUT /settings/:key`
(`site`, `home`, `method`), `GET|POST|DELETE /media` (multipart field `files`, max 15 MB each).

## Storage: local now, S3 later

`STORAGE_DRIVER=local` writes files to `LOCAL_UPLOAD_DIR` (default `./storage/uploads`) and serves them at
`/uploads/*`. Saved URLs start with `PUBLIC_API_URL`. Set `PUBLIC_API_URL=""` to save relative `/uploads/...`
URLs, which the frontend proxies.

To move to S3 (or R2, MinIO or Spaces), set:

```env
STORAGE_DRIVER="s3"
S3_REGION="us-east-1"
S3_BUCKET="householdme-media"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_PUBLIC_URL="https://cdn.example.com"   # optional CDN or CloudFront base
S3_ENDPOINT=""                             # for S3-compatible providers
S3_FORCE_PATH_STYLE="false"                # "true" for MinIO
```

Objects must be publicly readable through a bucket policy or CDN. Files uploaded before the switch keep their
local URLs, so copy `storage/uploads/` to the bucket under the same keys and update the URLs if you migrate.
To add another backend, implement `StorageDriver` in `src/storage/` and register it in `src/storage/index.ts`.
