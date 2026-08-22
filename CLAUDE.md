# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

小庄 (xiaozhuang) — a Chinese-language Next.js app that surfaces classical Chinese poetry/prose/I-Ching wisdom for modern expression. Four modules under `app/`:

- **`/xun`** (寻章) — describe a scene → LLM finds a matching classical line, with source + explanation. Vision-capable: photo upload, image compression pipeline, and photo-template share card are implemented in `app/xun/xun-client.tsx` (`PHOTO_INPUT_ENABLED = true` since 2026-08-22, when DeepSeek shipped `deepseek-v4-flash-vision-exp` — see AI provider note below).
- **`/gua`** (问心) — I-Ching divination: client simulates yarrow-stalk hexagram casting, LLM interprets. Interpretations are cached in Supabase (`xz_gua_interpretations`) keyed by hexagram + changing lines.
- **`/xie`** (述怀) — writes a short classical-style passage in the user's chosen voice (楚辞/道家/史传/词/禅语/唐宋古文/骈文/心学), from a modern feeling described by the user.
- **`/du`** (慢读) — daily email digest of 经史百家杂钞 (a Qing-dynasty classical prose anthology curated by Zeng Guofan). Has its own subscription flow, admin panel (`/du/admin`), a "library" browser by volume (`/du/library`), an author "star map" visualization, and a consolidated per-article reading view (`/du/article/[id]`, see below).

