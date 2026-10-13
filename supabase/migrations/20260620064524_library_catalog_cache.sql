-- ─────────────────────────────────────────────────────────────────────────────
-- Briefing Library — Phase 0: denormalized read-model + FTS + array facets (L1, L7)
-- Project: ycadmmngkdhvpcsrcuaq
--
-- Airtable is the editorial SOR but is NEVER in the hot request path (§11.2). A sync
-- mirrors the catalog into this table, optimized for read: tsvector + GIN for search,
-- GIN-indexed array columns for facets, keyset pagination on (go_live_date, id).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.library_catalog_cache (
  id              text primary key,                 -- Airtable record id (e.g. recIXg6yYr6MNIJGm)
  slug            text not null unique,
  briefing_title  text not null,
  briefing_description text not null default '',
  status          text not null check (status in ('Available','Coming Soon')),
  canonical_flag  text,                              -- 'Canonical' | 'Placeholder'
  gamma_url       text,
  gamma_id        text,
  gamma_updated_at timestamptz,                      -- feeds the preview content-address hash
  -- Facet axes as arrays (GIN-indexed) — Theme / Domain / Sub-Domain / Company (§5.2)
  themes          text[] not null default '{}',
  domains         text[] not null default '{}',
  subdomains      text[] not null default '{}',
  companies       text[] not null default '{}',
  download_count  integer not null default 0,
  go_live_date    date,
  -- Preview previews: Supabase Storage is the SOR. Null ⇒ preview-missing fallback (L4).
  preview_slides  text[],                            -- ≤ PREVIEW_SLIDE_MAX content-addressed URLs
  preview_hash    text,                              -- hash(airtable_record_id + gamma_updated_at)
  preview_backfill_needed boolean not null default false,
  synced_at       timestamptz not null default now(),
  -- Generated full-text search vector over title || ' ' || description (L1)
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(briefing_title,'') || ' ' || coalesce(briefing_description,''))
  ) stored
);

-- Full-text search index (L1)
create index if not exists library_catalog_cache_tsv_idx
  on public.library_catalog_cache using gin (search_tsv);

-- Facet array indexes — intersecting filters resolve in sub-ms (§11.2)
create index if not exists library_catalog_cache_themes_idx     on public.library_catalog_cache using gin (themes);
create index if not exists library_catalog_cache_domains_idx    on public.library_catalog_cache using gin (domains);
create index if not exists library_catalog_cache_subdomains_idx on public.library_catalog_cache using gin (subdomains);
create index if not exists library_catalog_cache_companies_idx  on public.library_catalog_cache using gin (companies);

-- Keyset pagination support: order by go_live_date desc, id desc (L7)
create index if not exists library_catalog_cache_keyset_idx
  on public.library_catalog_cache (go_live_date desc nulls last, id desc);

-- Status + most-downloaded sort helpers
create index if not exists library_catalog_cache_status_idx    on public.library_catalog_cache (status);
create index if not exists library_catalog_cache_downloads_idx on public.library_catalog_cache (download_count desc);

-- RLS: the catalog is public read for any authenticated subscriber; writes are service-role only.
alter table public.library_catalog_cache enable row level security;

drop policy if exists library_catalog_read on public.library_catalog_cache;
create policy library_catalog_read on public.library_catalog_cache
  for select to authenticated using (true);

-- (No insert/update/delete policy ⇒ only the service role, used by the sync, can write.)

comment on table public.library_catalog_cache is
  'Denormalized read-model of the Airtable Briefing Library (tbl4kbby85nx6Z891). Read-only for subscribers; written by the Airtable→Supabase sync. Airtable is never in the hot path.';
