# To Collect — 前端应用

React + Vite 项目，对接 Supabase。

## 本地运行

1. 复制环境变量：
   ```bash
   cp .env.example .env
   ```
2. 在 `.env` 中填入 Supabase 的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
3. 安装依赖并启动：
   ```bash
   npm install
   npm run dev
   ```

## 路由结构

- `/` — 入口页（登录/注册）
- `/avatar/create` — 头像拍照/上传
- `/avatar/confirm` — 头像确认 + 用户名
- `/main/*` — 主站（需登录）：画廊、用户、我的主页、消息、聊天室等

## 构建

```bash
npm run build
```
产物在 `dist/`，可部署到 VPS。
