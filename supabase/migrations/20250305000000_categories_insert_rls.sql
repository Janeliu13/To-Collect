-- Allow authenticated users to insert new categories.
-- Duplicate prevention (case-insensitive) is enforced by the frontend,
-- but the unique constraint on 'slug' also guards against exact-slug collisions.
create policy "categories_insert"
  on public.categories for insert
  to authenticated
  with check (true);
