const queryInput = document.getElementById("mapQueryInput");
const leaderInput = document.getElementById("mapLeaderInput");
const searchButton = document.getElementById("mapSearchButton");
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
let currentResults = [];

initMapPage();

async function initMapPage() {
  bootstrapData = await fetchJson("/api/bootstrap");
  setupCaptcha();
  createMap();
  applyQueryParams();
  await searchAndRender();

  searchButton.addEventListener("click", searchAndRender);
  fitWorldButton.addEventListener("click", fitWorld);
  fullscreenButton.addEventListener("click", toggleFullscreen);
  captchaButton.addEventListener("click", completeCaptcha);
}

function createMap() {
  map = L.map("map", {
    crs: L.CRS.Simple,
    zoomControl: true,
    attributionControl: false,
    minZoom: -2,
    maxZoom: 4,
  });

  const bounds = worldToLeafletBounds(bootstrapData.worldBounds);
  L.rectangle(bounds, {
    color: "rgba(72, 119, 179, 0.32)",
    weight: 1.2,
    fill: false,
    dashArray: "6 8",
  }).addTo(map);

  fitWorld();
}

function fitWorld() {
  map.fitBounds(worldToLeafletBounds(bootstrapData.worldBounds), {
    padding: [30, 30],
  });
}

async function searchAndRender() {
  const params = new URLSearchParams();
  if (queryInput.value.trim()) params.set("query", queryInput.value.trim());
  if (leaderInput.value.trim()) params.set("leader", leaderInput.value.trim());

  mapStatus.textContent = "Загрузка территорий...";
  const data = await fetchJson(`/api/map-data?${params.toString()}`);
  currentResults = data.results;
  mapStatsPill.textContent = `Кланов: ${data.count}`;
  mapStatus.textContent = data.count
    ? `Найдено кланов: ${data.count}`
    : "По этому запросу ничего не найдено.";

  clearMapFeatures();
  renderResults(data.results);
  drawFeatures(data.results);
  focusFromQuery(data.results);
  updateHistory(params);
}

function drawFeatures(clans) {
  clans.forEach((clan) => {
    clan.territories.forEach((territory) => {
      const polygon = L.polygon(
        territory.points.map((ring) => ring.map((point) => [point.z, point.x])),
        {
          color: territory.color,
          fillColor: territory.fillColor,
          fillOpacity: 0.28,
          weight: 1.5,
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

      polygon.on("mouseover", () => polygon.setStyle({ fillOpacity: 0.42, weight: 2.3 }));
      polygon.on("mouseout", () => polygon.setStyle({ fillOpacity: 0.28, weight: 1.5 }));
      polygon.addTo(map);
      featureLayers.push(polygon);
    });
  });

  if (clans.length === 1) {
    zoomToClan(clans[0]);
  }
}

function renderResults(clans) {
  if (!clans.length) {
    mapResults.innerHTML = `<div class="empty-state">Нет совпадений для отображения.</div>`;
    return;
  }

  mapResults.innerHTML = "";
  clans.forEach((clan) => {
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
  const bounds = [
    [clan.bounds.minZ, clan.bounds.minX],
    [clan.bounds.maxZ, clan.bounds.maxX],
  ];
  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 3 });
}

function clearMapFeatures() {
  featureLayers.forEach((layer) => map.removeLayer(layer));
  featureLayers = [];
}

function focusFromQuery(results) {
  const params = new URLSearchParams(window.location.search);
  const focusId = params.get("focus");
  if (!focusId) {
    if (results.length === 1) {
      zoomToClan(results[0]);
    }
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
    [bounds.minZ, bounds.minX],
    [bounds.maxZ, bounds.maxX],
  ];
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
