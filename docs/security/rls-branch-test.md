# RLS remediation: branch test (FDY-168 / BL-02)

**Date:** 2026-10-13.
**Result:** **branch test NOT run.** The development branch could not be created.

## What was attempted

1. `create_branch` on project `ycadmmngkdhvpcsrcuaq`, branch name `bl-02-rls-test`.
   Exact error: `MCP server "Supabase" tool "create_branch" timed out after 60s`.
2. `list_branches` immediately afterwards: `{"branches":[]}`.
3. Waited 60 seconds, then `list_branches` again: `{"branches":[]}`.

This is the second time the same timeout has occurred on this project (a prior attempt
timed out twice with the same result). Per the run rules, nothing fell back to production
and the attempt was not retried. No branch exists, so there was nothing to delete.

## What the branch would have tested

No migration was written (see `rls-blocked.md`), so there was no change to apply. The branch
was wanted to show empirically that `ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL
SECURITY` fails for the `postgres` role. That conclusion currently rests on the catalog:
`postgres` is not the owner, not a member of `supabase_admin`, and not a superuser.

## Advisor: before (production, 2026-10-13)

Security advisor on `ycadmmngkdhvpcsrcuaq`:

| Lint | Level | Count |
|---|---|---|
| `rls_disabled_in_public` | ERROR | **1** (`public.spatial_ref_sys`) |
| `anon_security_definer_function_executable` | WARN | 31 |
| `authenticated_security_definer_function_executable` | WARN | 134 |
| `function_search_path_mutable` | WARN | 24 |
| `extension_in_public` | WARN | 7 |
| `materialized_view_in_api` | WARN | 1 |
| `rls_enabled_no_policy` | INFO | 510 |

These match the BL-01 snapshot exactly.

## Advisor: after (branch)

**Not available.** No branch was created. Because no migration exists, applying "the
change" would be a no-op, and the expected after state is identical to the before state:
`rls_disabled_in_public` = 1, with `public.spatial_ref_sys` listed as a documented
exception in `rls-blocked.md`.
