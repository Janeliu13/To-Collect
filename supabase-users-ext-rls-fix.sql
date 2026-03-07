-- 若 users_ext 写入仍失败，可在 Supabase SQL Editor 中执行本文件
-- 为 users_ext 使用显式 INSERT/UPDATE 策略（带 WITH CHECK），便于通过 RLS

-- 先删除原有写策略（若存在）
drop policy if exists "users_ext_write" on public.users_ext;

-- INSERT：仅允许插入 id = 当前用户 的行
create policy "users_ext_insert" on public.users_ext
  for insert with check (auth.uid() = id);

-- UPDATE：仅允许更新自己的行
create policy "users_ext_update" on public.users_ext
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- DELETE：仅允许删除自己的行（可选，若需要）
create policy "users_ext_delete" on public.users_ext
  for delete using (auth.uid() = id);
