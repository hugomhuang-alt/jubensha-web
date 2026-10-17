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
