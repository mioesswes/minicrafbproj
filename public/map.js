const queryInput = document.getElementById("mapQueryInput");
const leaderInput = document.getElementById("mapLeaderInput");
const fitWorldButton = document.getElementById("fitWorldButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const mapStatus = document.getElementById("mapStatus");
const mapResults = document.getElementById("mapResults");
const mapStatsPill = document.getElementById("mapStatsPill");
const captchaModal = document.getElementById("mapCaptchaModal");
const captchaButton = document.getElementById("mapCaptchaButton");

let map;
let featureLayers = [];
let bootstrapData;

const WORLD_SCALE = 24;

initMapPage();

async function initMapPage() {
  bootstrapData = await fetchJson("/api/bootstrap");
  setupCaptcha();
  createMap();
  applyQueryParams();
  await searchAndRender();

  const debouncedSearch = debounce(searchAndRender, 220);
  queryInput.addEventListener("input", debouncedSearch);
  leaderInput.addEventListener("input", debouncedSearch);
  fitWorldButton.addEventListener("click", fitWorld);
  fullscreenButton.addEventListener("click", toggleFullscreen);
  captchaButton.addEventListener("click", completeCaptcha);
  window.addEventListener("resize", () => map.invalidateSize());
  document.addEventListener("fullscreenchange", () => {
    setTimeout(() => map.invalidateSize(), 150);
  });
}

function createMap() {
  map = L.map("map", {
    preferCanvas: true,
    crs: L.CRS.Simple,
    zoomControl: true,
    attributionControl: false,
    minZoom: -2,
    maxZoom: 6,
    renderer: L.canvas(),
  });

  const bounds = worldToLeafletBounds(bootstrapData.worldBounds);
  L.rectangle(bounds, {
    color: "#88acd5",
    weight: 1.6,
    fill: true,
    fillColor: "#eef5fb",
    fillOpacity: 0.86,
    dashArray: "8 10",
  }).addTo(map);

  map.setMaxBounds(bounds);
  map.invalidateSize();
  fitWorld();
}

function fitWorld() {
  map.fitBounds(worldToLeafletBounds(bootstrapData.worldBounds), {
    padding: [36, 36],
  });
}

async function searchAndRender() {
  const params = new URLSearchParams();
  if (queryInput.value.trim()) params.set("query", queryInput.value.trim());
  if (leaderInput.value.trim()) params.set("leader", leaderInput.value.trim());

  mapStatus.textContent = "Загрузка территорий...";
  const data = await fetchJson(`/api/map-data?${params.toString()}`);
  mapStatsPill.textContent = `Кланов: ${data.count}`;
  mapStatus.textContent = data.count
    ? data.count > 24
      ? `Найдено кланов: ${data.count} · показаны первые 24`
      : `Найдено кланов: ${data.count}`
    : "По этому запросу ничего не найдено.";

  clearMapFeatures();
  renderResults(data.results);
  drawFeatures(data.results);
  focusFromQuery(data.results);
  updateHistory(params);
}

function drawFeatures(clans) {
  const drawnBounds = [];

  clans.forEach((clan) => {
    clan.territories.forEach((territory) => {
      const polygon = L.polygon(
        territory.points.map((ring) => ring.map((point) => toMapPoint(point))),
        {
          color: territory.color || "#5f97da",
          fillColor: territory.fillColor || "#8dc0ff",
          fillOpacity: 0.56,
          weight: 1.1,
        }
      );

      polygon
        .bindTooltip(`${clan.name} · ${clan.coordinateText}`, {
          sticky: true,
          opacity: 0.96,
        })
        .bindPopup(
          `<strong>${clan.name}</strong><br>Глава: ${clan.leader || "Не указан"}<br>Участники: ${clan.members}<br>Чанки: ${clan.chunks}`
        );

      polygon.on("mouseover", () => polygon.setStyle({ fillOpacity: 0.8, weight: 1.8 }));
      polygon.on("mouseout", () => polygon.setStyle({ fillOpacity: 0.56, weight: 1.1 }));
      polygon.addTo(map);
      featureLayers.push(polygon);
      drawnBounds.push(polygon.getBounds());
    });
  });

  if (!clans.length) {
    fitWorld();
    return;
  }

  if (clans.length === 1) {
    zoomToClan(clans[0]);
    return;
  }

  const mergedBounds = mergeLeafletBounds(drawnBounds);
  if (mergedBounds) {
    map.fitBounds(mergedBounds, { padding: [36, 36], maxZoom: 4 });
  }
}

function renderResults(clans) {
  if (!clans.length) {
    mapResults.innerHTML = `<div class="empty-state">Нет совпадений для отображения.</div>`;
    return;
  }

  mapResults.innerHTML = "";
  clans.slice(0, 24).forEach((clan) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "map-result";
    item.innerHTML = `
      <h3 class="minecraft-text">${clan.name}</h3>
      <p>Глава: ${clan.leader || "Не указан"}</p>
      <p>Участники: ${clan.members} · Чанки: ${clan.chunks}</p>
      <p>${clan.coordinateText}</p>
    `;
    item.addEventListener("click", () => zoomToClan(clan));
    mapResults.appendChild(item);
  });
}

