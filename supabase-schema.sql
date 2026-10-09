-- Run in the Supabase SQL editor to create the contact form table and policies.
create table if not exists public.enquiries (
  id bigint generated always as identity primary key,
  name text not null,
  business_name text not null,
  phone text not null,
  email text not null,
  service text not null check (service in ('Business Website','Landing Page','E-Commerce','Custom Web App','Website Redesign','Other')),
  message text not null,
  budget text not null default 'Need guidance' check (budget in ('Under ₹5,000','₹5,000–₹10,000','₹10,000–₹25,000','₹25,000–₹50,000','₹50,000+','Need guidance')),
  created_at timestamptz not null default now()
);

-- Safe to re-run on projects where the enquiry table already exists.
alter table public.enquiries add column if not exists budget text not null default 'Need guidance';

alter table public.enquiries enable row level security;

-- Public visitors can submit validated enquiries, but cannot read or modify submissions.
revoke all on public.enquiries from anon, authenticated;
grant insert on public.enquiries to anon, authenticated;
grant select on public.enquiries to authenticated;
drop policy if exists "Allow public enquiry submissions" on public.enquiries;
create policy "Allow public enquiry submissions"
on public.enquiries for insert
to anon, authenticated
with check (
  char_length(name) between 1 and 120 and
  char_length(business_name) between 1 and 160 and
  char_length(phone) between 7 and 32 and
  char_length(email) between 3 and 254 and
  char_length(message) between 1 and 5000 and
  budget in ('Under ₹5,000','₹5,000–₹10,000','₹10,000–₹25,000','₹25,000–₹50,000','₹50,000+','Need guidance')
);

-- Recent portfolio projects managed from /admin.html.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists "Admins can read own membership" on public.admin_users;
create policy "Admins can read own membership"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.is_upvebx_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_upvebx_admin() from public, anon;
grant execute on function public.is_upvebx_admin() to authenticated;

drop policy if exists "Admins can read enquiries" on public.enquiries;
create policy "Admins can read enquiries"
on public.enquiries for select to authenticated
using (public.is_upvebx_admin());

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  category text not null check (category in ('Business','Restaurant','Salon','Rental','E-Commerce','Other')),
  description text not null check (char_length(description) between 1 and 500),
  project_url text not null check (project_url ~ '^https://'),
  image_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists projects_recent_idx on public.projects (created_at desc);
alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;

drop policy if exists "Public can view published projects" on public.projects;
create policy "Public can view published projects"
on public.projects for select to anon, authenticated
using (is_published = true);
drop policy if exists "Admins can view all projects" on public.projects;
create policy "Admins can view all projects"
on public.projects for select to authenticated
using (public.is_upvebx_admin());
drop policy if exists "Admins can add projects" on public.projects;
create policy "Admins can add projects"
on public.projects for insert to authenticated
with check (public.is_upvebx_admin());
drop policy if exists "Admins can update projects" on public.projects;
create policy "Admins can update projects"
on public.projects for update to authenticated
using (public.is_upvebx_admin())
with check (public.is_upvebx_admin());
drop policy if exists "Admins can delete projects" on public.projects;
create policy "Admins can delete projects"
on public.projects for delete to authenticated
using (public.is_upvebx_admin());

-- Public image reads; only approved admins can add, replace, or remove previews.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-previews','portfolio-previews',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "Public can view portfolio previews" on storage.objects;
create policy "Public can view portfolio previews"
on storage.objects for select to anon, authenticated
using (bucket_id = 'portfolio-previews');
drop policy if exists "Admins can upload portfolio previews" on storage.objects;
create policy "Admins can upload portfolio previews"
on storage.objects for insert to authenticated
with check (bucket_id = 'portfolio-previews' and public.is_upvebx_admin());
drop policy if exists "Admins can update portfolio previews" on storage.objects;
create policy "Admins can update portfolio previews"
on storage.objects for update to authenticated
using (bucket_id = 'portfolio-previews' and public.is_upvebx_admin())
with check (bucket_id = 'portfolio-previews' and public.is_upvebx_admin());
drop policy if exists "Admins can delete portfolio previews" on storage.objects;
create policy "Admins can delete portfolio previews"
on storage.objects for delete to authenticated
using (bucket_id = 'portfolio-previews' and public.is_upvebx_admin());

-- Admin setup (run once after creating your user under Authentication > Users):
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'your-admin-email@example.com';

-- Staff calling management. Run after the existing schema above.
create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null unique check (char_length(email) between 3 and 254),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff_profiles add column if not exists email text;

create table if not exists public.business_calls (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(business_name) between 1 and 200),
  contact_number text not null check (contact_number ~ '^[+]?[0-9][0-9 .()/-]{5,24}$'),
  assigned_to uuid references public.staff_profiles(user_id) on delete set null,
  call_status text not null default 'Not Called' check (call_status in ('Not Called','Called')),
  response text check (response in ('Interested','Not Interested','Didn''t Attend / No Answer','Busy','Switched Off','Number Invalid','Call Back Later','Follow-up Required','Already Has a Website','Asked to Send Demo','Demo Sent','Converted to Client')),
  follow_up_date date,
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_calls_assignee_idx on public.business_calls (assigned_to);
create index if not exists business_calls_phone_idx on public.business_calls (contact_number);

