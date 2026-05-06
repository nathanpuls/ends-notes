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

    if (url.pathname.startsWith("/p/")) {
      const assetUrl = new URL("/", url.origin);
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }

    return env.ASSETS.fetch(request);
  },
};
