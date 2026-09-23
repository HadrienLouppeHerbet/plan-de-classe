-- À exécuter une seule fois dans votre projet Supabase : Dashboard → SQL Editor → New query → Run.
-- Crée la table des classes et le bucket privé des photos, avec un accès réservé au personnel connecté.

-- ---------- Classes (élèves et affectations en JSON, comme dans l'application) ----------

create table if not exists public.classes (
  id text primary key,
  name text not null default '',
  columns jsonb not null default '[]',
  students jsonb not null default '[]',
  assignments jsonb not null default '{}',
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.classes enable row level security;

-- Tout le personnel connecté peut voir et modifier toutes les classes (usage partagé, cf. l'ancien
-- mot de passe unique). Pour restreindre à "chacun ne voit que ses classes", remplacer `using (true)`
-- par `using (owner_id = auth.uid())`.
create policy "classes lecture personnel connecté"
  on public.classes for select
  to authenticated
  using (true);

create policy "classes écriture personnel connecté"
  on public.classes for all
  to authenticated
  using (true)
  with check (true);

-- ---------- Photos (bucket privé, jamais public) ----------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "photos lecture personnel connecté"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photos');

create policy "photos écriture personnel connecté"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'photos')
  with check (bucket_id = 'photos');

-- Si l'éditeur SQL refuse une de ces policies storage (permissions selon votre plan), créez-les à la
-- place depuis Dashboard → Storage → Policies, avec les mêmes conditions.
