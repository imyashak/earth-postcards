const geocodeCache = new Map();
let lastGeocodeAt = 0;
let geocodeQueue = Promise.resolve();
const fetchWithTimeout = (input, init = {}, timeout = 45_000) => fetch(input, { ...init, signal: AbortSignal.timeout(timeout) });

export function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

export function methodNotAllowed(response, allow) {
  response.setHeader("Allow", allow);
  return sendJson(response, 405, { error: "Method not allowed." });
}

async function readJson(request, maximum = 8 * 1024 * 1024) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximum) throw Object.assign(new Error("Request is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Request must contain valid JSON."), { status: 400 }); }
}

async function acquireGeocodeSlot() {
  const previous = geocodeQueue; let release;
  geocodeQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  const delay = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastGeocodeAt = Date.now();
  return release;
}

function responseText(data) { return (typeof data.output_text === "string" && data.output_text.trim()) || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text?.trim() || ""; }
function parseJsonText(value) { return JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
async function readOpenAiJson(response) { const text = await response.text(); try { return JSON.parse(text); } catch { throw new Error(`OpenAI returned ${response.status} without a JSON body${text ? `: ${text.slice(0, 200)}` : "."}`); } }
function validCoordinates(lat, lng) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180; }
function rollRarity() { const roll = Math.random(); return roll < .15 ? "legendary" : roll < .50 ? "rare" : "common"; }

export async function searchPlaces(request, response) {
  const url = new URL(request.url, "https://earth-postcards.local");
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
    const places = await result.json(); geocodeCache.set(cacheKey, places); return sendJson(response, 200, places);
  } catch (error) { return sendJson(response, 502, { error: "Place search is unavailable. Try again shortly." }); }
  finally { release?.(); }
}

export async function satelliteImage(request, response) {
  const url = new URL(request.url, "https://earth-postcards.local");
  const lat = Number(url.searchParams.get("lat")); const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return sendJson(response, 400, { error: "Choose a valid place between 85° south and north." });
  const halfHeight = .11; const halfWidth = Math.min(2, halfHeight / Math.max(.12, Math.cos(lat * Math.PI / 180)));
  const wmsUrl = new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
  const params = { SERVICE:"WMS", REQUEST:"GetMap", VERSION:"1.1.1", LAYERS:"Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual", STYLES:"", FORMAT:"image/jpeg", SRS:"EPSG:4326", BBOX:`${lon-halfWidth},${Math.max(-90,lat-halfHeight)},${lon+halfWidth},${Math.min(90,lat+halfHeight)}`, WIDTH:"1536", HEIGHT:"1024", TIME:"2000-12-01" };
  Object.entries(params).forEach(([key, value]) => wmsUrl.searchParams.set(key, value));
  try {
    const result = await fetch(wmsUrl);
    if (!result.ok || !result.headers.get("content-type")?.includes("image")) throw new Error("NASA GIBS did not return an image");
    response.statusCode = 200; response.setHeader("Content-Type", result.headers.get("content-type") || "image/jpeg"); response.setHeader("Cache-Control", "public, max-age=3600"); response.setHeader("X-Imagery-Date", "2000-12-01"); response.end(Buffer.from(await result.arrayBuffer()));
  } catch { sendJson(response, 502, { error: "NASA imagery could not be loaded for this place. Try another location." }); }
}

