function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      ...(init.headers || {}),
    },
  });
}

function makeId(length = 8) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeSlug(value, fallback) {
  const slug = value.trim().replace(/^\/+|\/+$/g, "");

  return slug || fallback;
}

function columnName(index) {
  let name = "";
  let number = index + 1;

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

async function loadSheetRows(sheetId) {
  if (!/^[A-Za-z0-9_-]+$/.test(sheetId)) {
    throw new Error("Invalid sheet id");
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  const response = await fetch(sheetUrl, {
    headers: {
      "User-Agent": "ends.at",
    },
  });

  if (!response.ok) {
    throw new Error("Could not load sheet");
  }

  return parseCsv(await response.text());
}

function sheetEntriesFromRows(rows) {
  const filledCells = rows.flatMap((row, rowIndex) =>
    row
      .map((cell, columnIndex) => ({
        value: cell.trim(),
        row: rowIndex + 1,
        column: columnName(columnIndex),
      }))
      .filter((cell) => cell.value)
  );

  if (filledCells.length === 1) {
    const cell = filledCells[0];

    return [{
      markdown: cell.value,
      slug: normalizeSlug("", `cell-${cell.column.toLowerCase()}${cell.row}`),
      label: `Cell ${cell.column}${cell.row}`,
      row: cell.row,
    }];
  }

  const slugCounts = new Map();

  return rows
    .slice(1)
    .map((row, index) => {
      const markdown = (row[0] || "").trim();
      const providedSlug = (row[1] || "").trim();

      if (!markdown) {
        return null;
      }

      const rowNumber = index + 2;
      const baseSlug = normalizeSlug(providedSlug, `row-${rowNumber}`);
      const previousCount = slugCounts.get(baseSlug) || 0;
      const slug = previousCount ? `${baseSlug}-${rowNumber}` : baseSlug;
      slugCounts.set(baseSlug, previousCount + 1);

      return {
        markdown,
        slug,
        label: slug,
        row: rowNumber,
      };
    })
    .filter(Boolean);
}

function sheetTitle(rows) {
  return (rows[0]?.[0] || "").trim() || "Sheet pages";
}

function sheetIndexMarkdown(sheetId, title, entries) {
  const links = entries
    .map((entry) => `[${entry.label}](/s/${sheetId}/${encodeURIComponent(entry.slug)})`)
    .join("\n\n");

  return `# ${title}\n\n${links}`;
}

function sheetPageMarkdown(sheetId, markdown) {
  return `<a class="sheet-back-link" href="/s/${sheetId}" aria-label="Back to sheet index" title="Back">←</a>\n\n${markdown}`;
}

async function handleSheetApi(url) {
  const match = url.pathname.match(/^\/api\/sheet\/([A-Za-z0-9_-]+)(?:\/([^/]+))?$/);

  if (!match) {
    return json({ error: "Not found" }, { status: 404 });
  }

  try {
    const sheetId = match[1];
    const requestedSlug = match[2] ? decodeURIComponent(match[2]) : null;
    const rows = await loadSheetRows(sheetId);
    const title = sheetTitle(rows);
    const entries = sheetEntriesFromRows(rows);

    if (!entries.length) {
      return json({ error: "No Markdown found in column A" }, { status: 404 });
    }

    if (requestedSlug) {
      const entry = entries.find((item) => item.slug === requestedSlug);

      if (!entry) {
        return json({ error: "Sheet page not found" }, { status: 404 });
      }

      return json({
        id: sheetId,
        slug: entry.slug,
        markdown: sheetPageMarkdown(sheetId, entry.markdown),
        row: entry.row,
      });
    }

    if (entries.length === 1) {
      return json({
        id: sheetId,
        slug: entries[0].slug,
        markdown: entries[0].markdown,
        row: entries[0].row,
      });
    }

    return json({
      id: sheetId,
      markdown: sheetIndexMarkdown(sheetId, title, entries),
      pages: entries.map(({ markdown, ...entry }) => entry),
    });
  } catch (error) {
    return json({ error: error.message || "Could not load sheet" }, { status: 400 });
  }
}

async function hashMarkdown(markdown) {
  const bytes = new TextEncoder().encode(markdown);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function storeDocument(env, markdown) {
  const hash = await hashMarkdown(markdown);
  const existingId = await env.ENDS_NOTES.get(`hash:${hash}`);

  if (existingId) {
    return existingId;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = makeId();
    const key = `md:${id}`;
    const existing = await env.ENDS_NOTES.get(key);

    if (!existing) {
      const payload = JSON.stringify({
        markdown,
        createdAt: new Date().toISOString(),
        hash,
      });

      await env.ENDS_NOTES.put(key, payload);
      await env.ENDS_NOTES.put(`hash:${hash}`, id);
      return id;
    }
  }

  throw new Error("Could not generate a unique id");
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname.startsWith("/api/sheet/")) {
    return handleSheetApi(url);
  }

  if (request.method === "POST" && url.pathname === "/api/publish") {
    const body = await request.json().catch(() => null);
    const markdown = typeof body?.markdown === "string" ? body.markdown : "";

    if (!markdown.trim()) {
      return json({ error: "Markdown is required" }, { status: 400 });
    }

    const id = await storeDocument(env, markdown);
    return json({
      id,
      url: `${url.origin}/p/${id}`,
    });
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/doc/")) {
    const id = url.pathname.replace("/api/doc/", "").trim();

    if (!id) {
      return json({ error: "Document id is required" }, { status: 400 });
    }

    const record = await env.ENDS_NOTES.get(`md:${id}`, "json");

    if (!record || typeof record.markdown !== "string") {
      return json({ error: "Not found" }, { status: 404 });
    }

    return json({
      id,
      markdown: record.markdown,
      createdAt: record.createdAt || null,
    });
  }

  return json({ error: "Not found" }, { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    if (url.pathname === "/worker.js" || url.pathname === "/wrangler.toml") {
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname.startsWith("/p/") || url.pathname.startsWith("/s/") || url.pathname === "/new" || url.pathname === "/sheet" || url.pathname === "/about" || url.pathname === "/example") {
      const assetUrl = new URL("/", url.origin);
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }

    return env.ASSETS.fetch(request);
  },
};
