create extension if not exists pgcrypto;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id text unique,
  full_name text,
  email text unique,
  company_name text,
  business_name text,
  business_email text,
  business_phone text,
  business_gst text,
  business_address text,
  bank_name text,
  account_holder text,
  account_number text,
  ifsc_code text,
  upi_id text,
  default_gst numeric(12, 2) not null default 18,
  bank_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists business_name text;
alter table public.profiles add column if not exists business_email text;
alter table public.profiles add column if not exists business_phone text;
alter table public.profiles add column if not exists business_gst text;
alter table public.profiles add column if not exists business_address text;
alter table public.profiles add column if not exists bank_name text;
alter table public.profiles add column if not exists account_holder text;
alter table public.profiles add column if not exists account_number text;
alter table public.profiles add column if not exists ifsc_code text;
alter table public.profiles add column if not exists upi_id text;
alter table public.profiles add column if not exists default_gst numeric(12, 2) not null default 18;
alter table public.profiles add column if not exists bank_notes text;

create table if not exists public.user_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invoice_counter integer not null default 1 check (invoice_counter > 0),
  proforma_counter integer not null default 1 check (proforma_counter > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hsn_code text,
  rate numeric(12, 2) not null default 0,
  stock_qty numeric(12, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists items_user_name_unique_idx
on public.items (user_id, name);

create index if not exists items_user_id_idx
on public.items (user_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null default 'Bill',
  client_name text,
  client_email text,
  client_phone text,
  client_gst text,
  client_address text,
  invoice_number text not null,
  invoice_date date,
  due_date date,
  status text not null default 'Pending',
  gst_percent numeric(12, 2) not null default 0,
  discount_percent numeric(12, 2) not null default 0,
  notes text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  item_discount_total numeric(12, 2) not null default 0,
  invoice_level_discount_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  taxable_amount numeric(12, 2) not null default 0,
  gst_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists invoices_user_invoice_number_unique_idx
on public.invoices (user_id, invoice_number);

create index if not exists invoices_user_id_idx
on public.invoices (user_id);

alter table public.profiles enable row level security;
alter table public.user_counters enable row level security;
alter table public.items enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can manage their own counters" on public.user_counters;
create policy "Users can manage their own counters"
on public.user_counters
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own items" on public.items;
create policy "Users can manage their own items"
on public.items
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own invoices" on public.invoices;
create policy "Users can manage their own invoices"
on public.invoices
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.handle_updated_at();

drop trigger if exists user_counters_set_updated_at on public.user_counters;
create trigger user_counters_set_updated_at
before update on public.user_counters
for each row
execute function public.handle_updated_at();

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
before update on public.items
for each row
execute function public.handle_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row
execute function public.handle_updated_at();
