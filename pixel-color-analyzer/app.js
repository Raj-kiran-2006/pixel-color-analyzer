"use strict";

// Preview and analysis stay bounded in size, even when the source photo is huge.
const MAX_PREVIEW_EDGE = 2400;
const ANALYSIS_EDGE = 160;
const WIKIMEDIA_API_URL = "https://commons.wikimedia.org/w/api.php";
const SEARCH_PAGE_SIZE = 24;

// DOM references
const tabs = [...document.querySelectorAll(".mode-tab")];
const panels = [...document.querySelectorAll(".tool-panel")];
const canvas = document.querySelector("#image-canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
const imageName = document.querySelector("#image-name");
const imageDimensions = document.querySelector("#image-dimensions");
const previewTitle = document.querySelector("#preview-title");
const imageStatus = document.querySelector(".image-status");
const emptyPreview = document.querySelector("#empty-preview");
const pickHint = document.querySelector("#pick-hint");
const magnifier = document.querySelector("#magnifier");
const magnifierColor = document.querySelector("#magnifier-color");
const magnifierHex = document.querySelector("#magnifier-hex");
const cameraVideo = document.querySelector("#camera-video");
const colorPreview = document.querySelector("#color-preview");
const colorPreviewSwatch = document.querySelector("#color-preview-swatch");
const colorPreviewHex = document.querySelector("#color-preview-hex");
const previewOverlay = document.querySelector("#preview-overlay");
const toast = document.querySelector("#toast");
const colorInfo = document.querySelector("#color-info");
const colorInfoEmpty = document.querySelector("#color-info-empty");
const recentColors = document.querySelector("#recent-colors");

const titles = {
  upload: ["Upload an image", "Choose a photo and pick any pixel to reveal its color.", "Image preview"],
  camera: ["Sample from your camera", "Point your camera at a color and sample it live.", "Camera preview"],
  search: ["Find an online photo", "Search Wikimedia Commons for a free image to analyze.", "Selected photo"],
  url: ["Load an image by URL", "Paste a direct image link to analyze a photo from the web.", "Image preview"],
  convert: ["Convert a color", "Enter a color in one format to see it in every format.", "Color preview"]
};

let currentMode = "upload";
let activeCameraStream = null;
let currentObjectUrl = null;
let toastTimer;
let pickedColor = null;
let palette = readPalette();
let currentImage = null;
let imageRequestId = 0;
let cameraRequestId = 0;
let searchController = null;
let searchRequestId = 0;
let searchOffset = null;
let searchQuery = "";
let searchLoading = false;
let searchDebounce;

// Saved recent colors
function readPalette() {
  try {
    const saved = JSON.parse(localStorage.getItem("colorspectrum-recent") || "[]");
    return Array.isArray(saved) ? saved.filter(value => /^#[\da-f]{6}$/i.test(value)).slice(0, 12) : [];
  } catch (error) {
    console.warn("Could not read the saved color palette.", error);
    return [];
  }
}

// Shared status and camera helpers
function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
}

function stopCamera() {
  cameraRequestId += 1;
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
  cameraVideo.srcObject = null;
  cameraVideo.hidden = true;
  canvas.hidden = false;
  document.querySelector("#start-camera").disabled = false;
  document.querySelector("#capture-camera").disabled = true;
}

function setMode(mode) {
  if (!titles[mode]) return;
  if (currentMode === "camera" && mode !== "camera") stopCamera();
  currentMode = mode;
  tabs.forEach(tab => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  panels.forEach(panel => {
    const active = panel.dataset.panel === mode;
    panel.classList.toggle("is-visible", active);
    panel.hidden = !active;
  });
  document.querySelector("#tool-title").textContent = titles[mode][0];
  document.querySelector("#tool-subtitle").textContent = titles[mode][1];
  previewTitle.textContent = titles[mode][2];
  colorPreview.hidden = mode !== "convert";
  canvas.hidden = mode === "convert" || (mode === "camera" && Boolean(activeCameraStream));
  pickHint.hidden = mode === "convert" || (mode === "camera" && !activeCameraStream) || canvas.hidden;
  magnifier.hidden = true;
  if (mode === "convert") renderConvertedColor();
}

function setImageStatus(label, ready = true) {
  imageStatus.innerHTML = `<span></span> ${label}`;
  imageStatus.querySelector("span").style.backgroundColor = ready ? "var(--mint)" : "#e8a34d";
}

function createSampleImage() {
  const sample = document.createElement("canvas");
  sample.width = 1136;
  sample.height = 640;
  const drawing = sample.getContext("2d");
  const background = drawing.createLinearGradient(72, 52, 1027, 630);
  background.addColorStop(0, "#dcebf2");
  background.addColorStop(.43, "#b3d4db");
  background.addColorStop(1, "#123e49");
  drawing.fillStyle = background;
  drawing.fillRect(0, 0, sample.width, sample.height);

  [[92, 88, 3], [167, 198, 2], [320, 105, 4], [455, 187, 2], [539, 76, 3],
    [725, 112, 2], [992, 91, 4], [1044, 216, 2], [897, 153, 3], [219, 322, 2],
    [64, 406, 4], [418, 286, 2], [675, 193, 3], [1091, 376, 3], [956, 482, 2]]
    .forEach(([x, y, radius]) => {
      drawing.beginPath();
      drawing.arc(x, y, radius, 0, Math.PI * 2);
      drawing.fillStyle = "rgba(255, 255, 255, .38)";
      drawing.fill();
    });

  const water = drawing.createLinearGradient(182, 549, 1034, 298);
  water.addColorStop(0, "#153d49");
  water.addColorStop(.32, "#168a85");
  water.addColorStop(.67, "#59d5a6");
  water.addColorStop(1, "#d8f4c4");
  drawing.beginPath();
  drawing.moveTo(0, 474);
  drawing.bezierCurveTo(123, 400, 216, 414, 328, 466);
  drawing.bezierCurveTo(439, 517, 532, 505, 643, 419);
  drawing.bezierCurveTo(764, 325, 858, 283, 977, 325);
  drawing.bezierCurveTo(1042, 348, 1087, 344, 1136, 317);
  drawing.lineTo(1136, 640);
  drawing.lineTo(0, 640);
  drawing.closePath();
  drawing.fillStyle = water;
  drawing.fill();

  const ribbon = drawing.createLinearGradient(286, 488, 1026, 162);
  ribbon.addColorStop(0, "#0c575f");
  ribbon.addColorStop(.5, "#29bb9c");
  ribbon.addColorStop(1, "#d6f8ce");
  drawing.beginPath();
  drawing.moveTo(356, 640);
  drawing.bezierCurveTo(392, 547, 461, 463, 533, 430);
  drawing.bezierCurveTo(598, 400, 648, 421, 694, 376);
  drawing.bezierCurveTo(734, 337, 739, 265, 783, 230);
  drawing.bezierCurveTo(820, 201, 871, 214, 898, 246);
  drawing.bezierCurveTo(921, 273, 922, 309, 946, 320);
  drawing.bezierCurveTo(970, 331, 1004, 310, 1034, 285);
  drawing.bezierCurveTo(1076, 250, 1110, 217, 1136, 230);
  drawing.lineTo(1136, 640);
  drawing.closePath();
  drawing.fillStyle = ribbon;
  drawing.fill();

  drawing.fillStyle = "rgba(239, 255, 233, .72)";
  [[756, 157, 8, 22], [851, 203, 6, 16], [940, 117, 5, 14],
    [1024, 290, 6, 18], [688, 271, 4, 12], [906, 375, 5, 15]]
    .forEach(([x, y, radiusX, radiusY]) => {
      drawing.beginPath();
      drawing.ellipse(x, y, radiusX, radiusY, -.2, 0, Math.PI * 2);
      drawing.fill();
    });
  drawing.beginPath();
  drawing.moveTo(0, 498);
  drawing.bezierCurveTo(167, 433, 245, 464, 362, 500);
  drawing.bezierCurveTo(475, 534, 543, 516, 643, 441);
  drawing.bezierCurveTo(776, 341, 849, 304, 968, 326);
  drawing.strokeStyle = "rgba(236, 255, 240, .44)";
  drawing.lineWidth = 4;
  drawing.stroke();

  return sample.toDataURL("image/png");
}

function createFavicon() {
  const icon = document.createElement("canvas");
  icon.width = 64;
  icon.height = 64;
  const drawing = icon.getContext("2d");
  drawing.beginPath();
  drawing.arc(32, 32, 30, 0, Math.PI * 2);
  drawing.fillStyle = "#f2f0ff";
  drawing.fill();
  const spectrum = drawing.createLinearGradient(8, 8, 56, 56);
  spectrum.addColorStop(0, "#635bff");
  spectrum.addColorStop(.52, "#c043da");
  spectrum.addColorStop(1, "#f6a24a");
  drawing.beginPath();
  drawing.arc(32, 32, 23, 0, Math.PI * 2);
  drawing.fillStyle = spectrum;
  drawing.fill();
  drawing.fillStyle = "#fff";
  [[22, 29], [32, 23], [42, 29]].forEach(([x, y]) => {
    drawing.beginPath();
    drawing.arc(x, y, 3.2, 0, Math.PI * 2);
    drawing.fill();
  });
  document.querySelector("#app-favicon").href = icon.toDataURL("image/png");
}

// Image loading and dominant-color analysis
function loadImage(source, name, isRemote = false) {
  const requestId = ++imageRequestId;
  previewOverlay.hidden = false;
  setImageStatus("LOADING IMAGE", false);
  const image = new Image();
  if (isRemote) image.crossOrigin = "anonymous";
  image.onload = () => {
    if (requestId !== imageRequestId) return;
    try {
      const previewScale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * previewScale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * previewScale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.getImageData(0, 0, 1, 1);
    } catch (error) {
      canvas.width = 0;
      canvas.height = 0;
      previewOverlay.hidden = true;
      setImageStatus("CANNOT SAMPLE", false);
      document.querySelector("#url-error").textContent = "This image is protected from browser access, so its pixels cannot be sampled. Try an image hosted with CORS enabled or upload a local copy.";
      showToast("The image loaded but its host blocked pixel sampling (CORS).", true);
      return;
    }
    currentImage = image;
    analyzeDominantColors(image);
    canvas.hidden = false;
    cameraVideo.hidden = true;
    emptyPreview.hidden = true;
    previewOverlay.hidden = true;
    pickHint.hidden = currentMode === "convert";
    imageName.textContent = `${name} · click to pick a color`;
    imageDimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    setImageStatus("READY TO SAMPLE");
    document.querySelector("#url-error").textContent = "";
    document.querySelector("#magnifier").hidden = true;
  };
  image.onerror = () => {
    if (requestId !== imageRequestId) return;
    previewOverlay.hidden = true;
    setImageStatus("IMAGE NOT LOADED", false);
    document.querySelector("#url-error").textContent = "We couldn't load that image. Check that the address is a direct image link and try again.";
    showToast("Couldn't load that image. Check the file or URL and try again.", true);
  };
  image.src = source;
}

function analyzeDominantColors(image) {
  const scale = Math.min(1, ANALYSIS_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleContext.drawImage(image, 0, 0, width, height);
  const { data } = sampleContext.getImageData(0, 0, width, height);
  const buckets = new Map();
  let visiblePixels = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 128) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
    visiblePixels += 1;
  }

  const candidates = [...buckets.values()]
    .map(bucket => ({
      rgb: {
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count)
      },
      count: bucket.count
    }))
    .sort((a, b) => b.count - a.count);

  // Skip nearly identical neighboring shades so the palette shows useful variety.
  const selected = [];
  for (const candidate of candidates) {
    const isDistinct = selected.every(color => {
      const dr = candidate.rgb.r - color.rgb.r;
      const dg = candidate.rgb.g - color.rgb.g;
      const db = candidate.rgb.b - color.rgb.b;
      return dr * dr + dg * dg + db * db >= 52 * 52;
    });
    if (isDistinct) selected.push(candidate);
    if (selected.length === 6) break;
  }

  const colorTotals = selected.map(() => 0);
  candidates.forEach(candidate => {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    selected.forEach((color, index) => {
      const dr = candidate.rgb.r - color.rgb.r;
      const dg = candidate.rgb.g - color.rgb.g;
      const db = candidate.rgb.b - color.rgb.b;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    colorTotals[nearestIndex] += candidate.count;
  });
  renderDominantColors(selected.map(({ rgb }, index) => ({
    hex: toHex(rgb),
    percent: visiblePixels ? colorTotals[index] / visiblePixels * 100 : 0
  })));
}

function renderDominantColors(colors) {
  const container = document.querySelector("#dominant-colors");
  container.replaceChildren();
  if (!colors.length) {
    const message = document.createElement("p");
    message.className = "empty-colors";
    message.textContent = "No visible colors found in this image.";
    container.append(message);
    return;
  }
  colors.forEach(({ hex, percent }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dominant-swatch";
    button.setAttribute("aria-label", `Select ${hex}, ${percent.toFixed(1)} percent of sampled pixels`);
    const swatch = document.createElement("span");
    swatch.className = "dominant-swatch-color";
    swatch.style.backgroundColor = hex;
    const label = document.createElement("span");
    label.className = "dominant-swatch-label";
    const value = document.createElement("strong");
    value.textContent = hex;
    const share = document.createElement("span");
    share.textContent = `${percent.toFixed(1)}% of sample`;
    label.append(value, share);
    button.append(swatch, label);
    button.addEventListener("click", () => selectColor(parseColor(hex)));
    container.append(button);
  });
}

// File validation
function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Choose an image file to continue.", true);
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast("That image is larger than 20 MB. Choose a smaller file.", true);
    return;
  }
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);
  setMode("upload");
  loadImage(currentObjectUrl, file.name);
}