Each module is a self-contained `page.tsx` + `<name>-client.tsx` + `<name>.css` under `app/<name>/`. There is no shared component library between modules for module-specific UI — shared logic lives in `lib/`. The exception is `app/components/` (added 2026-08-17), rendered from `app/layout.tsx` on every route: `SiteNav.tsx` (sticky top nav, active-state via `usePathname()`) and `SiteFooter.tsx` (footer — previously only existed on the homepage, an oversight fixed the same day). `app/page.tsx` also renders `ModuleShowcase.tsx` from there — a client component that replaced the homepage hero's static brand copy with a card that auto-rotates through the four modules' own hero content (`subtitle`/`title`/`description`/`quote`, copied verbatim from each module's `<name>-client.tsx`, not paraphrased) and links to that module. If more truly cross-module UI shows up, `app/components/` is where it goes.

## Commands

```bash
npm run dev      # start dev server
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
```

There is no test suite in this repo — verify changes via `npm run build` and manual testing in the browser.

Content-pipeline scripts (run with `npx tsx scripts/<file>.ts`, require `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`):
- `parse-jingshi.ts` / `jingshi-parser.ts` — parse `data/经史百家杂钞.txt` into passage records
- `seed-jingshi.ts` / `seed-volume.ts` — load parsed passages into Supabase (`--volume=N` to scope)
- `backfill-jingshi-volume.ts`, `backfill-author-stats.ts`, `backfill-authors-articles.ts` — one-off data fixups
- `dedupe-du-passages.ts` — dedupe passages
- `generate-payloads.ts` — batch-generate the AI `payload` (summary/translation/keywords/structure/insight) for passages missing one

`data/library-progress.md` tracks per-volume ingestion status for the 经史百家杂钞 pipeline — check/update it when adding volumes.

## Architecture

### LLM access — always through the relay, no in-app route

There is exactly one LLM entrypoint, and it is not part of this Next.js app: **`relay/llm-proxy.mjs`**, a standalone, dependency-free Node HTTP server deployed separately (`relay.air7.fun`, run via pm2 on the `air7` host). It accepts `{ messages, temperature, max_tokens }`, auto-selects the vision model when any message contains an `image_url` part, injects `thinking: { type: 'disabled' }`, and always streams back plain text (not SSE/JSON).

- Client components call it via `LLM_API_URL` from `lib/llm.ts` = `process.env.NEXT_PUBLIC_LLM_URL` (no fallback — the module throws at import if unset).
- Server-side code (`lib/du-server.ts`'s `generateDuPayload` / `generateTextWithLLM`, used by 慢读's payload and author/article backfill) calls the same relay URL via `env.duLlmUrl` (also `NEXT_PUBLIC_LLM_URL`), with its own retry/timeout wrapper (`timeoutFetch`, 3 attempts, 20-25s each).
- Do not add a second LLM call path — extend `llm-proxy.mjs` instead.
- **2026-08-17**: this used to be two parallel paths — an in-app Edge route `app/api/llm/route.ts` (self-called by `du-server.ts` via `${APP_BASE_URL}/api/llm`, configured with its own `AI_API_KEY`/`AI_API_BASE_URL`/`AI_PRIMARY_MODEL`/`AI_VISION_MODEL` Vercel env vars) plus the relay mirroring its contract for the three client generators. They were consolidated onto the relay alone — `route.ts` is deleted, the `AI_*` Vercel env vars are no longer read by any code path (delete them from the Vercel dashboard; that step still needs to be done manually). **Trade-off to know**: this makes the relay a single point of failure — if the `air7` pm2 process is down, *every* LLM-dependent feature is down, including 慢读's admin "regenerate" button, not just the three interactive modules.

**AI provider note**: the upstream is DeepSeek (`https://api.deepseek.com`, `deepseek-v4-flash` primary / `deepseek-v4-flash-vision-exp` vision) — the previous 火山方舟 (Volcengine Ark) "coding plan" endpoint (`ark.cn-beijing.volces.com/api/coding/v3`) stopped accepting these models (`404 UnsupportedModel`) and was replaced. `llm-proxy.mjs`'s `hasVisionInput` auto-routes any request containing an `image_url` content part to `AI_VISION_MODEL` (set on the air7 deploy since 2026-08-22). It also injects `thinking: { type: 'disabled' }` into every upstream request body — `deepseek-v4-flash` is a reasoning model that otherwise burns the shared `max_tokens` budget on hidden `reasoning_content` before emitting the actual answer, which silently produces empty responses for prompts that need more "thought" (observed on `/xie`).

### Data access — raw Supabase REST, no ORM/client SDK

`lib/du-server.ts` and `lib/gua-server.ts` both hand-roll a `supabaseFetch` helper that calls the PostgREST endpoint directly (`${SUPABASE_URL}/rest/v1/...`) with the service-role key — there is no `@supabase/supabase-js` dependency. When adding queries, follow this same pattern (URL-encoded PostgREST filters, `Prefer` headers for upsert/merge behavior, manual pagination via `Range`/`Range-Unit` headers or `count=exact`).

Tables (see `supabase/migrations/`): `xz_du_subscribers`, `xz_du_passages`, `xz_du_daily_runs`, `xz_du_authors`, `xz_du_articles`, `xz_gua_interpretations`. New tables need explicit `grant` statements for `anon`/`authenticated`/`service_role` or PostgREST returns 403.

### 慢读 (du) content model

A `xz_du_passages` row holds the raw classical text plus an AI-generated `payload` (JSON: `summary`, `translation`, `keywords[]`, `structure`, `insight` — shape defined in `data/du-prompt.ts` as `DuOutput`). Multi-part articles are split into rows whose `title` ends in `（N）`; `parseSegment`/`getPassageContext` in `lib/du-server.ts` reassemble sibling segments for prev/next navigation and reading context. Passages are organized into numbered `volume`s, grouped in the UI into three 门 (著述/告语/记载) per `app/page.tsx`'s `VOLUME_GROUPS`.

Daily send flow: `app/api/du/cron/prepare` picks an unsent passage (`pickTodayPassage`, only those with `payload` already generated) and records a `xz_du_daily_runs` row; `app/api/du/cron/send` emails active subscribers via Resend (`sendDuEmails`, batch API) and marks the passage sent. Both cron routes are protected by `verifyCronSecret` (checks `CRON_SECRET` or Vercel's own `VERCEL_CRON_SECRET`) and send a Resend alert email (`sendCronAlertEmail`) on failure — preserve that alerting when touching cron logic.

Author/article metadata (`xz_du_authors`, `xz_du_articles`) is lazily backfilled the first time a passage from a new author/article is touched (`enrichPassageMeta`), rather than pre-populated for all rows.

**Consolidated article view** (`/du/article/[id]`, `app/du/article/[id]/article-client.tsx`): reads a whole multi-segment article in one page instead of jumping between per-segment pages. `getArticleView` in `lib/du-server.ts` takes any segment's passage id, resolves all sibling segments (same `source_origin` + base title, read-only), and returns them together. Every article has exactly one canonical URL — its first segment's id — visiting any other segment's id 307-redirects to it. Desktop (≥880px) renders a two-column reader (left: full original text, click a segment to select it; right: that segment's interpretation, `position: sticky`); below 880px the right column collapses into a bottom sheet (same open/close pattern as the existing share-image sheet) instead of a second column. `/du/library/[volume]` and `/du/author/[name]` article lists link here now, not to `/du/preview/[id]` (which still exists and still works, just isn't linked from those two listing pages anymore). This is purely additive/read-only — it does not touch the cron send flow, the email template, or any existing route.

### Share cards

`lib/share-card.ts` is a client-only Canvas-based share-image generator shared by all four modules (each module still builds its own canvas layout, but footer branding/QR code, blob conversion, and the Web Share API fallback are centralized here). It's safe to import from `'use client'` components since Canvas APIs only run inside functions, never at module scope.

`lib/text-format.ts` holds `renderSimpleMarkdown` (bold + numbered lists only), shared between `du-day-client.tsx` and the article view's `article-client.tsx` — both render the AI-generated `structure` field through it.

### Routing quirks

`/miao` and `/api/miao/*` permanently redirect to `/du` and `/api/du/*` respectively (`next.config.ts`) — `du` is a renamed legacy module called 喵读/miao.

## Environment

See `README.md` for the full `.env.local` variable table. Required for local dev: `AI_API_KEY`, `AI_API_BASE_URL`, `AI_PRIMARY_MODEL` (LLM); `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (慢读 + 问心 caching); `RESEND_API_KEY`, `DU_FROM_EMAIL` (慢读 email); `CRON_SECRET`, `APP_BASE_URL` (cron protection).

## Documentation

This project maintains exactly **three** documents at the repo root — do not create new doc files or a `docs/` directory (a `docs/` folder existed and was merged back into `PRODUCT.md` on 2026-08-17):

- `README.md` — outward-facing: what 小庄 is, setup, env var table. Tracked.
- `PRODUCT.md` — product design: positioning, module roles, roadmap, visual system, 文库星图 spec. Gitignored.
- `TODO.md` — tasks: current priorities, open decisions, known defects/tech debt, completed log. Gitignored.

Anything that would otherwise become a new design note, handoff, or review write-up goes into `PRODUCT.md` (design intent) or `TODO.md` (work items and decisions). `PRODUCT.md`/`TODO.md` are present locally but not tracked — don't assume they exist in a fresh checkout.

(`CHANGELOG.md` and `data/library-progress.md` also exist but are release/pipeline ledgers, not docs.)
