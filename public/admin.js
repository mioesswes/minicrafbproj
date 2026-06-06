const captchaToggle = document.getElementById("captchaToggle");
const adminStats = document.getElementById("adminStats");
const usersTable = document.getElementById("usersTable");
const logsTable = document.getElementById("logsTable");
const marksFile = document.getElementById("marksFile");
const uploadMarksButton = document.getElementById("uploadMarksButton");
const uploadStatus = document.getElementById("uploadStatus");

initAdmin();

async function initAdmin() {
  await loadOverview();
  captchaToggle.addEventListener("change", saveSettings);
  uploadMarksButton.addEventListener("click", uploadMarks);
}

async function loadOverview() {
  const data = await fetchJson("/api/admin/overview");
  captchaToggle.checked = data.settings.captchaEnabled;
  adminStats.innerHTML = `
    <span>Всего кланов: ${data.stats.totalClans}</span>
    <span>Всего территорий: ${data.stats.totalTerritories}</span>
    <span>Обновлено: ${formatDate(data.settings.marksUpdatedAt || data.stats.updatedAt)}</span>
  `;
  renderUsers(data.users);
  renderLogs(data.logs);
}

async function saveSettings() {
  await fetchJson("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify({ captchaEnabled: captchaToggle.checked }),
  });
}

async function uploadMarks() {
  const file = marksFile.files[0];
  if (!file) {
    uploadStatus.textContent = "Сначала выберите файл marks.json.";
    return;
  }

  uploadStatus.textContent = "Читаю и загружаю файл...";
  const content = await file.text();
  const response = await fetchJson("/api/admin/upload-marks", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  uploadStatus.textContent = `Успешно обновлено. Кланов: ${response.stats.totalClans}, территорий: ${response.stats.totalTerritories}`;
  await loadOverview();
}

function renderUsers(users) {
  usersTable.innerHTML = users.length
    ? users
        .map(
          (user) => `
            <tr>
              <td>${escapeHtml(user.ip)}</td>
              <td>${user.query_count}</td>
              <td>${formatDate(user.last_active)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="3">Пока нет данных.</td></tr>`;
}

function renderLogs(logs) {
  logsTable.innerHTML = logs.length
    ? logs
        .map(
          (log) => `
            <tr>
              <td>${escapeHtml(log.ip)}</td>
              <td>${formatDate(log.created_at)}</td>
              <td>${escapeHtml(log.query)}</td>
              <td>${escapeHtml(log.result)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="4">Пока нет логов.</td></tr>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "Неизвестно";
  const date = new Date(Number(value) || value);
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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
