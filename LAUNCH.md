# 上线清单（单人侦探 + 多人剧本杀 + 狼人杀）

## 已就绪（打包即可用）
- Android APK：https://hugomhuang-alt.github.io/jubensha-web/jubensha.apk（固定签名，覆盖安装不丢存档；启动时先加载 GitHub Pages 最新版，离线则用内置版）
- 网页版：https://hugomhuang-alt.github.io/jubensha-web/
- 单人侦探：28 个案件（每案专属图文开场、档案、搜证、审问、指认、复盘），无需联网
- 多人剧本杀 / 狼人杀：联机服务器 https://jubensha-server-yy5d.onrender.com （Render 免费档，推送 server/** 自动部署）

## 上线前你要做的 3 件事
1. **Render 环境变量 `AUTH_SECRET`**：任意一串随机长字符（≥32 位）。不设的话游客可以玩，账号登录不可用。
2. **保活（可选）**：Render 免费档 15 分钟无访问会休眠，首次联机要等约 30–60 秒唤醒。可用 UptimeRobot 每 10 分钟访问一次服务器地址。
3. **语音（可选）**：部分手机网络下点对点语音连不上，需要 TURN 服务器；在 Render 里设置 `ICE_SERVERS`（JSON）即可，见 README。

## 发版流程（每次改动后）
`node tools/build-solo.js` → `node tools/make-android.js` → `SERVER_URL=… node tools/make-web.js <web 仓库>` → 推送 APK 仓库（Actions 自动构建 APK）→ 把 APK 拷到 web 仓库并推送 → 重新发布网页版 artifact。

## 回归测试
- `npm test`（多人/狼人杀服务器流程）
- `node test/det-v2.js`、`node test/ww-voice.js`、`node tools/check-cinema.js cases/*.js`
- 全案件自动通关：28 个案件各自完整走一遍（开场 → 档案 → 指认 → 复盘）
