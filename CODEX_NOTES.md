# How Codex helped build Earth Postcards

This file is a concise, concrete account for the hackathon demo. Keep it accurate as work continues.

- Inspected the blank workspace and scoped the work to one journey: place search → real satellite preview → style selection → edited postcard + caption → download.
- Checked the current OpenAI image generation and edits documentation, model catalog, developer quickstart, Codex quickstart/docs, Cookbook workflow guidance, NASA GIBS API docs, Nominatim usage policy, and the event page before choosing APIs.
- Confirmed the edit model IDs are `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare`; chose Sunburst for preserving recognizable geography. The server uses `/v1/images/edits` and keeps `OPENAI_API_KEY` out of browser code.
- Tested NASA's recent VIIRS layer in the live UI and found it too coarse/cloudy for a strong postcard. Checked NASA GIBS GetCapabilities and switched to its clearer Landsat WELD 2000 annual true-color composite; the app labels that historical date and retains NASA attribution.
- Uses explicitly triggered, cached, rate-limited Nominatim lookup (with OpenStreetMap attribution and no autocomplete).
- Started with a conventional React/Vite/Express scaffold, then simplified to a zero-dependency Node HTTP server and vanilla browser JavaScript when native package downloads proved too slow in the hackathon environment. The final architecture keeps the same key-safe API boundary and avoids a build step. The run script uses plain Node without filesystem watch mode so it works in environments with a low file-watcher limit.
- Review `server/index.mjs` and `public/app.js` for the OpenAI edit request, server-side key handling, NASA imagery flow, and browser-to-server journey.
- Reference trail for reviewers: [OpenAI image editing endpoint](https://developers.openai.com/api/reference/resources/images/methods/edit), [GPT Image 2.5 Sunburst model](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), [Codex docs](https://developers.openai.com/codex), [Codex quickstart](https://developers.openai.com/codex/quickstart), and [Codex iterative development workflow example](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex).
- Dependency installation was abandoned before it was needed; validation uses Node syntax checks and live server/provider smoke checks recorded below.

## Verification log

- 2026-11-01 — `node --check server/index.mjs` and `node --check public/app.js`: both passed.
- 2026-11-01 — `pnpm dev`: started the documented Node server and served the app at `http://localhost:8787`.
- 2026-11-01 — live smoke check: homepage HTTP 200; OpenStreetMap returned three London search results; NASA GIBS returned a 1536×1024 JPEG for London. After switching to Landsat WELD, the browser showed a clear Grand Canyon preview labeled “2000 annual composite”.
- 2026-11-01 — resumed API smoke checks: homepage `200`, NASA Landsat satellite endpoint `200 image/jpeg`, short place query `400`, invalid latitude `400`, malformed JSON `400`, and postcard request without a configured key `503`.
- 2026-11-01 — after simplifying the run script, `pnpm run dev` launched on port 8788 and served the page with HTTP `200`.
- 2026-11-01 — checked the OpenAI image guide/edit reference, NASA GIBS docs, Nominatim policy, and event page links; the event page is publicly readable through the web viewer.
- 2026-11-01 — checked all README/notes URLs: external references returned `200`, except the two `developers.openai.com/codex` URLs which return permanent redirects (`308`) to public `learn.chatgpt.com/docs` pages that return `200`.
- 2026-11-01 — generated-image action without a configured `.env` key: the app returned “Add OPENAI_API_KEY to .env to make your postcard.” The guard prevented any OpenAI request. The actual edit and caption calls still need a run with the user's key configured.
- 2026-11-01 — no `.env` file or API key is present in the project; `.env` and `work/` are ignored by Git.
