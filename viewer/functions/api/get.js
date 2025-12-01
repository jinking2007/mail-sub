export async function onRequest(context) {
  const { request, env } = context;
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return new Response('Missing key', {status: 400});
  
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not found', {status: 404});
  
  return Response.json(await obj.json());
}