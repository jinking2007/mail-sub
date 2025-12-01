import PostalMime from 'postal-mime';

// 简单的 CORS 头，允许跨域
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 工具：MD5 哈希 (用于简单密码验证)
async function md5(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('MD5', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  // --------------------------
  // 1. 邮件接收逻辑 (Email Receiver)
  // --------------------------
  async email(message, env, ctx) {
    const parser = new PostalMime();
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parsed = await parser.parse(rawEmail);
    const timestamp = Date.now();
    const r2Key = `${timestamp}_${message.from}.json`;

    // --- 动态分类逻辑 ---
    // 从数据库获取标签配置，如果获取失败则用默认
    let tags = [];
    try {
        const conf = await env.DB.prepare("SELECT value FROM config WHERE key = 'tags'").first();
        if(conf) tags = JSON.parse(conf.value);
    } catch(e) {}

    const recipient = message.to.toLowerCase();
    let mailbox = 'Default';

    // 简单规则：如果收件人包含标签名，就归类。
    // 你可以在这里扩展更复杂的规则逻辑
    for (const tag of tags) {
        if (recipient.includes(tag.id.toLowerCase())) {
            mailbox = tag.id;
            break;
        }
    }
    // -------------------

    await env.BUCKET.put(r2Key, JSON.stringify(parsed));

    try {
      await env.DB.prepare(
        `INSERT INTO emails (message_id, from_address, subject, snippet, received_at, r2_key, mailbox) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        parsed.messageId, message.from, parsed.subject || '(无标题)', 
        parsed.text ? parsed.text.substring(0, 100) : '', timestamp, r2Key, mailbox
      ).run();
    } catch (e) { console.error(e); }
  },

  // --------------------------
  // 2. HTTP API 逻辑 (Frontend API)
  // --------------------------
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // --- 开放接口：登录 ---
    if (url.pathname === '/api/login' && request.method === 'POST') {
        const { password } = await request.json();
        const dbPass = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
        
        // 默认密码处理
        const targetPass = dbPass ? dbPass.value : 'e10adc3949ba59abbe56e057f20f883e'; // default: 123456
        
        if (await md5(password) === targetPass) {
            // 生成一个简单的 Token (实际可用 JWT，这里用简单的 base64 模拟)
            const token = btoa(`admin:${Date.now()}`); 
            return new Response(JSON.stringify({ token }), { headers: corsHeaders });
        }
        return new Response('密码错误', { status: 401, headers: corsHeaders });
    }

    // --- 鉴权拦截 (所有下方接口都需要 Token) ---
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // --- 业务接口 ---
    
    // 1. 获取邮件列表
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

    // 2. 获取邮件详情
    if (url.pathname === '/api/get') {
      const key = url.searchParams.get('key');
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders });
      return Response.json(await obj.json(), { headers: corsHeaders });
    }

    // 3. 获取设置
    if (url.pathname === '/api/settings/get') {
        const tags = await env.DB.prepare("SELECT value FROM config WHERE key = 'tags'").first();
        return Response.json({
            tags: tags ? JSON.parse(tags.value) : []
        }, { headers: corsHeaders });
    }

    // 4. 保存设置 (修改标签 或 修改密码)
    if (url.pathname === '/api/settings/save' && request.method === 'POST') {
        const body = await request.json();
        
        // 修改标签
        if (body.tags) {
            await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('tags', ?)").bind(JSON.stringify(body.tags)).run();
        }
        // 修改密码
        if (body.newPassword) {
            const newHash = await md5(body.newPassword);
            await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('admin_password', ?)").bind(newHash).run();
        }
        
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
