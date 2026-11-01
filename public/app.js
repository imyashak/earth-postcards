const $ = (selector) => document.querySelector(selector);
const state = { query: "", results: [], place: null, style: "Vintage travel poster", source: "", date: "", result: null, busy: "" };

const searchForm = $("#search-form");
const searchInput = $("#place");
const resultsBox = $("#search-results");
const inlineStatus = $("#inline-status");
const selectedPlace = $("#selected-place");
const frame = $("#postcard-frame");
const createButton = $("#create-button");
const errorBox = $("#error-message");

function setError(message = "") {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function setBusy(value, message = "") {
  state.busy = value;
  createButton.disabled = !state.source || Boolean(value);
  if (value === "create") createButton.innerHTML = '<span class="spinner light"></span> Making your postcard…';
  else { createButton.innerHTML = 'Make my postcard <span>↗</span>'; }
  if (value === "search") inlineStatus.innerHTML = '<span class="spinner"></span> Searching places…';
  else if (value === "imagery") inlineStatus.innerHTML = '<span class="spinner"></span> Finding a fresh satellite view…';
  inlineStatus.hidden = !["search", "imagery"].includes(value);
  if (message) inlineStatus.innerHTML = `<span class="spinner"></span> ${message}`;
}

async function searchPlaces(query = searchInput.value) {
  const term = query.trim();
  if (term.length < 2) return setError("Type a place name to begin.");
  setBusy("search"); setError(""); resultsBox.hidden = true;
  state.place = null; state.source = ""; state.result = null; selectedPlace.hidden = true;
  createButton.disabled = true;
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Search failed.");
    state.results = data;
    if (!data.length) { setError("No places found. Try a city, region or landmark."); return; }
    resultsBox.replaceChildren();
    for (const place of data) {
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "option");
      const label = document.createElement("span"); label.textContent = place.display_name;
      const arrow = document.createElement("b"); arrow.textContent = "↗";
      button.append(label, arrow); button.addEventListener("click", () => choosePlace(place)); resultsBox.append(button);
    }
    resultsBox.hidden = false;
  } catch (error) { setError(error.message); }
  finally { setBusy(""); }
}

async function choosePlace(place) {
  state.place = place; state.result = null; state.source = ""; resultsBox.hidden = true;
  setBusy("imagery"); setError("");
  try {
    const response = await fetch(`/api/satellite?lat=${encodeURIComponent(place.lat)}&lon=${encodeURIComponent(place.lon)}&v=landsat-2000`);
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Imagery unavailable."); }
    state.date = response.headers.get("X-Imagery-Date") || "recent observation";
    state.source = URL.createObjectURL(await response.blob());
    const name = place.display_name.split(",").slice(0, 2).join(",");
    $("#selected-name").textContent = name;
    $("#selected-meta").textContent = "NASA Landsat · 2000 annual composite";
    selectedPlace.hidden = false;
    $("#preview-title").textContent = "A place on Earth";
    $("#preview-counter").textContent = "✳";
    frame.classList.remove("has-result"); frame.innerHTML = "";
    const preview = document.createElement("div"); preview.className = "satellite-preview";
    const image = document.createElement("img"); image.src = state.source; image.alt = `Real NASA satellite image of ${name}`;
    const badge = document.createElement("div"); badge.className = "satellite-badge"; badge.innerHTML = '<span>●</span> LANDSAT VIEW · 2000 COMPOSITE';
    const coord = document.createElement("div"); coord.className = "coord-tag";
    const lat = Number(place.lat); const lon = Number(place.lon);
    coord.textContent = `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"} / ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}`;
    preview.append(image, badge, coord); frame.append(preview);
  } catch (error) { setError(error.message); }
  finally { setBusy(""); createButton.disabled = !state.source; }
}

async function makePostcard() {
  if (!state.source || !state.place) return;
  setBusy("create"); setError(""); $("#result-actions").hidden = true;
  try {
    const blob = await (await fetch(state.source)).blob();
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
    });
    const response = await fetch("/api/postcard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, place: state.place.display_name.split(",").slice(0, 2).join(","), style: state.style, coordinates: `${Number(state.place.lat).toFixed(3)}, ${Number(state.place.lon).toFixed(3)}` }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Generation failed.");
    state.result = { ...data, src: `data:image/png;base64,${data.image}` };
    showPostcard();
  } catch (error) { setError(error.message); }
  finally { setBusy(""); }
}

function showPostcard() {
  const name = state.place.display_name.split(",").slice(0, 2).join(",");
  frame.innerHTML = ""; frame.classList.add("has-result");
  const image = document.createElement("img"); image.className = "art-image"; image.src = state.result.src; image.alt = `AI-styled postcard of ${name}`;
  const caption = document.createElement("div"); caption.className = "caption-strip";
  const line = document.createElement("p"); line.textContent = `“${state.result.caption}”`;
  const credit = document.createElement("small"); credit.textContent = "EARTH POSTCARDS · NASA GIBS · LANDSAT 2000";
  caption.append(line, credit); frame.append(image, caption);
  $("#preview-title").textContent = "A view to remember";
  $("#preview-counter").textContent = "01 / 01";
  $("#source-note").textContent = `Styled from NASA Landsat 2000 imagery · ${state.style}`;
  $("#preview-foot").hidden = true; $("#result-actions").hidden = false;
}

async function downloadPostcard() {
  if (!state.result) return;
  const image = new Image(); image.src = state.result.src;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight + 220;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#f5f0e5"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, image.naturalHeight);
  ctx.fillStyle = "#f5f0e5"; ctx.fillRect(0, image.naturalHeight, canvas.width, 220);
  ctx.fillStyle = "#283e34"; ctx.textAlign = "center"; ctx.font = "italic 34px Georgia";
  const words = state.result.caption.split(" "); const lines = [""];
  for (const word of words) { const next = `${lines[lines.length - 1]} ${word}`.trim(); if (ctx.measureText(next).width > canvas.width - 96) lines.push(word); else lines[lines.length - 1] = next; }
  lines.slice(0, 2).forEach((line, index) => ctx.fillText(line, canvas.width / 2, image.naturalHeight + 83 + index * 44));
  ctx.fillStyle = "#6f786b"; ctx.font = "14px Arial"; ctx.letterSpacing = "2px"; ctx.fillText("EARTH POSTCARDS  •  NASA GIBS  •  LANDSAT 2000", canvas.width / 2, canvas.height - 27);
  const slug = state.place.display_name.split(",")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const link = document.createElement("a"); link.download = `earth-postcard-${slug}.png`; link.href = canvas.toDataURL("image/png"); link.click();
}

searchForm.addEventListener("submit", (event) => { event.preventDefault(); searchPlaces(); });
document.querySelectorAll("[data-place]").forEach((button) => button.addEventListener("click", () => { searchInput.value = button.dataset.place; searchPlaces(button.dataset.place); }));
document.querySelectorAll("[data-style]").forEach((button) => button.addEventListener("click", () => {
  state.style = button.dataset.style;
  document.querySelectorAll("[data-style]").forEach((item) => { const active = item === button; item.classList.toggle("active", active); item.querySelector(".radio").textContent = active ? "●" : "○"; });
}));
createButton.addEventListener("click", makePostcard);
$("#download-button").addEventListener("click", downloadPostcard);
