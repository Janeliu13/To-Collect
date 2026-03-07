-- To Collect — Supabase 建表与 RLS（阶段 1）
-- 在 Supabase Dashboard → SQL Editor 中执行，或使用 Supabase CLI 迁移

-- 扩展（如需要）
-- create extension if not exists "uuid-ossp";

-- 1. 分类（预置数据）
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

insert into public.categories (name, slug) values
  ('Cups', 'cups'),
  ('Pens', 'pens'),
  ('Utensils', 'utensils'),
  ('Lamps', 'lamps'),
  ('Other', 'other')
on conflict (slug) do nothing;

-- 2. 用户扩展信息（与 auth.users 一对一）
create table if not exists public.users_ext (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. 物品（永久存档）
create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  description text,
  category_id uuid references public.categories(id),
  created_at timestamptz default now()
);

-- 4. 用户当前展示的 20 件
create table if not exists public.user_profile_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_id uuid not null references public.objects(id) on delete cascade,
  position smallint not null check (position >= 1 and position <= 20),
  updated_at timestamptz default now(),
  unique(user_id, position)
);

-- 5. 转发
create table if not exists public.reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_id uuid not null references public.objects(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, object_id)
);

-- 6. 每日心情（Blog 五格）
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  object_ids uuid[] default '{}',  -- 最多 5 个
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

-- 7. 会话
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz default now(),
  unique(user_a, user_b),
  check (user_a < user_b)
);

-- 8. 消息
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text,
  object_id uuid references public.objects(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_messages_created on public.messages(created_at);

-- RLS 启用
alter table public.users_ext enable row level security;
alter table public.objects enable row level security;
alter table public.user_profile_objects enable row level security;
alter table public.reposts enable row level security;
alter table public.blog_posts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.categories enable row level security;

-- 策略：categories 所有人可读
create policy "categories_read" on public.categories for select using (true);

-- users_ext：所有人可读，仅自己可写
create policy "users_ext_read" on public.users_ext for select using (true);
create policy "users_ext_write" on public.users_ext for all using (auth.uid() = id);

-- objects：所有人可读，认证用户可插入（且 owner_id = 自己）
create policy "objects_read" on public.objects for select using (true);
create policy "objects_insert" on public.objects for insert with check (auth.uid() = owner_id);

-- user_profile_objects：所有人可读，仅自己可写
create policy "user_profile_objects_read" on public.user_profile_objects for select using (true);
create policy "user_profile_objects_write" on public.user_profile_objects for all using (auth.uid() = user_id);

-- reposts：所有人可读，仅自己可写
create policy "reposts_read" on public.reposts for select using (true);
create policy "reposts_write" on public.reposts for all using (auth.uid() = user_id);

-- blog_posts：所有人可读，仅自己可写
create policy "blog_posts_read" on public.blog_posts for select using (true);
create policy "blog_posts_write" on public.blog_posts for all using (auth.uid() = user_id);

-- conversations：参与者可读可写
create policy "conversations_access" on public.conversations for all using (
  auth.uid() = user_a or auth.uid() = user_b
);

-- messages：会话参与者可读可写
create policy "messages_select" on public.messages for select using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);
create policy "messages_insert" on public.messages for insert with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);

-- 存储：在 Dashboard → Storage 创建桶 avatars、objects，并设置策略：
-- avatars: 公开读，认证用户可上传/更新自己的文件（path 如 {user_id}/*）
-- objects: 公开读，认证用户可上传（path 如 {user_id}/*）
