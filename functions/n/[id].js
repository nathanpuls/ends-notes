function escapeForInlineScript(text) {
  return JSON.stringify(text)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function renderNotePage(content) {
  const serializedContent = escapeForInlineScript(content);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Markdown Reference Viewer</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

    <style>
      body {
        margin: 0;
        padding: 32px 24px;
        background: #ffffff;
        color: #111827;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      .markdown-body {
        max-width: 720px;
        margin: 0 auto;
        font-size: 16px;
        line-height: 1.65;
      }

      .markdown-body p { margin: 0 0 12px; }
      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3,
      .markdown-body h4 {
        font-weight: 600;
        line-height: 1.25;
      }
      .markdown-body h1 { font-size: 28px; margin: 22px 0 10px; }
      .markdown-body h2 { font-size: 22px; margin: 36px 0 10px; }
      .markdown-body h3 { font-size: 18px; margin: 26px 0 8px; }

      .markdown-body a {
        color: #111827;
        text-decoration: underline;
        text-decoration-color: #9CA3AF;
        text-underline-offset: 3px;
      }

      .markdown-body code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 14px;
        background: #F3F4F6;
        padding: 2px 5px;
        border-radius: 4px;
      }

      .markdown-body pre {
        background: #F3F4F6;
        color: #111827;
        padding: 12px 14px;
        border-radius: 10px;
        overflow-x: auto;
        font-size: 14px;
        line-height: 1.5;
      }

      .markdown-body blockquote {
        margin: 18px 0;
        padding: 6px 0 6px 20px;
        border-left: 2px solid #E5E7EB;
        color: #111827;
      }

      .markdown-body table {
        border-collapse: collapse;
        width: 100%;
        margin: 12px 0;
        font-size: 14px;
      }

      .markdown-body th,
      .markdown-body td {
        border: 1px solid #E5E7EB;
        padding: 8px 10px;
        text-align: left;
        background: transparent;
      }

      .markdown-body th { font-weight: 600; }
      .markdown-body hr {
        border: none;
        border-top: 1px solid #E5E7EB;
        margin: 32px 0;
      }
    </style>
  </head>

  <body>
    <article id="preview" class="markdown-body"></article>

    <script>
      const markdown = ${serializedContent};
      document.getElementById("preview").innerHTML = marked.parse(markdown);
    </script>
  </body>
</html>`;
}

export async function onRequestGet({ params, env }) {
  const content = await env.ENDS_NOTES.get(params.id);

  if (!content) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(renderNotePage(content), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
