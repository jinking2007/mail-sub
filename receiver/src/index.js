import PostalMime from 'postal-mime';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function md5(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('MD5', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async email(message, env, ctx) {
    const parser = new PostalMime();
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parsed = await parser.parse(rawEmail);
    const timestamp = Date.now();
    const r2Key = `${timestamp}_${message.from}.json`;

    let tags = [];
    try {
        // 加了 try-catch 防止数据库报错导致收信失败
        const conf = await env.DB.prepare("SELECT value FROM config WHERE key = 'tags'").first();
        if(conf) tags = JSON.parse(conf.value);
    } catch(e) { console.log('Read config error', e); }

    const recipient = message.to.toLowerCase();
    let mailbox = 'Default';

    for (const tag of tags) {
        if (recipient.includes(tag.id.toLowerCase())) {
            mailbox = tag.id;
            break;
        }
    }

    await env.BUCKET.put(r2Key, JSON.stringify(parsed));

    try {
      await env.DB.prepare(
        `INSERT INTO emails (message_id, from_address, subject, snippet, received_at, r2_key, mailbox) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        parsed.messageId, message.from, parsed.subject || '(无标题)', 
        parsed.text ? parsed.text.substring(0, 100) : '', timestamp, r2Key, mailbox
      ).run();
    } catch (e) { console.error('Insert email error', e); }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // --- 登录接口 ---
    if (url.pathname === '/api/login' && request.method === 'POST') {
        const { password } = await request.json();
        
        // 默认密码: 123456 (MD5)
        let targetPass = 'e10adc3949ba59abbe56e057f20f883e'; 
        
        try {
            // 尝试从数据库读密码，如果表不存在，就忽略错误，使用上面定义的默认密码
            const dbPass = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
            if (dbPass) targetPass = dbPass.value;
        } catch(e) {
            console.log('Database not ready, using default password');
        }
        
        if (await md5(password) === targetPass) {
            const token = btoa(`admin:${Date.now()}`); 
            return new Response(JSON.stringify({ token }), { headers: corsHeaders });
        }
        return new Response('密码错误', { status: 401, headers: corsHeaders });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    try {
        if (url.pathname === '/api/list') {
            const box = url.searchParams.get('box');
            let sql = "SELECT * FROM emails";
            let params = [];
            if (box && box !== 'All') {
                sql += " WHERE mailbox = ?";
                params.push(box);
            }
            sql += " ORDER BY received_at DESC LIMIT 50";
            const { results } = await env.DB.prepare(sql).bind(...params).all();
            return Response.json(results, { headers: corsHeaders });
        }

        if (url.pathname === '/api/get') {
            const key = url.searchParams.get('key');
            const obj = await env.BUCKET.get(key);
            if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders });
            return Response.json(await obj.json(), { headers: corsHeaders });
        }

        if (url.pathname === '/api/settings/get') {
            const tags = await env.DB.prepare("SELECT value FROM config WHERE key = 'tags'").first();
            return Response.json({ tags: tags ? JSON.parse(tags.value) : [] }, { headers: corsHeaders });
        }

        if (url.pathname === '/api/settings/save' && request.method === 'POST') {
            const body = await request.json();
            if (body.tags) {
                await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('tags', ?)").bind(JSON.stringify(body.tags)).run();
            }
            if (body.newPassword) {
                const newHash = await md5(body.newPassword);
                await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('admin_password', ?)").bind(newHash).run();
            }
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
    } catch(e) {
        return new Response('Server Error: ' + e.message, { status: 500, headers: corsHeaders });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
