function parseMarks(raw) {
  const data = JSON.parse(raw);
  const claimsLayer = Array.isArray(data)
    ? data.find((item) => item.id === "chunkclaim")
    : null;

  if (!claimsLayer || !Array.isArray(claimsLayer.markers)) {
    return {
      clans: [],
      stats: {
        totalClans: 0,
        totalTerritories: 0,
        updatedAt: null,
      },
    };
  }

  const clanMap = new Map();

  claimsLayer.markers.forEach((marker, index) => {
    if (!marker || marker.type !== "polygon" || !Array.isArray(marker.points)) {
      return;
    }

    const info = parsePopup(marker.popup || "");
    const bounds = getBounds(marker.points);
    const center = {
      x: Math.round((bounds.minX + bounds.maxX) / 2),
      z: Math.round((bounds.minZ + bounds.maxZ) / 2),
    };
    const tag = getClanTag(info.name);
    const key = `${normalize(info.name)}::${normalize(info.leader)}`;

    if (!clanMap.has(key)) {
      clanMap.set(key, {
        id: slugify(`${info.name}-${info.leader || index}`),
        name: info.name,
        tag,
        leader: info.leader,
        members: info.members,
        chunks: info.chunks,
        territoriesCount: 0,
        center,
        bounds: { ...bounds },
        coordinateText: "",
        searchIndex: normalize(
          [info.name, tag ? `[${tag}]` : "", info.leader].join(" ")
        ),
        territories: [],
      });
    }

    const clan = clanMap.get(key);
    clan.members = Math.max(clan.members, info.members);
    clan.chunks = Math.max(clan.chunks, info.chunks);
    clan.territoriesCount += 1;
    clan.territories.push({
      id: `${clan.id}-${clan.territoriesCount}`,
      color: marker.color || marker.fillColor || "#7fb9ff",
      fillColor: marker.fillColor || marker.color || "#a7d0ff",
      points: marker.points,
      bounds,
      center,
    });
    clan.bounds = mergeBounds(clan.bounds, bounds);
    clan.center = {
      x: Math.round((clan.bounds.minX + clan.bounds.maxX) / 2),
      z: Math.round((clan.bounds.minZ + clan.bounds.maxZ) / 2),
    };
    clan.coordinateText = `X: ${clan.center.x}, Z: ${clan.center.z}`;
  });

  const clans = Array.from(clanMap.values())
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((clan) => ({
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      leader: clan.leader,
      members: clan.members,
      chunks: clan.chunks,
      territoriesCount: clan.territoriesCount,
      center: clan.center,
      bounds: clan.bounds,
      coordinateText: clan.coordinateText,
      searchIndex: clan.searchIndex,
      territories: clan.territories,
    }));

  return {
    clans,
    stats: {
      totalClans: clans.length,
      totalTerritories: claimsLayer.markers.length,
      updatedAt: claimsLayer.timestamp || null,
    },
  };
}

function parsePopup(popupHtml) {
  const nameMatch = popupHtml.match(/<b>(.*?)<\/b>/i);
  const text = popupHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  const lines = text.split("\n").map((line) => line.trim());
  const name = (nameMatch ? stripTags(nameMatch[1]) : lines[0]) || "Неизвестный клан";
  const leader = extractLineValue(lines, "Глава");
  const members = toNumber(extractLineValue(lines, "Участников"));
  const chunks = toNumber(extractLineValue(lines, "Чанков"));

  return {
    name,
    leader,
    members,
    chunks,
  };
}

function extractLineValue(lines, label) {
  const row = lines.find((line) => normalize(line).startsWith(normalize(label)));
  if (!row) {
    return "";
  }
  return row.split(":").slice(1).join(":").trim();
}

function getClanTag(name) {
  const match = String(name).match(/^\[([^\]]+)\]/);
  return match ? match[1] : "";
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, "").trim();
}

function toNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function getBounds(rings) {
  const flatPoints = rings.flat();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  flatPoints.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });

  return { minX, maxX, minZ, maxZ };
}

function mergeBounds(a, b) {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

module.exports = {
  parseMarks,
};
