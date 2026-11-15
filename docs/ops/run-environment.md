# Run environment — BL3-10 (FDY-336)

What an unattended Claude Code session needs to run the lanes, the review chain and the Notion
status log for the Briefing Library, and the one command that proves it.

**Owner of every value below: Myke** (setting or rotating secrets is Tier 3 in the orchestration
contract). An agent only runs the verifier and reports PASS/FAIL. No value is ever pasted into a
chat, a PR, a Linear comment or a commit.

## 1. Cloud environment "Faraday (Supabase access)"

Where: claude.ai → Claude Code → the cloud environment menu in the session's title bar →
**Faraday (Supabase access)** → **Edit**. A new session picks the change up (running sessions do not).

### Environment variables (exact names)

| Variable | Value | Read by |
|---|---|---|
| `SUPABASE_URL` | `https://ycadmmngkdhvpcsrcuaq.supabase.co` | lanes, review chain, publish-batch, verifier |
| `SUPABASE_SERVICE_ROLE_KEY` | the **Faraday** project's legacy JWT `service_role` key (Supabase → Project `ycadmmngkdhvpcsrcuaq` → Settings → API). Paste the bare value: **no quotes of any kind**, no spaces. | same |
| `NOTION_TOKEN` | internal-integration token of a Notion integration that the page *Briefing Library V2.0 Regeneration Status Log* (`41389a0c1680803dbb99e929c19d402d`) is shared with (page → ••• → Connections → add the integration) | `scripts/statuslog.mjs` |
| `ANTHROPIC_API_KEY` | an Anthropic API key | `scripts/lanes/llm.mjs` (thesis/Take polish), BL3-08 |
| `NODE_USE_ENV_PROXY` | `1` | Node ≥ 22.21 — makes `fetch` use the session's `HTTPS_PROXY`; without it every Node egress call fails |

Known bad states the verifier catches (2026-11-12 evidence): the Default environment's
`SUPABASE_SERVICE_ROLE_KEY` belonged to project `uuzzfeaevxilwizaittq` ("Throughline") and was wrapped
in typographic quotes (`“…”`), so PostgREST answered "Invalid API key".

> An opaque `sb_secret_…` key works with PostgREST but carries no project ref, so check (b) cannot
> prove it belongs to Faraday and reports FAIL. Use the legacy JWT `service_role` key.

### Network → allowed hosts (exactly these four)

1. `ycadmmngkdhvpcsrcuaq.supabase.co` (already allowed)
2. `api.notion.com`
3. `api.anthropic.com`
4. `github.com`

Package registries stay on (default).

## 2. Vercel — root project `faraday-briefing-library`

Where: Vercel → project **faraday-briefing-library** → Settings → Environment Variables →
`CRON_SECRET` (Production). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` to
`/api/library/sync` every 15 minutes (`vercel.json`); the route returns 403 without it. Redeploy
after adding it. Proof: the cron invocation of `/api/library/sync` shows 200 in Vercel → Logs, and
`library_catalog_cache.synced_at` advances.

## 3. Verify (agent, from the run environment)

```bash
node scripts/ops/check-run-env.mjs
```

One line per check, `PASS|FAIL|SKIP <id> <name> <reason>`, then the overall result. Exit 1 on any FAIL.

| id | check | PASS when |
|---|---|---|
| a | env-names | the four secret names above are set (non-empty) |
| b | service-key | no leading/trailing quote characters (ASCII or typographic), no leading/trailing whitespace and no whitespace/control/non-ASCII characters inside (stricter than "quotes only": a stray space or newline breaks the header too), and the JWT payload's `ref` is `ycadmmngkdhvpcsrcuaq` |
| c | supabase-rest | `GET <SUPABASE_URL>/rest/v1/briefings?select=id&limit=1` with the key → 200 (and `SUPABASE_URL` is the Faraday host, so the key is never sent elsewhere) |
| d | notion-egress | `HEAD https://api.notion.com` gets any HTTP answer (a network/proxy error = not on egress) |
| e | notion-page | `GET /v1/pages/41389a0c1680803dbb99e929c19d402d` with `NOTION_TOKEN` → 200 (404 = page not shared with the integration) |
| f | anthropic-egress | `HEAD https://api.anthropic.com` gets any HTTP answer |
| g | node-proxy | `NODE_USE_ENV_PROXY=1` whenever `HTTPS_PROXY` is set (SKIP when there is no proxy) |

In a cloud session (`HTTPS_PROXY` is always set there) a correct environment prints **7 × PASS**.
Outside a proxy, (g) is SKIP and the overall result is still PASS. A credential containing a
control or non-ASCII character is reported FAIL and **never sent**, because the HTTP client's error
would otherwise quote the header value.

Then prove the status log is written from the environment itself, not relayed:

```bash
node scripts/ops/check-run-env.mjs --write-test
```

This appends one line under **## Log** on the status page:
`YYYY-MM-DD HH:MM CT · BL3-10 · env check · PASS · 7 PASS, 0 FAIL, 0 SKIP; written from the run environment by scripts/ops/check-run-env.mjs`
(the actual result is written, so a failing environment logs FAIL). `--json` prints machine-readable results.

**Secret hygiene, enforced in code and tests:** variables are checked by name; the only content read
from the service key is its JWT `ref` claim; HTTP error bodies and header-validation messages are
never echoed; every known secret value (and any fragment of it) is redacted from error text.

## 4. Done-when for FDY-336

- [ ] (Myke) §1 variables and the four allowed hosts set on "Faraday (Supabase access)".
- [ ] `node scripts/ops/check-run-env.mjs` → 7 × PASS in a new session on that environment.
- [ ] `--write-test` line visible under ## Log on `41389a0c1680803dbb99e929c19d402d`.
- [ ] (Myke) §2 `CRON_SECRET` on the Vercel root project; `/api/library/sync` cron → 200.

Re-run the verifier at the start of any session that runs lanes, the review chain or publish-batch
(BL3-12 depends on it).
