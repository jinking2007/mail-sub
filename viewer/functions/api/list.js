export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const box = url.searchParams.get('box');
  
  let sql = "SELECT * FROM emails";
  let params = [];
  
  if (box && box !== 'All') {
    sql += " WHERE mailbox = ?";
    params.push(box);
  }
  
  sql += " ORDER BY received_at DESC LIMIT 50";
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return Response.json(results);
}