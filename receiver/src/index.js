import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    // 1. 解析邮件
    const parser = new PostalMime();
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parsed = await parser.parse(rawEmail);
    const timestamp = Date.now();
    const r2Key = `${timestamp}_${message.from}.json`;

    // 2. 智能分类 (根据收件地址打标签)
    const recipient = message.to;
    let mailbox = 'Default';
    if (recipient.includes('gmail')) mailbox = 'Gmail';
    else if (recipient.includes('outlook')) mailbox = 'Outlook';
    else if (recipient.includes('qq')) mailbox = 'QQ';

    // 3. 存入 R2 (原始内容)
    await env.BUCKET.put(r2Key, JSON.stringify(parsed));

    // 4. 存入 D1 (索引)
    try {
      await env.DB.prepare(
        `INSERT INTO emails (message_id, from_address, subject, snippet, received_at, r2_key, mailbox) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        parsed.messageId,
        message.from,
        parsed.subject || '(无标题)',
        parsed.text ? parsed.text.substring(0, 100) : '',
        timestamp,
        r2Key,
        mailbox
      ).run();
    } catch (e) { console.error('DB Error', e); }
  }
};