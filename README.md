# OTL Woodwork — Public Site & Gallery

The public-facing site for OTL Woodwork: a landing page with a filterable
photo gallery, plus a password-protected admin page where you upload the
photos. Separate project from `otl-quotes`, so it gets its own URL and can
take a custom domain like `otlwoodwork.com`.

| Path | What it is | Who can see it |
|---|---|---|
| `/` | Landing page — hero, what you build, gallery, process, contact | Public |
| `/admin` | Upload and delete gallery photos | Password |

---

## Deploying it the first time

### 1. Put the code on GitHub

From inside this folder:

```bash
git init                     # (skip if it's already a repo)
git add -A
git commit -m "OTL Woodwork public site"
```

Then create a new **empty** repo on github.com named `otl-woodwork`
(no README, no .gitignore — this folder already has them), and:

```bash
git remote add origin https://github.com/olleeoli/otl-woodwork.git
git branch -M main
git push -u origin main
```

### 2. Create the Vercel project

1. vercel.com → **Add New… → Project**
2. Import `olleeoli/otl-woodwork`
3. Leave every build setting on the default — Vercel detects Next.js
4. Click **Deploy**

The first deploy will succeed but the gallery won't work yet — storage and
the password come next. You'll get a URL like `otl-woodwork.vercel.app`.

### 3. Add photo storage (Vercel Blob)

In the new project: **Storage → Create Database → Blob → Connect**.

This adds a `BLOB_READ_WRITE_TOKEN` environment variable automatically. You
don't set it by hand.

### 4. Add the database (Redis)

The gallery keeps titles and categories in Redis. Two options:

**Option A — reuse the store your quote system already uses (recommended).**
In **Storage**, find the existing Upstash store and connect it to this
project too. Nothing collides: this project only reads and writes keys that
start with `gallery:`, and the quote system only touches `quote:` keys.

**Option B — create a fresh one.** Storage → Create Database → pick the
Upstash Redis option → Connect.

Either way Vercel injects the connection variables automatically. The code
accepts either naming convention (`KV_REST_API_*` or `UPSTASH_REDIS_REST_*`),
so you don't have to care which one shows up.

### 5. Set your admin password

**Settings → Environment Variables → Add:**

| Name | Value |
|---|---|
| `ADMIN_KEY` | whatever password you want for `/admin` |

Apply it to Production, Preview, and Development.

> This is the only variable you set by hand. If you skip it, the admin page
> will tell you so instead of just rejecting your password.

### 6. Redeploy

**Deployments → the latest one → ⋯ → Redeploy.** Environment variables only
take effect on a fresh build.

### 7. Try it

1. Go to `your-url.vercel.app/admin`
2. Sign in with your `ADMIN_KEY`
3. Drop in a photo, give it a title and category, hit **Add to Gallery**
4. Click **View site** — it's already there

---

## Adding a custom domain later

When you're ready to put `otlwoodwork.com` on this:

1. Vercel → this project → **Settings → Domains → Add**
2. Enter `otlwoodwork.com` (add `www.otlwoodwork.com` too — Vercel will offer
   to redirect one to the other)
3. Vercel shows you the DNS records to create. At your domain registrar, add
   them exactly as shown — usually an `A` record for the root and a `CNAME`
   for `www`
4. Wait for it to verify (minutes to a couple of hours)

HTTPS is issued automatically. Nothing in the code needs to change — the
site has no hardcoded URLs.

---

## Changing the site's words

Almost all the copy lives in **`site.config.ts`** — business name, email,
phone, the hero headline, the four "What I build" cards, the process steps,
and the contact text. Edit that one file, commit, push, and Vercel redeploys
in about a minute.

Fields left as empty strings (`phone`, `instagram`, `location`) simply don't
render, so fill in the ones you want and leave the rest alone.

## Changing the categories

Edit `GALLERY_CATEGORIES` in **`types/gallery.ts`**. That list drives both
the dropdown in the admin form and the filter chips on the site. You can also
pick "Other" while uploading and type a one-off category without touching
code.

## Changing the colors

Every color is a CSS variable at the top of **`app/globals.css`**, in the
`:root` block. Change them there and the whole site follows — nothing else
hardcodes a color.

## Everyday updates

```bash
git add -A && git commit -m "what changed" && git push
```

Vercel redeploys automatically in about a minute.

---

## Notes

- **Photo limits:** 10MB each; JPG, PNG, WEBP, GIF.
- **Deleting is permanent.** It removes the database record *and* the image
  file from Blob storage. There's a confirmation prompt first.
- **New photos appear immediately.** Uploading or deleting purges the
  homepage cache, so you don't wait on the 60-second refresh window.
- **The admin page is excluded from search engines** via `app/robots.ts`.
- **Your password lives only in the browser tab.** Closing the tab signs you
  out. It's never written to disk.

## Tech

Next.js 16 (App Router) · Vercel Blob for images · Upstash Redis for
metadata · deployed on Vercel.