export async function createPostcard(request, response) {
  const body = await readJson(request); const { image, place, style, coordinates } = body;
  if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,") || image.length > 7_000_000) return sendJson(response, 400, { error: "A satellite image is required." });
  if (!process.env.OPENAI_API_KEY) return sendJson(response, 503, { error: "Set OPENAI_API_KEY in Vercel Environment Variables to make your postcard." });
  const stylePrompts = { "Travel poster":"bold vintage travel-poster shapes, limited sun-faded screen-print palette, elegant condensed visual rhythm", Watercolour:"transparent watercolour washes, hand-painted pigment edges, paper grain and soft atmospheric colour", Blueprint:"precise cyanotype blueprint lines, navy field, measured contour accents and technical drafting texture", "Mission patch":"embroidered mission-patch illustration, layered fabric shapes, stitched edge texture and a confident expedition palette", "Woodblock print":"carved woodblock print marks, expressive ink grain, registration texture and a restrained earthy palette" };
  const selectedStyle = Object.hasOwn(stylePrompts, style) ? style : "Travel poster";
  const placeName = String(place || "Earth").slice(0,120).replace(/[\n"\\]/g," ");
  const fallbackCaption = `A small view of ${placeName} from orbit.`; const fallbackNote = "Wish you were here. This is how it looks from 400 km up.";
  const imageRequest = { model:process.env.IMAGE_MODEL || "gpt-image-2.5-flare", prompt:`Restyle this real satellite image of ${placeName} as ${selectedStyle}: ${stylePrompts[selectedStyle]}. Preserve the exact geographic layout, coastline, rivers, roads, urban shape and orientation so a before/after slider lines up. Create full-bleed landscape artwork with no text, labels, borders, frames, margins or caption panel. Do not invent landmarks or alter the geographic layout.`, images:[{image_url:image}], size:"1536x1024", quality:"medium", output_format:"png" };
  const captionPrompt = `Write postcard copy for ${placeName}. Return only valid JSON with exactly these keys: caption and note. caption is one poetic, friendly sentence with at most 12 words. note is exactly two warm sentences for the back of a postcard, signed by nobody. Do not claim a landmark or fact unless certain. Coordinates: ${String(coordinates || "").slice(0,40)}.`;
  try {
    const headers = { Authorization:`Bearer ${process.env.OPENAI_API_KEY}` };
    const [imageResponse, captionResult] = await Promise.all([fetchWithTimeout("https://api.openai.com/v1/images/edits",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(imageRequest)}),fetchWithTimeout("https://api.openai.com/v1/responses",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-6-luna",input:captionPrompt,max_output_tokens:400,text:{format:{type:"json_object"}}})}).then(readOpenAiJson).catch(() => null)]);
    const imageData = await readOpenAiJson(imageResponse); if (!imageResponse.ok) throw new Error(imageData.error?.message || "Image generation failed."); if (!imageData.data?.[0]?.b64_json) throw new Error("The image generation response was incomplete.");
    let caption = fallbackCaption; let note = fallbackNote;
    try { const copy = parseJsonText(responseText(captionResult)); const candidateCaption = typeof copy.caption === "string" ? copy.caption.trim() : ""; const candidateNote = typeof copy.note === "string" ? copy.note.trim() : ""; if (candidateCaption && candidateNote && candidateCaption.split(/\s+/).length <= 12) { caption = candidateCaption.replace(/^['"“”]|['"“”]$/g,""); note = candidateNote; } } catch (captionError) { console.warn("Caption fallback used:", captionError.message); }
    sendJson(response, 200, { image:imageData.data[0].b64_json, caption, note, rarity:rollRarity(), imageModel:process.env.IMAGE_MODEL || "gpt-image-2.5-flare" });
  } catch (error) { sendJson(response, 502, { error: "The postcard could not be generated. Check API billing and image-model access, then try again." }); }
}

export async function findPlace(request, response) {
  const body = await readJson(request, 32 * 1024); const text = typeof body.text === "string" ? body.text.trim().slice(0,240) : "";
  if (text.length < 3) return sendJson(response, 400, { error: "Describe a place in at least three characters." });
  if (!process.env.OPENAI_API_KEY) return sendJson(response, 503, { error: "Set OPENAI_API_KEY in Vercel Environment Variables to find a place." });
  const tool = { type:"function", name:"fly_to", description:"Choose one real Earth place matching the user's description and return its coordinates.", parameters:{type:"object",additionalProperties:false,properties:{name:{type:"string"},lat:{type:"number"},lng:{type:"number"},reason:{type:"string"}},required:["name","lat","lng","reason"]} };
  try {
    const result = await fetchWithTimeout("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-6-luna",instructions:"Use the fly_to function exactly once. Pick a real, recognizable place on Earth that best matches the description. Never invent coordinates.",input:text,tools:[tool],tool_choice:{type:"function",name:"fly_to"}})},30_000); const data = await result.json(); if (!result.ok) throw new Error(data.error?.message || "Where request failed.");
    const call = data.output?.find((item) => item.type === "function_call" && item.name === "fly_to"); const place = JSON.parse(call?.arguments || "{}"); const lat = Number(place.lat); const lng = Number(place.lng);
    if (!call || typeof place.name !== "string" || !place.name.trim() || !validCoordinates(lat,lng) || typeof place.reason !== "string" || !place.reason.trim()) throw new Error("The chosen place was invalid.");
    sendJson(response, 200, { name:place.name.trim().slice(0,120), lat, lng, reason:place.reason.trim().slice(0,240) });
  } catch { sendJson(response, 502, { error: "I could not find a reliable place for that description. Try another one." }); }
}