// Color format conversion
function toHex({ r, g, b }) {
  return `#${[r, g, b].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - chroma / 2;
  let rgb;
  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return { r: Math.round((rgb[0] + m) * 255), g: Math.round((rgb[1] + m) * 255), b: Math.round((rgb[2] + m) * 255) };
}

function parseColor(value) {
  const input = value.trim();
  const hex = input.match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map(char => char + char).join("") : hex[1];
    return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16) };
  }
  const rgb = input.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    if (channels.every(value => value <= 255)) return { r: channels[0], g: channels[1], b: channels[2] };
    return null;
  }
  const hsl = input.match(/^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i);
  if (hsl) {
    const [, hue, saturation, lightness] = hsl.map(Number);
    if (saturation <= 100 && lightness <= 100) return fromHsl(hue, saturation, lightness);
  }
  return null;
}

function formatValues(rgb) {
  const hsl = toHsl(rgb);
  return {
    hex: toHex(rgb),
    rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
  };
}

function selectColor(rgb, addToPalette = true) {
  pickedColor = { r: rgb.r, g: rgb.g, b: rgb.b };
  const values = formatValues(pickedColor);
  document.querySelector("#selected-swatch").style.backgroundColor = values.hex;
  colorPreviewSwatch.style.backgroundColor = values.hex;
  colorPreviewHex.textContent = values.hex;
  document.querySelector("#hex-value").textContent = values.hex;
  document.querySelector("#rgb-value").textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  const hsl = toHsl(rgb);
  document.querySelector("#hsl-value").textContent = `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`;
  document.querySelector("#color-input").value = values.hex;
  document.querySelector("#color-picker").value = values.hex;
  document.querySelector("#converter-error").textContent = "";
  document.querySelector("#color-prompt").textContent = "Click a value to copy it to your clipboard";
  colorInfo.hidden = false;
  colorInfoEmpty.hidden = true;
  magnifierColor.style.backgroundColor = values.hex;
  magnifierHex.textContent = values.hex;
  magnifier.hidden = currentMode === "convert";
  if (addToPalette) {
    palette = [values.hex, ...palette.filter(color => color !== values.hex)].slice(0, 12);
    try {
      localStorage.setItem("colorspectrum-recent", JSON.stringify(palette));
    } catch (error) {
      console.warn("Could not save the recent color palette.", error);
      showToast("Color selected, but the palette couldn't be saved in this browser.", true);
    }
    renderPalette();
  }
  if (currentMode === "convert") renderConvertedColor();
}

// Palette and preview interactions
function renderPalette() {
  recentColors.replaceChildren();
  if (palette.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-colors";
    empty.textContent = "Your sampled colors will appear here.";
    recentColors.append(empty);
    return;
  }
  palette.forEach(color => {
    const button = document.createElement("button");
    button.className = "swatch-button";
    button.type = "button";
    button.style.backgroundColor = color;
    button.setAttribute("aria-label", color);
    button.title = `Select ${color}`;
    button.addEventListener("click", () => selectColor(parseColor(color), false));
    recentColors.append(button);
  });
}

function sampleCanvasPoint(event, sourceCanvas = canvas) {
  const rect = sourceCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.min(sourceCanvas.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * sourceCanvas.width / rect.width)));
  const y = Math.min(sourceCanvas.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * sourceCanvas.height / rect.height)));
  const pixel = context.getImageData(x, y, 1, 1).data;
  selectColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
}

function pointInContainedMedia(event, media, width, height) {
  const rect = media.getBoundingClientRect();
  const scale = Math.min(rect.width / width, rect.height / height);
  const displayedWidth = width * scale;
  const displayedHeight = height * scale;
  const offsetX = (rect.width - displayedWidth) / 2;
  const offsetY = (rect.height - displayedHeight) / 2;
  const x = event.clientX - rect.left - offsetX;
  const y = event.clientY - rect.top - offsetY;
  if (x < 0 || y < 0 || x >= displayedWidth || y >= displayedHeight) return null;
  return { x: Math.floor(x / scale), y: Math.floor(y / scale) };
}

function setSearchStatus(message) {
  document.querySelector("#search-status").textContent = message;
}

function renderCommonsPhotos(pages) {
  const container = document.querySelector("#search-results");
  let added = 0;
  pages.forEach(page => {
    const imageInfo = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!imageInfo || typeof imageInfo.thumburl !== "string" || typeof imageInfo.descriptionurl !== "string") return;
    const pageId = String(page.pageid);
    if (container.querySelector(`[data-page-id="${pageId}"]`)) return;
    const title = typeof page.title === "string" ? page.title.replace(/^File:/, "") : "Untitled image";
    const tile = document.createElement("div");
    tile.className = "photo-tile";
    tile.dataset.pageId = pageId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photo-result";
    button.title = `Load ${title}`;
    const image = document.createElement("img");
    image.src = imageInfo.thumburl;
    image.alt = "";
    image.loading = "lazy";
    const label = document.createElement("span");
    label.textContent = title;
    button.append(image, label);
    button.addEventListener("click", () => loadImage(imageInfo.thumburl, title, true));
    const attribution = document.createElement("a");
    attribution.className = "photo-credit";
    attribution.href = imageInfo.descriptionurl;
    attribution.target = "_blank";
    attribution.rel = "noopener noreferrer";
    attribution.textContent = "Wikimedia Commons · source & license";
    tile.append(button, attribution);
    container.append(tile);
    added += 1;
  });
  return added;
}

function schedulePhotoSearch(query) {
  clearTimeout(searchDebounce);
  searchController?.abort();
  searchController = null;
  searchRequestId += 1;
  searchLoading = false;
  searchOffset = null;
  searchQuery = query.trim();
  document.querySelector("#search-results").replaceChildren();
  const loadMoreButton = document.querySelector("#load-more-photos");
  loadMoreButton.hidden = true;
  loadMoreButton.disabled = false;

  if (!searchQuery) {
    setSearchStatus("Enter at least two characters to search.");
    return;
  }
  if (searchQuery.length < 2) {
    setSearchStatus("Enter one more character to search.");
    return;
  }
  setSearchStatus("Searching Wikimedia Commons…");
  const queryForRequest = searchQuery;
  searchDebounce = setTimeout(() => searchPhotos(queryForRequest), 350);
}

async function searchPhotos(query, append = false) {
  const term = query.trim();
  if (append && (searchLoading || term !== searchQuery || searchOffset === null)) return;
  if (!append) {
    searchController?.abort();
    searchQuery = term;
    searchOffset = null;
    document.querySelector("#search-results").replaceChildren();
  }

  const requestId = ++searchRequestId;
  const controller = new AbortController();
  searchController = controller;
  searchLoading = true;
  const loadMoreButton = document.querySelector("#load-more-photos");
  loadMoreButton.disabled = true;
  if (append) setSearchStatus("Loading more photos…");
  else setSearchStatus("Searching Wikimedia Commons…");

  try {
    const parameters = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: term,
      gsrnamespace: "6",
      gsrlimit: String(SEARCH_PAGE_SIZE),
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "480",
      format: "json",
      origin: "*"
    });
    if (append && searchOffset !== null) parameters.set("gsroffset", String(searchOffset));
    const response = await fetch(`${WIKIMEDIA_API_URL}?${parameters}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Wikimedia Commons returned HTTP ${response.status}.`);
    const data = await response.json();
    if (requestId !== searchRequestId) return;
    if (data.error) throw new Error(data.error.info || "Wikimedia Commons returned an error.");

    const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
    const added = renderCommonsPhotos(pages);
    searchOffset = Number.isInteger(data.continue?.gsroffset) ? data.continue.gsroffset : null;
    const photoCount = document.querySelectorAll("#search-results .photo-tile").length;
    if (photoCount === 0) setSearchStatus("No photos found. Try a different search.");
    else if (added === 0 && append) setSearchStatus(`Showing ${photoCount} photos. No new images were in this result.`);
    else setSearchStatus(`Showing ${photoCount} photos. Open a source link for image and license details.`);
    loadMoreButton.hidden = searchOffset === null;
  } catch (error) {
    if (error.name === "AbortError" || requestId !== searchRequestId) return;
    console.error("Wikimedia Commons photo search failed.", error);
    setSearchStatus(append ? "Couldn't load more photos. Try again." : "Search failed. Check your connection and try again.");
    showToast("Wikimedia Commons search failed. Please try again.", true);
  } finally {
    if (requestId === searchRequestId) {
      searchLoading = false;
      searchController = null;
      loadMoreButton.disabled = false;
    }
  }
}

// Color conversion and clipboard
function renderConvertedColor() {
  if (!pickedColor) return;
  const values = formatValues(pickedColor);
  const list = document.querySelector("#format-list");
  list.replaceChildren();
  [["HEX", values.hex], ["RGB", values.rgb], ["HSL", values.hsl]].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "format-row";
    const type = document.createElement("span");
    type.textContent = label;
    const output = document.createElement("strong");
    output.textContent = value;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => copyText(value));
    row.append(type, output, copy);
    list.append(row);
  });
  document.querySelector("#selected-swatch").style.backgroundColor = values.hex;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(`Copied ${value} to clipboard.`);
  } catch (error) {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (copied) showToast(`Copied ${value} to clipboard.`);
    else showToast("Clipboard access is unavailable in this browser.", true);
  }
}

// Image upload, drag-and-drop, and pixel picking
tabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));

document.querySelector("#image-file").addEventListener("change", event => handleFile(event.target.files[0]));
const dropzone = document.querySelector("#dropzone");
["dragenter", "dragover"].forEach(eventName => dropzone.addEventListener(eventName, event => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach(eventName => dropzone.addEventListener(eventName, event => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
}));
dropzone.addEventListener("drop", event => handleFile(event.dataTransfer.files[0]));

canvas.addEventListener("click", event => {
  if (canvas.hidden || !canvas.width) return;
  try {
    sampleCanvasPoint(event);
  } catch (error) {
    console.error("Unable to sample this image pixel.", error);
    showToast("Couldn't read this pixel. Try uploading the image from your device.", true);
  }
});

document.querySelector("#photo-search").addEventListener("input", event => schedulePhotoSearch(event.target.value));
document.querySelector("#load-more-photos").addEventListener("click", () => searchPhotos(searchQuery, true));
document.querySelector("#load-url").addEventListener("click", () => {
  const field = document.querySelector("#image-url");
  let url;
  try {
    url = new URL(field.value.trim());
  } catch {
    document.querySelector("#url-error").textContent = "Enter a valid image URL to continue.";
    field.focus();
    return;
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    document.querySelector("#url-error").textContent = "For security, image links must use HTTP or HTTPS.";
    field.focus();
    return;
  }
  setMode("url");
  loadImage(url.href, url.pathname.split("/").pop() || "Online image", true);
});
document.querySelector("#image-url").addEventListener("keydown", event => {
  if (event.key === "Enter") document.querySelector("#load-url").click();
});

// Camera mode
document.querySelector("#start-camera").addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Camera access needs a secure page. Open this app on HTTPS or localhost.", true);
    return;
  }
  const requestId = ++cameraRequestId;
  document.querySelector("#start-camera").disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    if (requestId !== cameraRequestId || currentMode !== "camera") {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    activeCameraStream = stream;
    cameraVideo.srcObject = activeCameraStream;
    canvas.hidden = true;
    cameraVideo.hidden = false;
    emptyPreview.hidden = true;
    pickHint.hidden = false;
    await cameraVideo.play();
    if (requestId !== cameraRequestId || currentMode !== "camera") return;
    document.querySelector("#start-camera").disabled = true;
    document.querySelector("#capture-camera").disabled = false;
    setImageStatus("CAMERA LIVE");
    document.querySelector("#image-name").textContent = "Live camera · click to pick a color";
    imageDimensions.textContent = `${cameraVideo.videoWidth} × ${cameraVideo.videoHeight} px`;
  } catch (error) {
    if (requestId !== cameraRequestId) return;
    console.error("Camera access failed.", error);
    stopCamera();
    showToast(error.name === "NotAllowedError" ? "Camera permission was denied. Allow access in your browser settings and try again." : "Couldn't start the camera. Check that a camera is connected and try again.", true);
  }
});

cameraVideo.addEventListener("click", event => {
  if (!activeCameraStream || !cameraVideo.videoWidth) return;
  const point = pointInContainedMedia(event, cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight);
  if (!point) return;
  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = cameraVideo.videoWidth;
  scratchCanvas.height = cameraVideo.videoHeight;
  const scratchContext = scratchCanvas.getContext("2d", { willReadFrequently: true });
  scratchContext.drawImage(cameraVideo, 0, 0, scratchCanvas.width, scratchCanvas.height);
  const pixel = scratchContext.getImageData(point.x, point.y, 1, 1).data;
  selectColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
});

document.querySelector("#capture-camera").addEventListener("click", () => {
  if (!activeCameraStream || !cameraVideo.videoWidth) return;
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = cameraVideo.videoWidth;
  captureCanvas.height = cameraVideo.videoHeight;
  captureCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);
  const capturedImage = captureCanvas.toDataURL("image/png");
  stopCamera();
  loadImage(capturedImage, "Camera capture");
  showToast("Camera photo captured. Click it to sample a pixel.");
});

// Color converter
document.querySelector("#color-picker").addEventListener("input", event => {
  document.querySelector("#color-input").value = event.target.value.toUpperCase();
  applyConvertedColor();
});
document.querySelector("#convert-color").addEventListener("click", applyConvertedColor);
document.querySelector("#color-input").addEventListener("keydown", event => {
  if (event.key === "Enter") applyConvertedColor();
});
function applyConvertedColor() {
  const input = document.querySelector("#color-input");
  const parsed = parseColor(input.value);
  const error = document.querySelector("#converter-error");
  if (!parsed) {
    error.textContent = "Enter a valid HEX, RGB, or HSL color value.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  error.textContent = "";
  input.removeAttribute("aria-invalid");
  const hex = toHex(parsed);
  document.querySelector("#color-picker").value = hex;
  input.value = hex;
  selectColor(parsed);
  renderConvertedColor();
}

// Copy buttons and saved palette controls
document.querySelectorAll(".copy-button").forEach(button => {
  button.addEventListener("click", () => {
    if (!pickedColor) return;
    const values = formatValues(pickedColor);
    const kind = button.dataset.copy;
    const value = kind === "rgb" ? values.rgb : kind === "hsl" ? values.hsl : values.hex;
    copyText(value);
  });
});

document.querySelector("#clear-colors").addEventListener("click", () => {
  try {
    localStorage.removeItem("colorspectrum-recent");
  } catch (error) {
    console.warn("Could not clear the saved color palette.", error);
    showToast("Couldn't clear the saved palette in this browser.", true);
    return;
  }
  palette = [];
  renderPalette();
});

document.querySelector("#analyze-colors").addEventListener("click", () => {
  if (!currentImage) {
    showToast("Load an image before analyzing its colors.", true);
    return;
  }
  analyzeDominantColors(currentImage);
});

window.addEventListener("beforeunload", () => {
  stopCamera();
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
});

// Initial page state
renderPalette();
createFavicon();
loadImage(createSampleImage(), "Sample image");
