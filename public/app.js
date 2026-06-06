const statsInline = document.getElementById("statsInline");
const resultCount = document.getElementById("resultCount");
const results = document.getElementById("results");
const queryInput = document.getElementById("queryInput");
const leaderInput = document.getElementById("leaderInput");
const clearSearch = document.getElementById("clearSearch");
const telegramButton = document.getElementById("telegramButton");
const mapButton = document.getElementById("mapButton");
const openMapLink = document.getElementById("openMapLink");
const captchaModal = document.getElementById("captchaModal");
const captchaButton = document.getElementById("captchaButton");
const cardTemplate = document.getElementById("cardTemplate");

let bootstrapData = null;

init();

async function init() {
  bootstrapData = await fetchJson("/api/bootstrap");
  renderStats(bootstrapData.stats);
  setupCaptcha();
  telegramButton.href = bootstrapData.telegramUrl;
  updateMapLinks();
  bindEvents();
}

function bindEvents() {
  const debouncedSearch = debounce(runSearch, 240);
  queryInput.addEventListener("input", () => {
    updateMapLinks();
    debouncedSearch();
  });
  leaderInput.addEventListener("input", () => {
    updateMapLinks();
    debouncedSearch();
  });
  clearSearch.addEventListener("click", () => {
    queryInput.value = "";
    leaderInput.value = "";
    results.innerHTML = "";
    resultCount.textContent = "Пока пусто. Начните вводить запрос.";
    updateMapLinks();
  });
  captchaButton.addEventListener("click", completeCaptcha);
  mapButton.addEventListener("click", updateMapLinks);
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

async function runSearch() {
  const query = queryInput.value.trim();
  const leader = leaderInput.value.trim();

  if (!query && !leader) {
    results.innerHTML = "";
    resultCount.textContent = "Пока пусто. Начните вводить запрос.";
    return;
  }

  resultCount.textContent = "Поиск...";
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (leader) params.set("leader", leader);

  const data = await fetchJson(`/api/clans?${params.toString()}`);
  resultCount.textContent = `Найдено кланов: ${data.count}`;
  renderResults(data.results, params);
}

function renderStats(stats) {
  statsInline.innerHTML = `
    <span>Всего кланов: ${stats.totalClans}</span>
    <span>Всего территорий: ${stats.totalTerritories}</span>
    <span>Последнее обновление карты: ${formatUpdated(stats.updatedAt)}</span>
  `;
}

function renderResults(clans, params) {
  if (!clans.length) {
    results.innerHTML = `<div class="empty-state">По этому запросу ничего не найдено.</div>`;
    return;
  }

  results.innerHTML = "";
  clans.forEach((clan) => {
    const fragment = cardTemplate.content.cloneNode(true);
    fragment.querySelector(".clan-name").textContent = clan.name;
    fragment.querySelector(".clan-leader").textContent = `Глава: ${clan.leader || "Не указан"}`;
    fragment.querySelector(".members").textContent = `Участники: ${clan.members}`;
    fragment.querySelector(".chunks").textContent = `Чанки: ${clan.chunks}`;
    fragment.querySelector(".territories").textContent = `Территории: ${clan.territoriesCount}`;
    fragment.querySelector(".coords").textContent = `${clan.coordinateText} · Границы X ${clan.bounds.minX}...${clan.bounds.maxX} / Z ${clan.bounds.minZ}...${clan.bounds.maxZ}`;

    const copyButton = fragment.querySelector(".copy-button");
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(clan.coordinateText);
      copyButton.textContent = "СКОПИРОВАНО";
      setTimeout(() => {
        copyButton.textContent = "СКОПИРОВАТЬ КООРДИНАТЫ";
      }, 1400);
    });

    const mapLink = fragment.querySelector(".map-link");
    const nextParams = new URLSearchParams(params);
    nextParams.set("focus", clan.id);
    mapLink.href = `/map?${nextParams.toString()}`;

    results.appendChild(fragment);
  });
}

function updateMapLinks() {
  const params = new URLSearchParams();
  if (queryInput.value.trim()) params.set("query", queryInput.value.trim());
  if (leaderInput.value.trim()) params.set("leader", leaderInput.value.trim());
  const href = params.toString() ? `/map?${params.toString()}` : "/map";
  mapButton.href = href;
  openMapLink.href = href;
}

function formatUpdated(value) {
  if (!value) return "Неизвестно";
  const date = new Date(Number(value) || value);
  return new Intl.DateTimeFormat("ru-RU").format(date);
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
