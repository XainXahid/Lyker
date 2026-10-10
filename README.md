# Lyker

Swipe-to-match home search for O‘ahu. Buyers set what they want, swipe right on homes they love and left on the rest. Every match goes to you as a lead in Follow Up Boss.

## What's in it

The buyer app (`/`)
- Preferences for buy or rent, price, beds, home type, neighborhood, must-haves, and fee simple only or leasehold included
- Swipe cards with real photos, a match score and an estimated monthly cost
- Full home profiles with Hawai‘i details: tenure, lease end year and years left, lease rent, fee purchase, maintenance fee and what it covers, property tax, flood zone, zoning, parking and land area
- A plain-English explainer on fee simple vs leasehold, plus a warning on leasehold homes about financing
- Sign-up after the first like, with contact consent, so each match reaches you

The agent dashboard (`/agent`)
- Every lead with their contact info, what they're looking for, and each home they liked or asked to see
- Showing requests are highlighted and can be filtered
- Shows whether each lead made it into Follow Up Boss, with a retry button

How leads reach Follow Up Boss
- Sign-up sends a **Registration** event with their search
- A right swipe sends a **Saved Property** event
- A Must See (star) sends a **Property Inquiry** event, the high-intent type, with the lease and fee details in the notes
- Everyone is tagged `Lyker`, and FUB matches repeat events to the same contact

## Run it on your Mac

You need Node 22.9 or newer (you have 26).

```bash
cd ~/lyker
cp .env.example .env      # then open .env and fill it in
npm start
```

Open http://localhost:4780 for the app and http://localhost:4780/agent for the dashboard.

## Connect Follow Up Boss

1. In Follow Up Boss, go to Admin, then API, and create an API key.
2. Paste it into `.env` as `FUB_API_KEY=...` yourself. Don't share it in chat or email.
3. Restart with `npm start`. The terminal will say "Follow Up Boss: connected".

Until a key is set, leads are saved on your Mac and sent automatically once the key is added.

## Put it online with Netlify

The `netlify/` folder holds the online version of the server. Leads are stored in Netlify Blobs, and Follow Up Boss works the same way.

```bash
cd ~/lyker
npx netlify-cli login           # opens Netlify in your browser to sign in
npx netlify-cli init            # create the site the first time
npx netlify-cli deploy --prod
```

Then in Netlify, go to Site configuration, then Environment variables, and add `AGENT_NAME`, `BROKERAGE`, `AGENT_PASSCODE`, `FUB_API_KEY` and `PUBLIC_URL` (your Netlify address). Deploy again so they take effect.

## Switching to the real MLS feed

Listings live in `data/listings.js`. Once HiCentral approves your IDX feed, replace that file with a loader that pulls from their RESO Web API and fills in the same fields (`price`, `beds`, `tenure`, `leaseExp`, `maintFee`, `floodZone` and so on). Nothing else in the app needs to change.

Before going public with MLS data, follow the IDX display rules: show the listing brokerage and the MLS disclaimer on every home, refresh on their schedule, and use the listing photos from the feed instead of the stock photos.

## Notes

- The homes are samples and the photos are free stock photos from Unsplash. The app says so on screen.
- The monthly estimate assumes 20% down at 6.5% for 30 years. Change `LOAN` at the top of `public/app.js`.
- Local leads are stored in `data/db/lyker.sqlite`. Delete that folder to start fresh.
