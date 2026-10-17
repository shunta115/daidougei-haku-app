-- Session-scoped LIVE moderation. Additive only; no existing comments are changed.

create table if not exists public.live_comment_moderators (
  live_session_id uuid not null references public.live_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (live_session_id, user_id)
);

create table if not exists public.live_comment_mutes (
  live_session_id uuid not null references public.live_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  muted_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (live_session_id, user_id)
);

create index if not exists live_comment_moderators_user_idx
  on public.live_comment_moderators (user_id);
create index if not exists live_comment_mutes_user_idx
  on public.live_comment_mutes (user_id);

alter table public.live_comment_moderators enable row level security;
alter table public.live_comment_mutes enable row level security;
alter table public.live_comment_moderators force row level security;
alter table public.live_comment_mutes force row level security;

drop policy if exists live_comment_moderators_read on public.live_comment_moderators;
create policy live_comment_moderators_read on public.live_comment_moderators
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or public.is_admin()
    or exists (
      select 1 from public.live_sessions s
      where s.id = live_comment_moderators.live_session_id and s.performer_id = (select auth.uid())
    )
  );

drop policy if exists live_comment_moderators_owner_write on public.live_comment_moderators;
drop policy if exists live_comment_moderators_owner_insert on public.live_comment_moderators;
create policy live_comment_moderators_owner_insert on public.live_comment_moderators
  for insert to authenticated
  with check (
    granted_by = (select auth.uid())
    and (
      public.is_admin()
      or exists (
        select 1 from public.live_sessions s
        where s.id = live_comment_moderators.live_session_id and s.performer_id = (select auth.uid())
      )
    )
  );

drop policy if exists live_comment_moderators_owner_delete on public.live_comment_moderators;
create policy live_comment_moderators_owner_delete on public.live_comment_moderators
  for delete to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.live_sessions s
      where s.id = live_comment_moderators.live_session_id and s.performer_id = (select auth.uid())
    )
  );

drop policy if exists live_comment_mutes_read on public.live_comment_mutes;
create policy live_comment_mutes_read on public.live_comment_mutes
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or public.is_admin()
    or exists (
      select 1 from public.live_sessions s
      where s.id = live_comment_mutes.live_session_id and s.performer_id = (select auth.uid())
    )
    or exists (
      select 1 from public.live_comment_moderators m
      where m.live_session_id = live_comment_mutes.live_session_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists live_comment_mutes_moderator_write on public.live_comment_mutes;
drop policy if exists live_comment_mutes_moderator_insert on public.live_comment_mutes;
create policy live_comment_mutes_moderator_insert on public.live_comment_mutes
  for insert to authenticated
  with check (
    muted_by = (select auth.uid())
    and (
      public.is_admin()
      or (
        not exists (
          select 1 from public.live_sessions s
          where s.id = live_comment_mutes.live_session_id and s.performer_id = live_comment_mutes.user_id
        )
        and (
          exists (
            select 1 from public.live_sessions s
            where s.id = live_comment_mutes.live_session_id and s.performer_id = (select auth.uid())
          )
          or (
            exists (
              select 1 from public.live_comment_moderators actor
              where actor.live_session_id = live_comment_mutes.live_session_id
                and actor.user_id = (select auth.uid())
            )
            and not exists (
              select 1 from public.live_comment_moderators target
              where target.live_session_id = live_comment_mutes.live_session_id
                and target.user_id = live_comment_mutes.user_id
            )
          )
        )
      )
    )
  );

drop policy if exists live_comment_mutes_moderator_update on public.live_comment_mutes;
create policy live_comment_mutes_moderator_update on public.live_comment_mutes
  for update to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.live_sessions s
      where s.id = live_comment_mutes.live_session_id and s.performer_id = (select auth.uid())
    )
    or exists (
      select 1 from public.live_comment_moderators m
      where m.live_session_id = live_comment_mutes.live_session_id
        and m.user_id = (select auth.uid())
    )
  )
  with check (
    muted_by = (select auth.uid())
    and (
      public.is_admin()
      or (
        not exists (
          select 1 from public.live_sessions s
          where s.id = live_comment_mutes.live_session_id and s.performer_id = live_comment_mutes.user_id
        )
        and (
          exists (
            select 1 from public.live_sessions s
            where s.id = live_comment_mutes.live_session_id and s.performer_id = (select auth.uid())
          )
          or (
            exists (
              select 1 from public.live_comment_moderators actor
              where actor.live_session_id = live_comment_mutes.live_session_id
                and actor.user_id = (select auth.uid())
            )
            and not exists (
              select 1 from public.live_comment_moderators target
              where target.live_session_id = live_comment_mutes.live_session_id
                and target.user_id = live_comment_mutes.user_id
            )
          )
        )
      )
    )
  );

drop policy if exists live_comment_mutes_moderator_delete on public.live_comment_mutes;
create policy live_comment_mutes_moderator_delete on public.live_comment_mutes
  for delete to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.live_sessions s
      where s.id = live_comment_mutes.live_session_id and s.performer_id = (select auth.uid())
    )
    or exists (
      select 1 from public.live_comment_moderators m
      where m.live_session_id = live_comment_mutes.live_session_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists live_comments_insert on public.live_comments;
create policy live_comments_insert on public.live_comments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and live_session_id is not null
    and exists (
      select 1 from public.live_sessions s
      where s.id = live_comments.live_session_id
        and s.performer_id = live_comments.performer_id
        and s.ended_at is null
    )
    and not exists (
      select 1 from public.live_comment_mutes m
      where m.live_session_id = live_comments.live_session_id
        and m.user_id = (select auth.uid())
        and (m.expires_at is null or m.expires_at > now())
    )
  );

-- Production historically allowed users to delete their own comments. P3 makes
-- deletion a moderation action only, so remove that permissive policy explicitly.
drop policy if exists live_comments_delete_own on public.live_comments;
drop policy if exists live_comments_moderator_delete on public.live_comments;
create policy live_comments_moderator_delete on public.live_comments
  for delete to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.live_sessions s
      where s.id = live_comments.live_session_id and s.performer_id = (select auth.uid())
    )
    or (
      exists (
        select 1 from public.live_comment_moderators actor
        where actor.live_session_id = live_comments.live_session_id
          and actor.user_id = (select auth.uid())
      )
      and not exists (
        select 1 from public.live_sessions s
        where s.id = live_comments.live_session_id and s.performer_id = live_comments.user_id
      )
      and not exists (
        select 1 from public.live_comment_moderators target
        where target.live_session_id = live_comments.live_session_id
          and target.user_id = live_comments.user_id
      )
    )
  );

-- Older production default privileges granted UPDATE/TRUNCATE to browser roles.
-- RLS does not protect TRUNCATE, so replace the ACL with the exact P3 surface.
revoke all on public.live_comments from anon, authenticated;
revoke all on public.live_comment_moderators from anon, authenticated;
revoke all on public.live_comment_mutes from anon, authenticated;

grant select on public.live_comments to anon;
grant select, insert, delete on public.live_comments to authenticated;
grant select, insert, delete on public.live_comment_moderators to authenticated;
grant select, insert, update, delete on public.live_comment_mutes to authenticated;

-- DELETE payloads need the old row so clients can remove it immediately.
alter table public.live_comments replica identity full;
