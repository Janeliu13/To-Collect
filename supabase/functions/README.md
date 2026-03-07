# Edge Functions

## generate-avatar

根据用户上传的照片，调用 OpenAI GPT Image 1.5 生成像素化头像。

### 部署

1. 安装 [Supabase CLI](https://supabase.com/docs/guides/cli) 并登录。
2. 在项目根目录执行：
   ```bash
   supabase link --project-ref <你的项目 ref>
   ```
3. 设置密钥（OpenAI API Key 不要提交到 Git）：
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-你的OpenAI密钥
   ```
   密钥在 [OpenAI API Keys](https://platform.openai.com/api-keys) 创建，需有 GPT Image / Images API 权限。
4. 部署（已配置 `verify_jwt = false` 在 `supabase/config.toml`，避免 401）：
   ```bash
   npx supabase functions deploy generate-avatar
   ```
   若仍出现 401，可显式指定：`npx supabase functions deploy generate-avatar --no-verify-jwt`

### 本地调试

```bash
# 在项目根目录创建 supabase/.env.local，写入 OPENAI_API_KEY=sk-...
supabase functions serve generate-avatar --env-file ./supabase/.env.local
```

前端本地调用时，需把 `.env` 里的 `VITE_SUPABASE_URL` 改为 `http://127.0.0.1:54321`（或你 serve 的地址）才能请求到本地 Edge Function。

### 请求 / 响应

- **POST** 请求体：`{ "imageBase64": " base64 字符串 " }`，可选 `"prompt": "自定义提示词"`。
- **成功**：`{ "b64_json": " 生成图的 base64 " }`。
- **失败**：`{ "error": " 错误信息 " }`，HTTP 4xx/5xx。

### 未部署时

若未部署或接口报错，前端会显示「生成头像失败」，用户仍可使用**原图**作为头像（点 Next 会上传原图）。

### 本地测试 OpenAI 调用

在项目根目录执行（**勿把 key 提交到 Git，若曾泄露请立即在 OpenAI 后台撤销并新建 key**）：

```bash
OPENAI_API_KEY=sk-你的key node scripts/test-openai-avatar.mjs
```

可验证：API Key 是否有效、`/v1/images/edits` 与 `gpt-image-1-mini` 是否可用。若返回 400/401/404，脚本会打印响应 body 便于排查。
