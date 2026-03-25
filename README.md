# eBee

eBee is a chat-first conversational commerce prototype for groceries, food, fruits, and Odisha rental rides.

This repo is the current product prototype with:
- a responsive glass-style interface
- Zippy, the eBee mascot, in the assistant flow
- grocery, food, fruit, cooking-assist, and ride booking conversations
- mixed-service cart grouping
- order history with expandable receipt detail
- GitHub-ready static hosting support

## Live Prototype

This project can be hosted for free on GitHub Pages because the frontend is static.

Important:
- GitHub Pages will host the UI for free
- `server.js` does not run on GitHub Pages
- `/api/recipe` and `/api/assist` are optional enhancement routes, so the prototype still works with local fallbacks when those endpoints are missing

## Project Structure

- `index.html` - app shell
- `styles.css` - visual system, responsiveness, motion, and layout
- `app.js` - frontend bootstrap
- `modules/state.js` - shared session and order state
- `modules/data.js` - local catalog, ride zones, and fallback recipe data
- `modules/utils.js` - parsing helpers, classification helpers, fallback personality logic
- `modules/services.js` - optional API integrations for response polish and recipe lookup
- `modules/ui.js` - chat rendering, summary rendering, and history display
- `modules/logic.js` - orchestration for grocery, food, fruits, cooking, payment, and rides
- `server.js` - lightweight local static server with optional API endpoints
- `eBee_Detailed_Developer_Playbook.md` - detailed product and engineering playbook

## Features

- Chat-first ordering instead of dashboard-style flows
- Grocery, food, fruits, and ride support in one assistant
- Raw-vs-cooked intent handling for terms like `pork`, `pork chop`, `mutton curry`, `chicken biryani`
- Mixed cart grouping such as `Food Items` and `Grocery Items`
- Service-aware order history with expandable receipt view
- Zippy personality layer with absurd-request handling
- Responsive layout for desktop, tablet, and mobile
- Sticky premium header with smooth shrink-on-scroll behavior

## Run Locally

Use Node.js:

```powershell
node server.js
```

Then open:

```text
http://localhost:3000
```

## Free Hosting On GitHub

Yes, you can host this project on GitHub itself for free using GitHub Pages.

This repo now includes a Pages workflow:
- `.github/workflows/pages.yml`

How it works:
- every push to `main` deploys the static prototype
- GitHub Pages serves `index.html`, `styles.css`, `app.js`, `modules/`, and image assets

What to expect on Pages:
- the main prototype UI works
- local fallback logic still works
- optional server-side helpers from `server.js` will not run there

## Enable GitHub Pages

1. Open the repository settings.
2. Go to `Pages`.
3. Under `Build and deployment`, choose `GitHub Actions`.
4. Pushes to `main` will deploy automatically.

Your repo:

- `https://github.com/BishalDomain/ebee-prototype`

Your Pages URL will usually become:

- `https://bishaldomain.github.io/ebee-prototype/`

## Product Direction

This prototype is moving toward:
- one assistant shell
- multiple service buckets
- separate backend order drafts per service
- eventual admin-side fulfillment for mixed-domain requests

Example future path:
- one user message
- multiple detected services
- separate grocery and food orders created in backend
- one unified customer experience

## Known Prototype Limits

- no real database or auth yet
- no real payment gateway integration yet
- no live admin system yet
- ride flow is still simulated
- GitHub Pages deployment is UI-only, not full backend hosting

## Next Best Upgrades

1. Replace mock catalog and ride data with real APIs.
2. Create real multi-order backend orchestration.
3. Add real payment flow and order persistence.
4. Add admin operations and fulfillment dashboard.
5. Add Vercel or backend deployment for full live behavior beyond static Pages hosting.
