# RLS remediation: blocked tables and exceptions (FDY-168 / BL-02)

**Measured:** 2026-10-13, read-only, on production project `ycadmmngkdhvpcsrcuaq`.
**Source of scope:** `docs/security/rls-state-2026-10-13.md` (BL-01 / FDY-167).

## Scope

The BL-01 snapshot lists exactly one RLS-disabled table in `public`: `spatial_ref_sys`.
That is the only table in scope for BL-02. The production security advisor still agrees on
2026-10-13 (`rls_disabled_in_public` = 1, `public.spatial_ref_sys`).

**No migration was written,** because the one in-scope table cannot be altered by the
migration role. The reason is below.

## Exception: `public.spatial_ref_sys`

| Check | Result |
|---|---|
| RLS enabled | no |
| Owner | `supabase_admin` |
| Extension member | yes, `postgis` 3.3.7 |
| PostGIS schema | `public` |
| `extrelocatable` | **false** |
| Migration role | `postgres` |
| `postgres` is superuser | no |
| `postgres` is a member of `supabase_admin` | no |
| Policies | 0 |
| Rows | 8,500 (EPSG reference data) |
| Dependent views (`pg_rewrite` via `pg_depend`) | none |
| Dependent functions (`pg_depend`) | none |

**Why it is blocked.** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` both
require ownership of the table. `postgres` is neither the owner, a member of the owner role,
nor a superuser, so both statements would fail with `must be owner of table spatial_ref_sys`.
This is a catalog-based conclusion. It was not exercised on a branch, because the development
branch could not be created (see `rls-branch-test.md`). No DDL was run against production.

**Dependent-object check.** Nothing in `pg_depend` depends on this table, so enabling RLS
would not have cut data off from any view or function. The block is ownership only.

**Supabase position.** Supabase documents `spatial_ref_sys` as a known advisor exception
for projects with PostGIS installed in `public`. The documented remedy is to move PostGIS
out of `public`.

**Alternative remedy (NOT in BL-02's scope, not attempted).** Move the `postgis` extension
into an `extensions` schema. Because `extrelocatable = false`, `ALTER EXTENSION postgis SET
SCHEMA extensions` is not available. It needs a drop and re-create of the extension, which
cascades to every column, index and function that uses PostGIS types across the estate
(geometry columns on census, grid-boundary, parcel and WTR tables among others). That is a
separate, high-blast-radius change that needs its own ticket, a full dependency inventory
and a maintenance window.

## Additional finding (out of scope, recorded for follow-up)

The table ACL is:

```
{supabase_admin=arwdDxtm/supabase_admin, postgres=arwdDxtm/supabase_admin,
 anon=arwdDxtm/supabase_admin, authenticated=arwdDxtm/supabase_admin,
 service_role=arwdDxtm/supabase_admin, =r/supabase_admin}
```

`anon` and `authenticated` hold **INSERT, UPDATE, DELETE and TRUNCATE** on this table, not
just SELECT, and RLS does not stand in front of them. A caller with the publishable key can
in principle modify or truncate the EPSG table through PostgREST. That would break every
PostGIS transform in the database. `postgres` holds these privileges without grant option,
so it cannot revoke them either. The fix has to be made as `supabase_admin` (a Supabase
support request), or by moving PostGIS as above. This is more urgent than the RLS lint
itself and should get its own ticket.

## Already compliant (no action)

These five tables were named in FDY-168 but already have RLS enabled, per the BL-01
snapshot §2.1. They are out of scope and no migration was written for them.

| Table | RLS | Owner | Category |
|---|---|---|---|
| `reg_state_zoning_authority` | enabled | postgres | unpublished scoring input |
| `reg12_county_zoning_posture` | enabled | postgres | unpublished scoring input |
| `epa_aqs_monitor_coverage` | enabled | postgres | unpublished scoring input |
| `jpas_attribute_registry_bak_cc_zwa_10` | enabled | postgres | backup |
| `cc_com_reweight_baseline_20260825` | enabled | postgres | baseline |

Note from the BL-01 snapshot §2.2 and §3: deny-all RLS is the only control on tables of
this kind. `anon` still holds table-level grants on the FDY-164 set. Revoking those grants
is outside this issue.
