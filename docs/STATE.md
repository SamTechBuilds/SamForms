# STATE — end of Phase 4

## Completed in Phase 4
- **Migration 0004** `supabase/migrations/20261114000004_response_management.sql` (admin-only):
  - `response_stats(form, tz)`: totals, last 7 and 30 days, a zero-filled 30-day series in the caller's time zone (validated against `pg_timezone_names`), and per-question summaries: counts for choice questions (including multiple choice), count/average/min/max for numeric and rating questions, and answered counts for everything else.
  - `delete_submission(id)`: deletes one response (its file rows cascade), queues its storage paths in `storage_cleanup` in the same transaction, and returns them.
  - `finish_storage_cleanup(paths)`: clears queue entries after the storage removal succeeds.
  - `storage_cleanup` table: no client access. Storage delete policy for admins only, inside a guarded `DO` block.
- **Responses page** `/forms/:id/responses`: totals, per-day bar chart, per-question breakdowns, a paged table (25 per page) with a local-date range filter, view and delete actions, and CSV and Excel export of everything that matches the filter.
- **Response detail** `/forms/:id/responses/:sid`: each answer labelled from the response's own form version; files open through 5-minute signed links; delete with confirmation.
- **Responses index** `/responses` lists published forms, replacing the Phase 4 placeholder. The forms menu also links to responses.
- **Export**: columns come from every version of the form (newest labels; questions that exist only in older versions are kept). CSV is RFC 4180, has a UTF-8 byte-order mark, and neutralises spreadsheet formulas (a leading `= + - @`, tab or CR gets an apostrophe; plain negative numbers are left alone). Excel uses `exceljs`, which loads only when someone exports.
- **Dependencies**: `exceljs` 4.4.0. Its `uuid` dependency had a moderate advisory, so `package.json` overrides `uuid` to `^11.1.1`. `npm audit --omit=dev` reports 0 vulnerabilities.

## Test results (executed in this sandbox)
- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `npx vitest run`: **20 files, 206 tests, all passing**. New: `tests/db/migration0004.test.ts` (5 tests: admin-only access, aggregates with nulls skipped, time-zone and form validation, delete with file queueing, unknown response); `src/features/responses/export.test.ts` (5 tests: column ordering across versions, file names in cells, CSV quoting, formula neutralising, Excel round-trip); `src/pages/ResponsesPage.test.tsx` (1 test).
- `npx vite build`: succeeds. Main chunk 840 kB (247 kB gzip); `exceljs` is a separate lazy chunk.

## NOT verified (honest gaps)
- Migration 0004 has only been run on PGlite, not on real Supabase. The storage delete policy runs only where the `storage` schema exists.
- Browser behaviour is untested: the table, filters, paging, chart, downloads, and signed-link opening have not been exercised in a real browser.
- Excel output is checked only by reading it back with `exceljs`. It has not been opened in Excel or LibreOffice.
- Exports are paged 500 rows at a time. Only small datasets were tested.
- Statistics count the last 7 and 30 days as rolling 24-hour periods. Per-day buckets follow the browser's time zone.

## Known limitations / decisions to revisit
- A file that cannot be removed from storage stays in `storage_cleanup`. Nothing retries it yet, so a scheduled cleanup job belongs in Phase 6.
- Export and filter use calendar dates in the browser's time zone. The server does not know the admin's time zone.
- Free-text search over responses is not implemented.
- `exceljs` has a moderate `uuid` advisory, mitigated by the override above. Re-check when either package updates.
- Respondent `user_agent` strings are shown in the detail view. They are not exported.

## Next recommended task
Phase 5 (AI document-to-form and prompt-to-form) needs an OpenRouter key and a decision on the model. Before that, run migrations 0001–0004 on a real Supabase project and confirm the storage policies, signed links and deletion.
