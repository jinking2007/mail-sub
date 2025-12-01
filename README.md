📦 Serverless Unified Mailbox (Cloudflare 私人聚合邮箱)
这是一个基于 Cloudflare 全家桶（Worker + Pages + D1 + R2）构建的**完全免费、无服务器（Serverless）**的私人邮件管理系统。
它能够聚合管理你的多个邮箱（Gmail, Outlook, QQ 等），并提供一个类似原生 App 体验的 PWA 网页端进行查看。
✨ 特性
💸 永久免费：利用 Cloudflare 免费额度（每天 10 万次请求，数据库与存储足够个人使用）。
📱 PWA 支持：支持安卓/iOS 安装到主屏幕，全屏运行，体验接近原生 App。
📨 多邮箱聚合：支持 Gmail/Outlook/QQ 等自动转发归类。
☁️ 纯云端部署：无需服务器，无需在本地安装任何环境，通过 GitHub Actions 自动部署。
🔒 数据私有：邮件解析后直接存入你自己的 D1 数据库和 R2 存储桶。
🚀 部署指南 (纯网页操作版)
无需懂代码，无需命令行，只需要拥有 Cloudflare 和 GitHub 账号即可完成部署。
第一步：准备 Cloudflare 资源
登录 Cloudflare Dashboard 完成以下操作：
创建数据库 (D1)
进入 Workers & Pages -> D1。
创建数据库，命名为 mail-db。
复制并保存 Database ID (一串长字符)。
点击 Console 标签，粘贴并执行以下 SQL 初始化表：
code
SQL
CREATE TABLE IF NOT EXISTS emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT, from_address TEXT, subject TEXT, snippet TEXT, received_at INTEGER, r2_key TEXT, mailbox TEXT DEFAULT 'Main');
创建存储桶 (R2)
进入 R2。
创建存储桶，命名为 mail-storage。
获取账户 ID
在 Cloudflare 首页右下角或 URL 中找到 Account ID，复制备用。
第二步：配置 GitHub 仓库
填写数据库 ID
在 GitHub 仓库中，进入 receiver 文件夹。
将 wrangler.toml.example 重命名为 wrangler.toml。
编辑该文件，将 database_id = "YOUR_DB_ID_HERE" 中的内容替换为你刚才复制的 D1 Database ID。
提交更改 (Commit changes)。
配置自动部署密钥 (Secrets)
进入 GitHub 仓库的 Settings -> Secrets and variables -> Actions。
点击 New repository secret 添加以下两个变量：
CF_API_TOKEN: Cloudflare API 令牌 (在 CF 后台 -> My Profile -> API Tokens -> Create -> 模板选择 Edit Cloudflare Workers)。
CF_ACCOUNT_ID: 你的 Cloudflare 账户 ID。
添加完成后，GitHub Actions 会自动触发并开始部署后端 Worker。
第三步：部署前端 (Pages)
回到 Cloudflare 后台，进入 Workers & Pages。
点击 Create Application -> Pages -> Connect to Git。
选择本项目仓库。
构建配置 (Build settings) - ⚠️非常重要：
Root directory (根目录): 填入 viewer
Build output directory (输出目录): 填入 viewer/public
点击部署 (Save and Deploy)。
第四步：绑定数据库与存储 (至关重要)
前端部署完成后（首次可能因为没连数据库报错，不用管），点击 Continue to project：
进入 Settings -> Functions。
D1 Database Bindings:
变量名: DB
选择数据库: mail-db
R2 Bucket Bindings:
变量名: BUCKET
选择存储桶: mail-storage
保存设置。
进入 Deployments 标签页，找到最新的部署记录，点击右侧 ... -> Retry deployment (重新部署以生效绑定)。
第五步：设置邮件路由
进入 Cloudflare Email -> Email Routing。
启用 Email Routing（如果未启用）。
在 Routing rules 中点击 Create rule -> Custom address：
Custom address: 例如 gmail-sync @ 你的域名。
Action: Send to a Worker。
Destination: 选择 mail-receiver (即刚才 GitHub 自动部署的 Worker)。
保存。
📧 使用说明
1. 设置转发
登录你的 Gmail / Outlook / QQ 邮箱设置页面，找到“自动转发”功能：
将邮件转发到你在第五步设置的地址（例如 gmail-sync@你的域名.com）。
2. 验证转发
转发设置时，服务商通常会发送一封验证邮件。
访问你部署好的 Pages 网址（例如 https://你的项目名.pages.dev）。
在列表中查收验证邮件，点击查看验证码，回填到邮箱设置中。
3. 安装到手机 (PWA)
安卓: 使用 Chrome 打开网页 -> 点击右上角菜单 -> "安装应用" 或 "添加到主屏幕"。
iOS: 使用 Safari 打开网页 -> 点击分享按钮 -> "添加到主屏幕"。
现在，你的桌面上就有了一个独立的邮件 App！
🛡️ 安全建议 (Zero Trust)
为了防止他人访问你的邮件，强烈建议配置 Cloudflare Access：
进入 Cloudflare Zero Trust -> Access -> Applications。
添加 Self-hosted 应用。
填入你的 Pages 域名。
设置策略：Include Emails -> 填入你自己的邮箱。
这样只有你能通过邮箱验证码登录查看。
🤝 License
MIT License

