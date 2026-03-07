# 在 Supabase 创建 API 的流程

本文档说明如何在本项目中创建并配置 Supabase 项目、数据库、存储桶和 Edge Functions（API）。

---

## 快速：已有项目，只加 remove-background API

若 Supabase 项目、generate-avatar 已就绪，只需新增去背景接口：

1. **部署 remove-background 函数**
   ```bash
   supabase functions deploy remove-background
   ```

2. **（可选）配置 remove.bg 密钥**  
   Dashboard → **Project Settings** → **Edge Functions** → **Secrets** → 添加：
   - `REMOVE_BG_API_KEY` = 你的 [remove.bg](https://www.remove.bg/api) API Key  

   不设置也可以：函数会透传原图，流程照常可用；设置后才会真正去背景。

完成以上即可，前端已会调用 `https://<project>.supabase.co/functions/v1/remove-background`。

---

## 一、前置准备

1. **安装 Supabase CLI**（若未安装）  
   ```bash
   brew install supabase/tap/supabase
   ```

2. **登录 Supabase**  
   ```bash
   supabase login
   ```
   按提示在浏览器中完成登录。

---

## 二、创建并关联 Supabase 项目

### 方式 A：已有项目（推荐）

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)，选择你的项目（或新建项目）。
2. 在项目设置中记下：
   - **Project URL**（如 `https://xxxx.supabase.co`）
   - **anon public key**（Settings → API）
3. 在项目根目录执行关联：
   ```bash
   cd /path/to/Collect
   supabase link --project-ref <你的项目 ref>
   ```
   `project-ref` 在 Dashboard 的 URL 里：`https://supabase.com/dashboard/project/<project-ref>`。

### 方式 B：从零创建

1. 在 [Supabase Dashboard](https://supabase.com/dashboard) 点击 **New Project**，选区域、设密码。
2. 项目创建完成后，在本地执行：
   ```bash
   supabase link --project-ref <新项目的 ref>
   ```

---

## 三、数据库与表结构

### 1. 执行建表 SQL

若尚未建表，在 Dashboard 中：

1. 打开 **SQL Editor**。
2. 打开项目中的 `supabase-schema.sql`，复制全部内容粘贴到编辑器。
3. 点击 **Run** 执行（会创建 `users_ext`、`objects`、`user_profile_objects`、`reposts`、`blog_posts`、`conversations`、`messages`、`categories` 等表及 RLS）。

### 2. 执行存储 RLS 迁移（可选，若用 CLI 迁移）

若希望用 CLI 统一管理迁移，在项目根目录执行：

```bash
supabase db push
```

会应用 `supabase/migrations/` 下的迁移（如 avatars、objects 的 storage RLS）。若表结构是用上面的 `supabase-schema.sql` 建的，这里主要会加上存储相关策略。

---

## 四、存储桶（Storage）

1. 在 Dashboard 打开 **Storage**。
2. 创建两个桶：
   - **avatars**：用于用户头像。创建后可在 **Policies** 中检查是否有对应 RLS（若已执行过 `avatars_storage_rls` 迁移则已有）。
   - **objects**：用于物品图片。同上，若已执行 `objects_storage_rls` 迁移则已有策略。
3. 建议将两个桶都设为 **Public**，以便前端用 `getPublicUrl()` 直接展示图片。

若未用迁移，需在 Storage → 对应桶 → Policies 里按项目中的 migration 文件手动添加「认证用户写自己目录、公开读」等策略。

---

## 五、部署 Edge Functions（API）

本项目有两个 Edge Function，对应两个「API」：

| 函数名 | 作用 | 所需密钥 |
|--------|------|----------|
| `generate-avatar` | 用 OpenAI 根据用户照片生成像素头像 | `OPENAI_API_KEY` |
| `remove-background` | 物品图去背景（可选 remove.bg） | `REMOVE_BG_API_KEY`（可选） |

### 1. 一次性部署两个函数

在项目根目录执行：

```bash
supabase functions deploy
```

会部署 `generate-avatar` 和 `remove-background`。

### 2. 单独部署某一个

```bash
supabase functions deploy generate-avatar
supabase functions deploy remove-background
```

### 3. 部署后得到的 API 地址

- 格式：`https://<project-ref>.supabase.co/functions/v1/<函数名>`
- 例如：
  - 头像生成：`https://xxxx.supabase.co/functions/v1/generate-avatar`
  - 去背景：`https://xxxx.supabase.co/functions/v1/remove-background`

前端已通过 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 拼出上述地址并带上 `apikey`，一般无需再改。

---

## 六、配置密钥（Secrets）

Edge Function 里用到的环境变量需要在 Supabase 中设为 **Secrets**，不能写进代码。

### 1. 在 Dashboard 中设置

1. 打开项目 → **Project Settings** → **Edge Functions**。
2. 在 **Secrets** 区域添加：

| Name | 说明 | 必填 |
|------|------|------|
| `OPENAI_API_KEY` | OpenAI API Key（用于 generate-avatar） | 是（若用头像生成） |
| `REMOVE_BG_API_KEY` | [remove.bg](https://www.remove.bg/api) 的 API Key（用于 remove-background） | 否（不设则去背景为透传原图） |

### 2. 用 CLI 设置（可选）

```bash
supabase secrets set OPENAI_API_KEY=sk-xxxx
supabase secrets set REMOVE_BG_API_KEY=xxxx   # 可选
```

设置后无需重新部署，下次调用 Edge Function 时会自动带上新密钥。

---

## 七、本地调试 Edge Function（可选）

若要在本地跑函数、避免每次部署才能测：

```bash
# 在项目根目录
supabase functions serve generate-avatar --env-file ./supabase/.env.local
supabase functions serve remove-background --env-file ./supabase/.env.local
```

在 `supabase/.env.local` 中写（不要提交到 Git）：

```env
OPENAI_API_KEY=sk-xxxx
REMOVE_BG_API_KEY=xxxx
```

前端本地开发时若想调本地函数，需把请求 URL 临时改为 `http://localhost:54321/functions/v1/<函数名>`（或你配置的端口）。

---

## 八、流程小结

```
1. supabase login
2. supabase link --project-ref <ref>
3. Dashboard → SQL Editor → 执行 supabase-schema.sql（若表还未建）
4. Dashboard → Storage → 创建桶 avatars、objects（并设为 Public，或按迁移检查策略）
5. supabase db push                    # 应用存储等迁移
6. supabase functions deploy           # 部署两个 API
7. Dashboard → Settings → Edge Functions → Secrets：设置 OPENAI_API_KEY（及可选 REMOVE_BG_API_KEY）
```

完成后，前端使用的「API」即为上述两个 Edge Function；数据库与存储的访问通过 Supabase 的 REST/JS 客户端和 RLS 完成，无需再单独「创建」其他 API。
