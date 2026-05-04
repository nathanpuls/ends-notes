export async function onRequestPost({ request, env }) {
  const { content } = await request.json();

  const id = crypto.randomUUID().slice(0, 8);

  await env.ENDS_NOTES.put(id, content);

  return Response.json({ id });
}
