export async function onRequestGet({ params, env }) {
  const content = await env.ENDS_NOTES.get(params.id);

  if (!content) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(content, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
