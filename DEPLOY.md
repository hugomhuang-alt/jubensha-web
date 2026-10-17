# 联机服务器部署（免费版，之后可随时升级）

目标：让 App 里的“创建房间 / 加入房间 / 语音”真正联机。单人侦探模式不需要服务器。

## 一、部署到 Render（免费，不用绑银行卡）

1. 打开 https://render.com → **Get Started** → 选 **GitHub** 登录。
2. 首页右上角 **New +** → **Web Service**。
3. 选 **Public Git Repository**，填：`https://github.com/hugomhuang-alt/jubensha-web` → **Connect**。
4. 填写：
   - **Name**：`jubensha-server`
   - **Region**：离你和朋友近的（美东选 Ohio 或 Virginia）
   - **Branch**：`main`
   - **Root Directory**：`server`
   - **Runtime**：`Node`
   - **Build Command**：`npm install --omit=dev`
   - **Start Command**：`node server.js`
   - **Instance Type**：**Free**
5. 点 **Deploy Web Service**，等 2–3 分钟，日志出现“剧本杀服务器已启动”就好了。
6. 页面左上角有网址，形如 `https://jubensha-server.onrender.com`。浏览器打开 `网址/health`，看到 `ok` 就成功。
   **把这个网址发给 Claude**（如果和上面一样就不用发）。

## 二、让语音更稳（可选，建议第二步做）

免费的 Google STUN 大约 8 成网络能连上；手机流量、学校/公司 Wi-Fi 可能连不上，需要 TURN：

1. 打开 https://www.metered.ca → Sign Up（邮箱，免费，不用绑卡）。
2. 进入 **TURN Server** → 创建应用 → 找到 **ICE servers / Credentials**，复制那一段 JSON 数组（以 `[` 开头）。
3. 回到 Render → 你的服务 → **Environment** → **Add Environment Variable**：
   - Key：`ICE_SERVERS`
   - Value：粘贴刚复制的 JSON
   保存，服务会自动重启。

## 三、让服务器不休眠（可选，免费）

Render 免费服务 15 分钟没人用会休眠，下一个人进来要等 30–60 秒。
想一直醒着：注册 https://uptimerobot.com（免费）→ Add New Monitor → HTTP(s) → URL 填 `网址/health` → 间隔 5 分钟。

## 四、人多了再升级

Render → 你的服务 → **Settings** → **Instance Type** → 选 **Starter**（约 $7/月）。不用改代码、不用重新发 App。

---

## 账号系统（用户注册 / 登录）设置

服务器**设置了 `AUTH_SECRET` 才会开启账号**。没设置时是“无账号”模式（谁都能直接玩，用于本地测试）。正式上线请设置下面这些环境变量（Render → 你的服务 → Environment）：

| 变量 | 必填 | 作用 |
|---|---|---|
| `AUTH_SECRET` | 是 | 登录令牌的签名密钥，随便一长串字符（至少 20 位），别告诉别人。**设了它就开启账号 + 满人自动开局 + 真人房间禁止机器人。** |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 强烈建议 | 账号存在哪里。Render 免费版每次重启/重新部署文件会清空，不设的话**所有账号会丢**。到 upstash.com 免费注册，建一个 Redis 数据库，复制 REST URL 和 Token 填进来即可（免费额度够用）。 |
| `TEST_EMAILS` | 可选 | 内部测试账号的邮箱，逗号分隔（如 `me@gmail.com`）。只有这些账号能看到“【内测】”剧本，也只有那个剧本里能加机器人。 |

注意：改环境变量后 Render 会自动重启，正在进行的房间会中断。

**关于 Gmail 登录**：现在是“邮箱 + 密码”注册，Gmail 等任何邮箱都能用（暂不验证邮箱真实性）。“用 Google 账号一键登录”在安卓 App 内嵌网页里被 Google 禁止，要做必须接入原生 Google 登录 SDK 并在 Google Cloud 创建 OAuth 客户端，属于下一步工作。
