# Earth Postcards

Turn a place you love into a little postcard from orbit. Search a place, choose a print style, and create a downloadable postcard from real Landsat imagery with an AI-written caption.

## Run locally

Requirements: Node.js 20 or newer and an OpenAI API key with access to GPT Image models. GPT Image may require organization verification and API billing. The app has no npm dependencies.

```sh
cp .env.example .env
# Add your key to .env; never commit this file.
npm run dev
```

Open <http://localhost:8787>. A small Node.js server serves the static web app and handles the API routes using built-in Node features. The OpenAI key is read only by the server and never sent to the browser. To produce a postcard, select a place, wait for the satellite preview, choose a style, then click **Make my postcard**. Download the finished PNG from the preview. Restart `npm run dev` after changing `.env` so the server loads the key.

## What it uses

- Vanilla browser JavaScript and a built-in Node HTTP server; no build step or npm dependencies.
- NASA Global Imagery Browse Services (GIBS) WMS `Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual` for a clear annual Landsat composite. The latest global annual image exposed by the catalog is the 2000 composite. The public service requires no API key; NASA asks clients to acknowledge its imagery. The app labels the image as a historical 2000 composite. It is not a current image or street-level basemap; some ocean and polar locations may have little or no land imagery.
- OpenStreetMap Nominatim for on-demand place lookup. Searches are explicit (no autocomplete), cached in memory, and spaced by at least one second. This public community service has limited capacity; follow its current usage policy and replace it with another provider if the app grows.
- OpenAI Image API [`POST /v1/images/edits`](https://developers.openai.com/api/reference/resources/images/methods/edit), model [`gpt-image-2.5-sunburst`](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), to restyle the fetched satellite image, plus Responses API `gpt-6-luna` for a short caption.

## Credits and attribution

- NASA GIBS imagery: “We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).” Source: [GIBS API documentation](https://nasa-gibs.github.io/gibs-api-docs/).
- Place names/geocoding: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), data available under the [Open Database License](https://opendatacommons.org/licenses/odbl/). Public Nominatim [usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- Image API: [OpenAI Image generation and editing documentation](https://developers.openai.com/api/docs/guides/image-generation). GPT Image edits are generated outputs and can change details; check the result before sharing as a factual map.
- Typography: DM Sans, DM Mono, and Playfair Display are loaded from [Google Fonts](https://fonts.google.com/); Google Fonts states its font collection uses open-source licenses. The page has local system-font fallbacks.
- App code: created for the DevDay Exchange Community Hackathon with Codex. No third-party UI template or stock imagery is included.
- Hackathon: [DevDay Exchange London community hackathon](https://luma.com/dde-ldn-hack). Codex workflow references: [Codex docs](https://developers.openai.com/codex), [quickstart](https://developers.openai.com/codex/quickstart), and [Cookbook example](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex).

## Submission demo (target: 60–75 seconds)

1. (0–8s) “Earth Postcards turns places you love into tiny keepsakes from orbit.” Show the empty canvas.
2. (8–20s) Search for a recognizable place and select a result. Show the NASA Landsat image and its clearly labeled 2000 composite date.
3. (20–28s) Pick a style and start generation. Keep the progress state visible briefly.
4. (28–47s) Reveal the finished poster and read the caption. Show the download action and, if practical, the saved postcard.
5. (47–60s) Briefly show the server route using `gpt-image-2.5-sunburst`, the live product journey, and README setup. Mention that Codex helped verify the current model/endpoint docs, design the smallest complete flow, and implement the key-safe API boundary.

Keep API keys, `.env`, personal data, and private dashboard/browser tabs out of the recording. Record the actual working app once a key is configured; do not use a mock generation in the submitted demo.

## Known limits

- Public demo traffic is not appropriate for the shared Nominatim service without additional controls/provider approval. The app is designed for a small, user-triggered hackathon demo.
- NASA Landsat WELD is a historical 2000 annual composite, not a recent observation. Coverage is land-focused and may be sparse over oceans and polar areas.
- Image generation needs an OpenAI API key, billing, and possibly organization verification. The app reports generation failures in the UI.
- There is no account system or persistent image storage. Download the PNG to keep it.
