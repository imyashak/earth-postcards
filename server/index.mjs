import { createServer } from "node:http";
import { readFile, readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = resolve(projectRoot, "public");
const port = Number(process.env.PORT || 8787);
const geocodeCache = new Map();
let lastGeocodeAt = 0;
let geocodeQueue = Promise.resolve();

try {
  const envFile = readFileSync(resolve(projectRoot, ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch {}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function acquireGeocodeSlot() {
  const previous = geocodeQueue;
  let release;
  geocodeQueue = new Promise((resolveQueue) => { release = resolveQueue; });
  await previous;
  const delay = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
  if (delay) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  lastGeocodeAt = Date.now();
  return release;
}

async function readJson(request, maximum = 8 * 1024 * 1024) {
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximum) throw Object.assign(new Error("Request is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Request must contain valid JSON."), { status: 400 }); }
}

async function searchPlaces(request, response, url) {
  const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
  if (query.length < 2) return sendJson(response, 400, { error: "Type at least two characters." });
  const cacheKey = query.toLowerCase();
  if (geocodeCache.has(cacheKey)) return sendJson(response, 200, geocodeCache.get(cacheKey));
  const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
  geocodeUrl.searchParams.set("q", query); geocodeUrl.searchParams.set("format", "jsonv2"); geocodeUrl.searchParams.set("limit", "5");
  let release;
  try {
    release = await acquireGeocodeSlot();
    const result = await fetch(geocodeUrl, { headers: { "User-Agent": "EarthPostcards/0.1 (DevDay hackathon demo)" } });
    if (!result.ok) throw new Error(`OpenStreetMap search returned ${result.status}`);
    const places = await result.json(); geocodeCache.set(cacheKey, places);
    return sendJson(response, 200, places);
  } catch (error) {
    console.error("Place lookup unavailable:", error.message);
    return sendJson(response, 502, { error: "Place search is unavailable. Try again shortly." });
  } finally { release?.(); }
}

async function satelliteImage(response, url) {
  const lat = Number(url.searchParams.get("lat")); const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
    return sendJson(response, 400, { error: "Choose a valid place between 85° south and north." });
  }
  const halfHeight = 0.11;
  const halfWidth = Math.min(2, halfHeight / Math.max(0.12, Math.cos((lat * Math.PI) / 180)));
  const bbox = `${lon - halfWidth},${Math.max(-90, lat - halfHeight)},${lon + halfWidth},${Math.min(90, lat + halfHeight)}`;
  const wmsUrl = new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
  // WELD's latest published global annual true-color mosaic is the 2000 composite.
  const date = "2000-12-01";
  const params = { SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.1.1", LAYERS: "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual", STYLES: "", FORMAT: "image/jpeg", SRS: "EPSG:4326", BBOX: bbox, WIDTH: "1536", HEIGHT: "1024", TIME: date };
  for (const [key, value] of Object.entries(params)) wmsUrl.searchParams.set(key, value);
  try {
    const result = await fetch(wmsUrl);
    if (!result.ok || !result.headers.get("content-type")?.includes("image")) throw new Error("NASA GIBS did not return an image");
    const bytes = Buffer.from(await result.arrayBuffer());
    response.writeHead(200, { "Content-Type": result.headers.get("content-type") || "image/jpeg", "Cache-Control": "public, max-age=3600", "X-Imagery-Date": wmsUrl.searchParams.get("TIME") || date });
    response.end(bytes);
  } catch (error) {
    console.error("Satellite image unavailable:", error.message);
    return sendJson(response, 502, { error: "NASA imagery could not be loaded for this place. Try another location." });
  }
}

async function createPostcard(request, response) {
  const body = await readJson(request);
  const { image, place, style, coordinates } = body;
  if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,") || image.length > 7_000_000) {
    return sendJson(response, 400, { error: "A satellite image is required." });
  }
  if (!process.env.OPENAI_API_KEY) return sendJson(response, 503, { error: "Add OPENAI_API_KEY to .env to make your postcard." });
  const validStyles = ["Vintage travel poster", "Risograph print", "Mid-century modern", "Watercolour atlas"];
  const selectedStyle = validStyles.includes(style) ? style : validStyles[0];
  const placeName = String(place || "Earth").slice(0, 120).replace(/[\n"\\]/g, " ");
  const imageBytes = Buffer.from(image.split(",")[1], "base64");
  const form = new FormData();
  form.append("model", "gpt-image-2.5-sunburst");
  form.append("prompt", `Restyle this real satellite image of ${placeName} as a beautiful ${selectedStyle}. Preserve recognizable geography, coastline, rivers and urban shape from the source. Use confident shapes, a warm limited palette and refined print texture. Add a clean cream caption panel at the bottom with the exact place name “${placeName}” and no other text. Portrait travel-poster composition. Do not invent landmarks or alter the geographic layout.`);
  form.append("size", "1024x1536"); form.append("quality", "medium"); form.append("output_format", "png");
  form.append("image[]", new Blob([imageBytes], { type: "image/jpeg" }), "earth-view.jpg");
  const captionPrompt = `Write one poetic, friendly postcard caption for a travel-lover about ${placeName}. One sentence, 12 words maximum. Do not claim a landmark or fact unless certain. Coordinates: ${String(coordinates || "").slice(0, 40)}. Return only the caption.`;
  try {
    const headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
    const [imageResponse, captionResponse] = await Promise.all([
      fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers, body: form }),
      fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-6-luna", input: captionPrompt, max_output_tokens: 60 }) }),
    ]);
    const [imageData, captionData] = await Promise.all([imageResponse.json(), captionResponse.json()]);
    if (!imageResponse.ok) throw new Error(imageData.error?.message || `Image edit returned ${imageResponse.status}`);
    if (!captionResponse.ok) throw new Error(captionData.error?.message || `Caption request returned ${captionResponse.status}`);
    const caption = captionData.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text?.trim();
    if (!imageData.data?.[0]?.b64_json || !caption) throw new Error("The generation response was incomplete.");
    sendJson(response, 200, { image: imageData.data[0].b64_json, caption: caption.replace(/^['"“”]|['"“”]$/g, "") });
  } catch (error) {
    console.error("Postcard generation failed:", error.message);
    sendJson(response, 502, { error: "The postcard could not be generated. Check your API billing and image-model access, then try again." });
  }
}

const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
function serveStatic(response, pathname) {
  let path;
  try { path = decodeURIComponent(pathname); } catch { response.writeHead(400); return response.end("Bad request"); }
  if (path === "/") path = "/index.html";
  const file = resolve(publicRoot, `.${path}`);
  if (file !== publicRoot && !file.startsWith(`${publicRoot}${sep}`)) { response.writeHead(403); return response.end("Forbidden"); }
  readFile(file, (error, data) => {
    if (error) { response.writeHead(404); return response.end("Not found"); }
    response.writeHead(200, { "Content-Type": contentTypes[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    response.end(data);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/search") return await searchPlaces(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/satellite") return await satelliteImage(response, url);
    if (request.method === "POST" && url.pathname === "/api/postcard") return await createPostcard(request, response);
    if (request.method === "GET") return serveStatic(response, url.pathname);
    response.writeHead(405, { Allow: "GET, POST" }); response.end("Method not allowed");
  } catch (error) {
    console.error("Request failed:", error.message);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.message || "Unexpected server error." });
    else response.destroy();
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Earth Postcards ready at http://localhost:${port}`));
