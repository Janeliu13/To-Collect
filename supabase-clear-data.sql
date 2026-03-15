-- Clear all app data before opening to users (保留 categories 预置分类)
-- 在 Supabase Dashboard → SQL Editor 中执行
-- 执行前请确认：会删除所有用户扩展信息、物品、消息、会话、转发、Blog 等，不影响 auth.users（已注册用户仍存在）

-- 按外键依赖顺序清空（先删子表，再删父表）
TRUNCATE TABLE public.messages CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations') THEN
    TRUNCATE TABLE public.conversations CASCADE;
  END IF;
END $$;

TRUNCATE TABLE public.user_profile_objects CASCADE;
TRUNCATE TABLE public.reposts CASCADE;
TRUNCATE TABLE public.blog_posts CASCADE;
TRUNCATE TABLE public.objects CASCADE;
TRUNCATE TABLE public.users_ext CASCADE;

-- 可选：若希望连测试账号也一并删除，在 Dashboard → Authentication → Users 里手动删除，
-- 或取消下面注释执行（会删除所有 auth 用户，所有人需重新注册）：
-- TRUNCATE TABLE auth.users CASCADE;

-- Storage 桶内的文件不会因上述 SQL 被删除。若需清空头像和物品图片：
-- 在 Dashboard → Storage → avatars / objects 中手动删除文件，或通过 API 批量删除。
