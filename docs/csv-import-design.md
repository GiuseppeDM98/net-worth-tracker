# CSV Import Design

## Understanding Summary

- Build a CSV import feature for financial movements: expenses, income, dividends, investment operations, internal transfers, and settlements.
- Support both initial historical migration and recurring imports, starting with a conservative and safe V1.
- Use one Net Worth Tracker CSV format, not bank- or broker-specific exports.
- Use one mixed CSV file with a `movement_type` column.
- Provide preview and manual confirmation before any write.
- Resolve references by readable names already present in the app. Missing or ambiguous names are blocking row errors.
- Block duplicate rows before import.
- Apply the same domain effects as existing forms: cash balances, investment quantities/average cost, dividend income sync where applicable, and internal cash transfers.
- Treat settlements in V1 as internal transfers with purpose `settlement`.
- Place the feature in Settings under an "Importazione dati" area, with CSV template download, example rows, and a column guide.

## Assumptions

- V1 supports up to 5,000 rows per CSV file.
- Larger imports are split across multiple files.
- CSV separator is only `;`.
- CSV headers use stable technical English names.
- Dates use ISO format: `YYYY-MM-DD`.
- Amounts in the CSV are positive; the system applies the correct sign by movement type.
- Parsing and first-pass validation happen client-side for preview.
- Server-side validation is mandatory and authoritative before commit.
- No write starts if any row has blocking errors or duplicate conflicts.
- The original CSV file is not stored after upload/preview.
- The feature is disabled in demo mode.
- Private import endpoints verify Firebase UID server-side.
- Each created record gets `importRunId`; rows may also carry optional `external_id`.
- Import history is visible in the UI.
- Rollback after technical failure is best-effort and uses an import journal.

## Recommended Approach

Use client-side preview with server-side import orchestration.

The client reads the CSV, validates basic structure, and shows a preview. On confirmation, the server revalidates all rows against authenticated user data, checks duplicates, creates an import run, writes records, applies asset/cash effects, and updates import status. If a technical failure happens after partial writes, the server uses the import journal and `importRunId` to attempt cleanup.

This avoids a server-side temporary CSV storage pipeline in V1 while still keeping security and domain consistency on the server.

## CSV Format

Common columns:

- `movement_type`
- `date`
- `amount`
- `currency`
- `description`
- `cash_account`
- `notes`
- `external_id`

Supported `movement_type` values:

- `expense`
- `income`
- `dividend`
- `investment`
- `transfer`
- `settlement`

Cashflow-specific columns:

- `category`
- `subcategory`
- `cost_center`
- `attribution_profile`

Dividend-specific columns:

- `asset`
- `ex_date`
- `payment_date`
- `dividend_per_share`
- `quantity`
- `gross_amount`
- `tax_amount`
- `net_amount`
- `dividend_type`

Investment-specific columns:

- `asset`
- `operation_type`
- `quantity`
- `price_per_unit`
- `fees`
- `taxes`

Transfer and settlement columns:

- `from_cash_account`
- `to_cash_account`
- `fees`
- `transfer_purpose`

Rows use only the columns relevant to their movement type. Unused columns may stay empty. The app should provide a downloadable template with examples for every movement type and an Italian UI guide explaining each column.

## Validation And Deduplication

Client validation catches fast feedback issues:

- Missing required headers.
- Separator other than `;`.
- Invalid ISO dates.
- Invalid numbers.
- Unsupported `movement_type`.
- Missing required fields for a movement type.

Server validation repeats all structural checks and resolves names against the authenticated user's data:

- Categories and subcategories.
- Assets.
- Cash accounts.
- Cost centers.
- Household attribution profiles.

Zero matches or multiple matches are blocking errors. No record is written if any row fails validation.

Duplicate detection is blocking. Suggested keys:

- `expense` / `income`: type, date, normalized amount, category, subcategory, cash account, description/notes.
- `dividend`: asset, payment date, ex date, gross/net/tax amount, dividend type.
- `investment`: asset, operation type, date, quantity, price per unit, fees, taxes, cash account.
- `transfer` / `settlement`: from account, to account, date, amount, fees, purpose.

