# Canteen order intake site

A simple website where orders are entered directly (no WhatsApp needed) and
exported straight to your dispatch card Excel format for printing.

This is a standalone project - it doesn't talk to WhatsApp at all. If you
want the WhatsApp-reading version instead (or as well), that's the separate
`canteen-app` project.

## What it does

- **Order submission page** (`/`) - whoever is placing an order (site agent,
  or whoever takes the call/message) fills it in two possible ways:
  - **Paste mode**: paste the same style of text your team already uses
    ("Location, then brand, then Am/Pm quantities") and it's parsed
    automatically.
  - **Form mode**: pick a location, add line items from dropdowns - no
    typing format to get right.
- **Admin page** (`/admin.html`) - dispatch staff see everything submitted
  today, apply the "no order by cutoff = repeat yesterday" rule, and
  download the dispatch cards and datasheet as .xlsx files ready to print.

## Setup

```
npm install
node src/server.js
```

Then open:
- http://localhost:3000 - order submission (share this link with whoever
  places orders)
- http://localhost:3000/admin.html - dispatch admin view

No WhatsApp, no phone, no QR code - this only needs the server running
somewhere reachable by whoever's submitting orders (their phone or PC
browser).

## Deploying for free on Netlify

Netlify doesn't run a long-lived server like Render does - instead, the
two static pages (`public/index.html`, `public/admin.html`) are served
directly from Netlify's CDN (fast, no cold start at all), and the API
(`/api/...`) runs as a single serverless function that spins up per
request. That function has no persistent disk either - same as Render, it
needs an external database, so this still uses MongoDB Atlas (free
forever) to actually hold the order data. Netlify just runs the code.

### 1. Set up the free database (MongoDB Atlas)

Same steps as the Render instructions below - see "Set up the free
database" - do that first regardless of which host you pick.

### 2. Deploy the app (Netlify)

1. Push this code to a GitHub repository.
2. Go to https://app.netlify.com, sign up free, click **Add new site >
   Import an existing project**, and connect your repository.
3. Netlify should read `netlify.toml` automatically and fill in the build
   settings (publish directory `public`, functions directory
   `netlify/functions`). If asked, build command is `npm install`.
4. Before deploying, go to **Site configuration > Environment variables**
   and add:
   - `MONGODB_URI` = your Atlas connection string
5. Deploy. You'll get a URL like `https://your-site-name.netlify.app` -
   `/` for order submission, `/admin.html` for the dispatch view.

The API itself lives at `/.netlify/functions/api`, but you don't need to
think about that - `netlify.toml` redirects `/api/*` there automatically,
so the frontend code (and anything else you build against `/api/...`)
just works.

### Netlify's free tier limits worth knowing

- 125,000 function invocations/month and 100 hours of function runtime -
  miles more than this app will ever use at your scale.
- Functions have a 10-second execution limit on the free tier - fine for
  everything here (an order submission or a card export both run in well
  under a second), but worth knowing if you ever add something slow.
- No sleep/spin-down for the site itself (static pages are always
  instant); only a brief (typically well under a second) cold start on a
  function's first call after a quiet period - much less disruptive than
  Render's 30-60 second free-tier wake-up.

### Testing locally

Netlify's CLI (`npm install -g netlify-cli`, then `netlify dev`) runs the
whole setup - static pages plus functions - the same way it'll behave in
production, redirects included. Or, since the function is just a thin
wrapper around the same Express app, `node src/server.js` still works
for quick local testing without Netlify at all (see below).

## Deploying for free on Render (alternative)

If you'd rather run a normal always-on server instead of serverless
functions, Render is a solid free alternative - the tradeoff is a 30-60
second cold start after 15 minutes of inactivity (vs. Netlify's
near-instant one), against not having to think in "serverless function"
terms at all.

### 1. Set up the free database (MongoDB Atlas)

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free
   account (no credit card required for the free tier).
2. Create a free **M0 cluster** (follow the setup wizard - defaults are
   fine).
3. Under **Database Access**, create a database user with a username and
   password (save these).
4. Under **Network Access**, add `0.0.0.0/0` (allow access from anywhere)
   - Render's servers don't have a fixed IP, so this is required.
5. Click **Connect** on your cluster, choose **Drivers**, and copy the
   connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/
   ```
   Replace `<username>` and `<password>` with what you created in step 3.

### 2. Deploy the app (Render)

1. Push this code to a GitHub repository (Render deploys from Git).
2. Go to https://render.com, sign up free, click **New > Web Service**,
   and connect your repository.
3. Render should auto-detect Node.js. Confirm:
   - Build command: `npm install`
   - Start command: `node src/server.js`
   - Instance type: **Free**
4. Under **Environment Variables**, add:
   - `MONGODB_URI` = the connection string from step 1.5 above
5. Click **Create Web Service**. First deploy takes a couple of minutes.

You'll get a URL like `https://canteen-order-site.onrender.com` - that's
what you share with whoever submits orders (`/` for submission,
`/admin.html` for the dispatch view).

A `render.yaml` is included if you'd rather deploy via Render's Blueprint
feature (New > Blueprint, point it at this repo) - it sets everything
above except the `MONGODB_URI` value, which you still add manually since
it's a secret.

### Living with the free tier's cold starts

The service still spins down after 15 minutes of no traffic (that part's
unavoidable on free) and takes 30-60 seconds to wake up on the next
request - orders and dispatch data are safe either way now, but the first
person to open the site after a quiet spell will see a slow load. Two
options if that's annoying:
- Live with it - fine for a small internal tool with predictable morning
  order traffic.
- Ping `/api/health` every 10 minutes from a free uptime monitor (e.g.
  UptimeRobot) to keep it awake during your order window.

### Testing locally without setting up MongoDB yet

If you just want to try the app before setting up Atlas, run it with no
`MONGODB_URI` set and it falls back to in-memory storage (data resets
whenever you restart the server - fine for a demo, not for real use):
```
node src/server.js
```

## Files

- `src/parseOrder.js` - parses the "paste mode" free-text orders.
- `src/store.js` - daily order storage and the cutoff-default logic.
- `src/generateOutputs.js` - builds the cards and datasheet .xlsx files.
- `src/server.js` - the web server (API + serves the two pages).
- `netlify/functions/api.js` - wraps `src/server.js` as a Netlify Function.
- `netlify.toml` - Netlify build/redirect configuration.
- `render.yaml` - Render Blueprint configuration (if using Render instead).
- `public/index.html` - the order submission page.
- `public/admin.html` - the dispatch admin/export page.
- `loc_route.json` - which delivery route each location belongs to.

## Known gaps (same as the WhatsApp version)

- "Vital" and "Zimre Park" aren't assigned to a route yet in
  `loc_route.json` - add them once you tell me which route they're on.
- A few of your existing cards use custom combined labels ("DAD+SITE
  AGENT", "MSASA STEERS+PRO") that this doesn't generate automatically -
  tell me the rule and I'll encode it in `generateOutputs.js`.