function zoomToClan(clan) {
  map.fitBounds(toClanBounds(clan.bounds), { padding: [50, 50], maxZoom: 5 });
}

function clearMapFeatures() {
  featureLayers.forEach((layer) => map.removeLayer(layer));
  featureLayers = [];
}

function focusFromQuery(results) {
  const params = new URLSearchParams(window.location.search);
  const focusId = params.get("focus");
  if (!focusId) {
    return;
  }

  const clan = results.find((item) => item.id === focusId);
  if (clan) {
    zoomToClan(clan);
  }
}

function applyQueryParams() {
  const params = new URLSearchParams(window.location.search);
  queryInput.value = params.get("query") || "";
  leaderInput.value = params.get("leader") || "";
}

function updateHistory(params) {
  const current = new URLSearchParams(window.location.search);
  const focus = current.get("focus");
  if (focus) {
    params.set("focus", focus);
  }
  const next = params.toString();
  window.history.replaceState({}, "", next ? `/map?${next}` : "/map");
}

function setupCaptcha() {
  const passed = document.cookie.includes("goykarta_access=1");
  if (bootstrapData.captchaEnabled && !passed) {
    captchaModal.classList.remove("hidden");
  }
}

async function completeCaptcha() {
  window.open(bootstrapData.telegramUrl, "_blank", "noopener,noreferrer");
  await fetchJson("/api/captcha/complete", { method: "POST" });
  document.cookie = "goykarta_access=1; path=/; max-age=2592000; SameSite=Lax";
  captchaModal.classList.add("hidden");
}

function toggleFullscreen() {
  const frame = document.querySelector(".map-grid-frame");
  if (!document.fullscreenElement) {
    frame.requestFullscreen();
    return;
  }
  document.exitFullscreen();
}

function worldToLeafletBounds(bounds) {
  return [
    [bounds.minZ / WORLD_SCALE, bounds.minX / WORLD_SCALE],
    [bounds.maxZ / WORLD_SCALE, bounds.maxX / WORLD_SCALE],
  ];
}

function toMapPoint(point) {
  return [point.z / WORLD_SCALE, point.x / WORLD_SCALE];
}

function toClanBounds(bounds) {
  return [
    [bounds.minZ / WORLD_SCALE, bounds.minX / WORLD_SCALE],
    [bounds.maxZ / WORLD_SCALE, bounds.maxX / WORLD_SCALE],
  ];
}

function mergeLeafletBounds(boundsList) {
  if (!boundsList.length) {
    return null;
  }
  return boundsList.reduce((acc, bounds) => (acc ? acc.extend(bounds) : bounds), null);
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
