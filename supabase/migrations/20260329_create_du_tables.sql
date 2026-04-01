-- -----------------------------------------------------------------------------
-- 1. 订阅者表 (xz_du_subscribers)
-- -----------------------------------------------------------------------------
create table if not exists xz_du_subscribers (
  id bigint generated always as identity primary key,
  email text not null unique,
  status text not null default 'active',
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint xz_du_subscribers_status_check check (status in ('active', 'unsubscribed'))
);

create index if not exists idx_xz_du_subscribers_status on xz_du_subscribers (status);

-- -----------------------------------------------------------------------------
-- 2. 古文库表 (xz_du_passages)
-- -----------------------------------------------------------------------------
create table if not exists xz_du_passages (
  id bigint generated always as identity primary key,
  source_book text not null,
  source_origin text,
  title text,
  content text not null,
  difficulty integer not null default 1,
  theme text,
  enabled boolean not null default true,
  -- AI 解读（一次生成，永久复用）
  payload jsonb,
  payload_generated_at timestamptz,
  -- 发送记录（选文去重用）
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_xz_du_passages_enabled on xz_du_passages (enabled);
create index if not exists idx_xz_du_passages_last_sent_at on xz_du_passages (last_sent_at asc nulls first);
create index if not exists idx_xz_du_passages_payload on xz_du_passages ((payload is null)) where payload is null;

-- -----------------------------------------------------------------------------
-- 3. 每日任务运行记录表 (xz_du_daily_runs)
--    run_date 唯一，作为公开阅读页 URL slug：/du/2026-04-01
-- -----------------------------------------------------------------------------
create table if not exists xz_du_daily_runs (
  id bigint generated always as identity primary key,
  run_date date not null unique,
  passage_id bigint not null references xz_du_passages(id) on delete restrict,
  sent_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_xz_du_daily_runs_run_date on xz_du_daily_runs (run_date desc);
create index if not exists idx_xz_du_daily_runs_passage_id on xz_du_daily_runs (passage_id);