create table if not exists public.call_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_calls(id) on delete cascade,
  staff_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  response text not null check (response in ('Interested','Not Interested','Didn''t Attend / No Answer','Busy','Switched Off','Number Invalid','Call Back Later','Follow-up Required','Already Has a Website','Asked to Send Demo','Demo Sent','Converted to Client')),
  follow_up_date date,
  notes text not null default '' check (char_length(notes) <= 5000),
  attempted_at timestamptz not null default now()
);
create index if not exists call_attempts_business_idx on public.call_attempts (business_id, attempted_at desc);

alter table public.staff_profiles enable row level security;
alter table public.business_calls enable row level security;
alter table public.call_attempts enable row level security;

create or replace function public.is_upvebx_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles where user_id = (select auth.uid()) and active)
$$;
revoke all on function public.is_upvebx_staff() from public, anon;
grant execute on function public.is_upvebx_staff() to authenticated;

revoke all on public.staff_profiles, public.business_calls, public.call_attempts from anon, authenticated;
grant select, insert, delete on public.staff_profiles, public.business_calls to authenticated;
grant update on public.staff_profiles to authenticated;
revoke update on public.business_calls from authenticated;
grant update (business_name, contact_number, assigned_to, call_status, response, follow_up_date, notes, updated_at) on public.business_calls to authenticated;
grant select, insert on public.call_attempts to authenticated;

create or replace function public.guard_business_call_staff_updates()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_upvebx_admin() and (
    new.business_name is distinct from old.business_name or
    new.contact_number is distinct from old.contact_number or
    new.assigned_to is distinct from old.assigned_to or
    new.call_status <> 'Called' or new.response is null
  ) then
    raise exception 'Staff can only save call outcomes for assigned businesses';
  end if;
  if not public.is_upvebx_admin() and not exists (
    select 1 from public.call_attempts a
    where a.business_id = new.id and a.staff_id = (select auth.uid())
      and a.response = new.response
      and a.follow_up_date is not distinct from new.follow_up_date
      and a.notes = new.notes
      and a.attempted_at >= old.updated_at
  ) then
    raise exception 'Save the call attempt before updating the latest business result';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guard_business_call_staff_updates on public.business_calls;
create trigger guard_business_call_staff_updates before update on public.business_calls
for each row execute function public.guard_business_call_staff_updates();

drop policy if exists "Admins manage staff profiles" on public.staff_profiles;
create policy "Admins manage staff profiles" on public.staff_profiles for all to authenticated
using (public.is_upvebx_admin()) with check (public.is_upvebx_admin());
drop policy if exists "Staff read own profile" on public.staff_profiles;
create policy "Staff read own profile" on public.staff_profiles for select to authenticated
using (user_id = (select auth.uid()) and active);

drop policy if exists "Admins manage business calls" on public.business_calls;
create policy "Admins manage business calls" on public.business_calls for all to authenticated
using (public.is_upvebx_admin()) with check (public.is_upvebx_admin());
drop policy if exists "Staff read assigned businesses" on public.business_calls;
create policy "Staff read assigned businesses" on public.business_calls for select to authenticated
using (assigned_to = (select auth.uid()) and public.is_upvebx_staff());
drop policy if exists "Staff update assigned call results" on public.business_calls;
create policy "Staff update assigned call results" on public.business_calls for update to authenticated
using (assigned_to = (select auth.uid()) and public.is_upvebx_staff())
with check (assigned_to = (select auth.uid()) and public.is_upvebx_staff());

drop policy if exists "Admins read call history" on public.call_attempts;
create policy "Admins read call history" on public.call_attempts for select to authenticated
using (public.is_upvebx_admin());
drop policy if exists "Staff read own call history" on public.call_attempts;
create policy "Staff read own call history" on public.call_attempts for select to authenticated
using (staff_id = (select auth.uid()) and public.is_upvebx_staff());
drop policy if exists "Staff add own call history" on public.call_attempts;
create policy "Staff add own call history" on public.call_attempts for insert to authenticated
with check (staff_id = (select auth.uid()) and public.is_upvebx_staff() and exists (
  select 1 from public.business_calls b where b.id = business_id and b.assigned_to = (select auth.uid())
));

-- Admin-only website revenue and expense tracking.
create table if not exists public.finance_projects (
  id uuid primary key default gen_random_uuid(),
  website_name text not null check (char_length(website_name) between 1 and 200),
  total_budget numeric(12,2) not null check (total_budget >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.website_expenses (
  id uuid primary key default gen_random_uuid(),
  finance_project_id uuid not null references public.finance_projects(id) on delete cascade,
  category text not null check (category in ('Travel','Food','Domain','Hosting','Advertising','Software & Tools','Materials','Other')),
  amount numeric(12,2) not null check (amount > 0),
  description text not null check (char_length(description) between 1 and 500),
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists website_expenses_project_idx on public.website_expenses(finance_project_id, spent_on desc);
alter table public.finance_projects enable row level security;
alter table public.website_expenses enable row level security;
revoke all on public.finance_projects, public.website_expenses from anon, authenticated;
grant select, insert, update, delete on public.finance_projects, public.website_expenses to authenticated;
drop policy if exists "Admins manage finance projects" on public.finance_projects;
create policy "Admins manage finance projects" on public.finance_projects for all to authenticated
using (public.is_upvebx_admin()) with check (public.is_upvebx_admin());
drop policy if exists "Admins manage website expenses" on public.website_expenses;
create policy "Admins manage website expenses" on public.website_expenses for all to authenticated
using (public.is_upvebx_admin()) with check (public.is_upvebx_admin());