If `external_id` is present, it becomes the strongest deduplication key together with user and `movement_type`.

## Architecture

UI:

- Add an "Importazione dati" section in Settings.
- Include template download, CSV upload, preview, error filtering, confirmation, and import history.
- Preview shows row count, valid rows, blocking errors, duplicate conflicts, and breakdown by `movement_type`.
- For 5,000 rows, paginated rendering is enough for V1.

Suggested endpoints:

- `POST /api/imports/csv/validate`
- `POST /api/imports/csv/{runId}/commit`

The validate endpoint performs authoritative server-side checks and creates an import run in `validated` or `validation_failed` state. The commit endpoint revalidates the request/run consistency, writes data, records a journal, and updates final state.

## Write Flow And Rollback

Commit flow:

1. Create or update `importRuns/{runId}` with status `running`.
2. Write records in Firestore batches where appropriate.
3. Apply asset/cash deltas through server-side domain logic.
4. Add `importRunId` and optional `externalId` to created records.
5. Record a journal of created record IDs and asset/cash deltas.
6. Mark the run `completed`.
7. Invalidate affected dashboard overview/materialized data.

Failure handling:

- If a failure happens during writing, attempt best-effort rollback.
- Rollback must delete created records and reverse asset/cash deltas.
- If cleanup succeeds, status becomes `failed_rolled_back`.
- If cleanup is incomplete, status becomes `failed_cleanup_needed`.

This is not a global Firestore transaction. V1 relies on full prevalidation plus rollback best-effort because imports can exceed single transaction/batch limits.

## Import History

Use a private `importRuns` collection keyed by authenticated user.

Store:

- `userId`
- `fileName`
- `fileSize`
- `rowCount`
- `validRowCount`
- `errorCount`
- `duplicateCount`
- movement type breakdown
- `status`
- timestamps: `createdAt`, `validatedAt`, `startedAt`, `completedAt`, `failedAt`
- `errorSummary`
- optional `sourceHash`

Statuses:

- `validating`
- `validated`
- `validation_failed`
- `running`
- `completed`
- `failed_rolled_back`
- `failed_cleanup_needed`

Do not store the full original CSV. Store metadata, hash, status, counts, and limited error summaries.

## Testing Strategy

Pure utility tests:

- CSV parser for `;`.
- Header validation.
- Movement type schema.
- Required fields per type.
- ISO date parsing.
- Numeric parsing.
- Deduplication key generation.
- Name resolution ambiguity handling.

Route/use-case tests:

- Missing or invalid auth.
- Cross-user resource references rejected.
- Missing names rejected.
- Ambiguous names rejected.
- Duplicate rows rejected.
- Valid mixed import succeeds.
- Technical failure triggers rollback journal.
- Cleanup failure marks `failed_cleanup_needed`.

## Risks

- 5,000 rows can still exceed a single Firestore batch, so imports require multiple writes.
- Rollback must reverse asset/cash effects, not only delete imported records.
- Name-based references are user-friendly but fragile when names are duplicated or renamed.
- Server and client validation can drift unless schemas/utilities are shared.
- Import history must avoid storing sensitive raw CSV contents.

## Decision Log

- Use a V1 Net Worth Tracker CSV format instead of bank/broker-specific parsers.
- Use one mixed CSV with `movement_type`.
- Use preview and manual confirmation before writes.
- Use readable names for references, not internal IDs.
- Treat missing or ambiguous names as blocking errors.
- Treat duplicates as blocking errors.
- Apply the same side effects as existing forms.
- Represent settlements as internal transfers with purpose `settlement`.
- Put the feature in Settings under "Importazione dati".
- Provide template download, example rows, and an Italian column guide.
- Use English technical CSV headers.
- Use only `;` as CSV separator.
- Limit V1 to 5,000 rows per file.
- Show import history in UI.
- Use best-effort rollback on technical failure.
- Recommend client-side preview plus server-side authenticated orchestration.
