# Earth Postcards

Capture any place on Earth from orbit and keep it as a postcard. Spin a 3D globe, describe where you want to go ("somewhere with turquoise water"), and GPT Image 2.5 turns the real NASA satellite view into a collectible postcard with a rarity, an AI-written note on the back and a spot on your globe.

**Try it:** <https://earth-postcards.vercel.app>

Built at the [DevDay Exchange London community hackathon](https://luma.com/dde-ldn-hack), 1 November 2026, with Codex.

## The journey

1. **Spin the globe.** Your saved postcards float over their real locations, linked by arcs.
2. **Choose a place.** Type a description and an OpenAI model picks a real place with function calling, or search by name, or press **Surprise me**. The globe flies there.
3. **See it from orbit.** The panel shows the real NASA Landsat image of the spot.
4. **Capture.** Pick a style (Travel poster, Watercolour, Blueprint, Mission patch, Woodblock print) and press **Capture**. GPT Image 2.5 restyles the satellite image while keeping its real geography.
5. **The reveal.** The card arrives as common, rare or legendary. Tilt it for a foil sheen, drag the slider to compare it with the view from orbit, and **Turn over** for the AI-written note and postmark.
6. **Collect.** The postcard is saved and pinned to your globe, and you earn XP. The **DevDay tour** mode lets you collect a stamp for each DevDay Exchange and community hackathon city.

## Run locally

Requirements: Node.js 20 or newer and an OpenAI API key with access to GPT Image models (GPT Image may need organisation verification and API billing). No npm dependencies or build step.

```sh
cp .env.example .env
# Add OPENAI_API_KEY to .env. Never commit this file.
npm run dev
```

Open <http://localhost:8787>. The key is read only by the server and never sent to the browser. Restart `npm run dev` after changing `.env`.

## Deploy to Vercel

The `api/` folder holds one serverless function per route (`search`, `satellite`, `postcard`, `where`), sharing `lib/api-core.mjs`. `vercel.json` gives the image and place-finder routes 60 seconds. `public/` is served as static files.

1. Import the repo into Vercel (no build command needed).
2. In **Settings → Environment Variables**, add `OPENAI_API_KEY` (as a Secret) and optionally `IMAGE_MODEL`, for Production, Preview and Development.
3. Redeploy.

`server/index.mjs` is kept for local development and serves the same routes.

## What it uses

- **OpenAI Image API**, [`POST /v1/images/edits`](https://developers.openai.com/api/reference/resources/images/methods/edit). `IMAGE_MODEL` defaults to [`gpt-image-2.5-flare`](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) for speed; set `gpt-image-2.5-sunburst` for higher-quality edits. Output is 1536×1024 artwork with no text or border, so it lines up with the satellite image in the before/after slider.
- **OpenAI Responses API** for the postcard caption and note (JSON), and for `/api/where`, which forces a single `fly_to(name, lat, lng, reason)` function call and validates the coordinates.
- **Rarity:** rolled on the server, common 50%, rare 35%, legendary 15%.
- **NASA GIBS** WMS layer `Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual`, a clear Landsat composite. The latest global annual image is from 2000, and the app labels it as such.
- **OpenStreetMap Nominatim** for place search: explicit searches only, cached and spaced at least one second apart.
- **globe.gl 2.46.2** and **three-globe 2.45.5** (loaded from jsDelivr) for the 3D globe, with three-globe's NASA-derived Earth textures.
- Vanilla browser JavaScript and a built-in Node HTTP server. Saved postcards live in the browser's localStorage.

## How Codex helped

See [CODEX_NOTES.md](CODEX_NOTES.md) for the full log. Highlights: Codex checked the current OpenAI docs to confirm the GPT Image 2.5 model IDs and the function-calling shape; tested NASA's recent VIIRS layer, found it too cloudy for a good postcard and switched to the Landsat composite; dropped a React/Vite scaffold for a zero-dependency server when package installs were too slow at the venue; and built the globe, reveal card and DevDay tour.

## Credits and attribution

- NASA GIBS imagery: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)." [GIBS API documentation](https://nasa-gibs.github.io/gibs-api-docs/).
- Place names: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [Open Database License](https://opendatacommons.org/licenses/odbl/). Public Nominatim [usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- 3D globe: [globe.gl](https://github.com/vasturiano/globe.gl) and [three-globe](https://github.com/vasturiano/three-globe) by Vasco Asturiano (MIT licence), including their example Earth textures.
- Image and text generation: [OpenAI API](https://developers.openai.com/api/docs/guides/image-generation). Generated postcards can change details, so don't treat them as factual maps.
- Fonts: Unbounded, Sora and Caveat from [Google Fonts](https://fonts.google.com/).
- DevDay tour dates: [DevDay Exchange 2026](https://events.openai.com/devdayexchange2026) and the Codex community event pages.
- UI concepts were explored with Claude; the app was built with Codex during the hackathon.

## Known limits

- The Landsat imagery is a 2000 composite, not a current view, and is sparse over oceans and the poles.
- The public Nominatim service is fine for a small demo, not for heavy public traffic.
- Image generation needs an OpenAI key with billing. Errors are shown in the app.
- Postcards are saved only in your browser; download the PNG to keep one elsewhere.
