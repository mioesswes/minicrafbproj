const fs = require("fs");
const path = require("path");
const express = require("express");

const {
  initDatabase,
  getSettingsObject,
  setSetting,
  logSearch,
  touchUser,
  getRecentLogs,
  getUsers,
} = require("./src/db");
const { parseMarks } = require("./src/marks");

loadEnv(path.join(__dirname, ".env"));

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TELEGRAM_URL = process.env.TELEGRAM_URL || "https://t.me/";
const ROOT = __dirname;

let marksCache = {
  raw: "",
  parsed: {
    clans: [],
    stats: { totalClans: 0, totalTerritories: 0, updatedAt: null },
  },
};

let settingsCache = {
  captchaEnabled: true,
  hiddenSearchList: "",
  hiddenRules: [],
};

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

app.use("/public", express.static(path.join(ROOT, "public")));
app.use("/fonts", express.static(path.join(ROOT, "fonts")));
app.use("/assets", express.static(ROOT));

app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

app.get("/map", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "map.html"));
});

app.get("/adminkqa", requireBasicAuth, (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "admin.html"));
});

app.get("/api/bootstrap", (_req, res, next) => {
  try {
    res.json({
      stats: getVisibleStats(),
      captchaEnabled: settingsCache.captchaEnabled,
      telegramUrl: TELEGRAM_URL,
      worldBounds: { minX: -30000, maxX: 30000, minZ: -30000, maxZ: 30000 },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/clans", async (req, res, next) => {
  try {
    const query = String(req.query.query || "").trim();
    const leader = String(req.query.leader || "").trim();
    const results = filterClans(query, leader);

    if (query || leader) {
      const ip = getClientIp(req);
      const summary = results.length
        ? results
            .slice(0, 5)
            .map((clan) => clan.name)
            .join(", ")
        : "Ничего не найдено";

      await touchUser(ip);
      await logSearch(ip, [query, leader].filter(Boolean).join(" | "), summary);
    }

    res.json({
      query,
      leader,
      count: results.length,
      results,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/map-data", (req, res, next) => {
  try {
    const query = String(req.query.query || "").trim();
    const leader = String(req.query.leader || "").trim();
    const results = filterClans(query, leader);
    res.json({
      count: results.length,
      results,
      worldBounds: { minX: -30000, maxX: 30000, minZ: -30000, maxZ: 30000 },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/captcha/complete", async (_req, res, next) => {
  try {
    res.setHeader(
      "Set-Cookie",
      "goykarta_access=1; Path=/; Max-Age=2592000; SameSite=Lax"
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/overview", requireBasicAuth, async (_req, res, next) => {
  try {
    const [settings, logs, users] = await Promise.all([
      getSettingsObject(),
      getRecentLogs(100),
      getUsers(100),
    ]);
    hydrateSettingsCache(settings);

    res.json({
      settings: {
        captchaEnabled: settingsCache.captchaEnabled,
        marksUpdatedAt: settings.marks_updated_at || null,
        hiddenSearchList: settingsCache.hiddenSearchList,
      },
      stats: getVisibleStats(),
      logs,
      users,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/settings", requireBasicAuth, async (req, res, next) => {
  try {
    const captchaEnabled = req.body.captchaEnabled ? "1" : "0";
    const hiddenSearchList = String(req.body.hiddenSearchList || "");
    await setSetting("captcha_enabled", captchaEnabled);
    await setSetting("hidden_search_list", hiddenSearchList);
    hydrateSettingsCache({
      captcha_enabled: captchaEnabled,
      hidden_search_list: hiddenSearchList,
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/upload-marks", requireBasicAuth, async (req, res, next) => {
  try {
    const content = String(req.body.content || "");
    if (!content.trim()) {
      return res.status(400).json({ error: "Пустой marks.json" });
    }

    const parsed = parseMarks(content);
    if (!parsed.clans.length) {
      return res
        .status(400)
        .json({ error: "Не удалось извлечь территории из marks.json" });
    }

    const timestamp = new Date().toISOString();
    await setSetting("marks_json", content);
    await setSetting("marks_updated_at", timestamp);

    marksCache = {
      raw: content,
      parsed,
    };

    res.json({
      ok: true,
      stats: getVisibleStats(),
      updatedAt: timestamp,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "Внутренняя ошибка сервера",
    details: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

bootstrap()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`GOYKARTA running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start app:", error);
    process.exit(1);
  });

async function bootstrap() {
  const fileMarks = fs.readFileSync(path.join(ROOT, "marks.json"), "utf8");
  await initDatabase(fileMarks);
  const settings = await getSettingsObject();
  const raw = settings.marks_json || fileMarks;
  marksCache = { raw, parsed: parseMarks(raw) };
  hydrateSettingsCache(settings);
}

function filterClans(query, leader) {
  const q = normalize(query);
  const l = normalize(leader);

  return getVisibleClans().filter((clan) => {
    const matchesQuery = !q || clan.searchIndex.includes(q);
    const matchesLeader = !l || normalize(clan.leader).includes(l);
    return matchesQuery && matchesLeader;
  });
}

function getVisibleClans() {
  if (!settingsCache.hiddenRules.length) {
    return marksCache.parsed.clans;
  }

  return marksCache.parsed.clans.filter((clan) => {
    const haystack = normalize(
      [clan.id, clan.name, clan.tag, clan.leader, clan.searchIndex].join(" ")
    );
    return !settingsCache.hiddenRules.some((rule) => haystack.includes(rule));
  });
}

function getVisibleStats() {
  const clans = getVisibleClans();
  return {
    totalClans: clans.length,
    totalTerritories: clans.reduce(
      (sum, clan) => sum + clan.territoriesCount,
      0
    ),
    updatedAt: marksCache.parsed.stats.updatedAt,
  };
}

function hydrateSettingsCache(settings) {
  const hiddenSearchList = String(settings.hidden_search_list || "");
  settingsCache = {
    captchaEnabled: String(settings.captcha_enabled || "1") !== "0",
    hiddenSearchList,
    hiddenRules: hiddenSearchList
      .split(/\r?\n/)
      .map((item) => normalize(item))
      .filter(Boolean),
  };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return (
    req.socket.remoteAddress ||
    req.ip ||
    req.connection.remoteAddress ||
    "unknown"
  );
}

function requireBasicAuth(req, res, next) {
  const expectedLogin = process.env.ADMIN_LOGIN || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin";
  const header = req.headers.authorization || "";

  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="GOYKARTA Admin"');
    return res.status(401).send("Authentication required");
  }

  const [login, password] = Buffer.from(header.slice(6), "base64")
    .toString("utf8")
    .split(":");

  if (login !== expectedLogin || password !== expectedPassword) {
    res.setHeader("WWW-Authenticate", 'Basic realm="GOYKARTA Admin"');
    return res.status(401).send("Invalid credentials");
  }

  next();
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^"(.*)"$/, "$1");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
