create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'custom',
  subject text not null,
  message text not null,
  cta_label text,
  cta_url text,
  audience text not null default 'all',
  preorder_id uuid references public.preorders(id) on delete set null,
  sent_by_email text,
  recipient_count int4 not null default 0,
  success_count int4 not null default 0,
  failure_count int4 not null default 0,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  first_name text,
  last_name text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_campaigns_created_at_idx
  on public.email_campaigns(created_at desc);

create index if not exists email_campaign_recipients_campaign_id_idx
  on public.email_campaign_recipients(campaign_id);

create index if not exists email_campaign_recipients_user_id_idx
  on public.email_campaign_recipients(user_id);

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
