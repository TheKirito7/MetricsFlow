# REST API

Base path: `/api/v1`. Interactive OpenAPI: `http://localhost:8000/docs`. Machine-readable schema: `/openapi.json`. Resource IDs are UUIDs. Business data is scoped to the organization in the authenticated membership, not an organization query parameter.

## Authentication

`POST /auth/login` accepts `{ "email": "...", "password": "...", "organization_id": "optional membership-verified UUID" }`. It sets an HTTP-only `metricsflow_session` cookie and returns the same shape as `GET /me`:

```json
{
  "id": "user UUID",
  "name": "Alex Morgan",
  "email": "configured development email",
  "role": "admin",
  "organization": {
    "id": "organization UUID",
    "name": "Northstar Studio",
    "timezone": "Europe/Lisbon",
    "currency": "EUR"
  },
  "csrf_token": "per-session token",
  "session_expires_at": "2026-10-27T20:00:00",
  "read_only_demo": false
}
```

All POST, PATCH, and DELETE calls require an exact trusted `Origin`, including login. Authenticated mutations also require `X-CSRF-Token` from `/me`. Include cookies. `POST /auth/logout` returns 204, deletes the session, and clears its cookie. `/me` returns 401 if the session is missing or expired. Sessions expire after eight hours by default.

After verifying a password, an account with multiple memberships receives `200 {requires_workspace: true, workspaces: [{id, name, role}]}` without a session cookie. The browser presents these choices, then submits the credentials again with the selected `organization_id`. Membership is re-verified before creating a session. Invalid credentials never disclose workspace names. Passwords remain in form memory and are cleared on successful sign-in or account change.

Login failures return a generic 401. Throttling returns 429 with `Retry-After: 900`. Development allows `.test` login domains; production uses normal email validation. There is no public signup, password reset, or user-administration API in the MVP.

## Endpoints

| Method | Path                        | Access / behavior                                                                     |
| ------ | --------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/health`                   | Public; checks database connectivity                                                  |
| POST   | `/auth/login`               | Trusted origin; authenticated membership selection                                    |
| POST   | `/auth/logout`              | Authenticated + CSRF; 204                                                             |
| GET    | `/me`                       | Authenticated profile, role, current organization, CSRF                               |
| GET    | `/customers`                | Search/filter/sort/paginate                                                           |
| POST   | `/customers`                | Admin; create, 201                                                                    |
| GET    | `/customers/{id}`           | Profile plus latest 50 subscriptions, transactions, and profile audit events          |
| PATCH  | `/customers/{id}`           | Admin; validated profile update                                                       |
| DELETE | `/customers/{id}`           | Admin; archive, 204; retains all records                                              |
| GET    | `/plans`                    | Tenant plan list                                                                      |
| POST   | `/plans`                    | Admin; create, 201                                                                    |
| PATCH  | `/plans/{id}`               | Admin; affects future subscription assignments                                        |
| GET    | `/subscriptions`            | Status/customer filter, server pagination                                             |
| POST   | `/subscriptions`            | Admin; snapshots owned plan price, 201                                                |
| GET    | `/subscriptions/{id}`       | Subscription plus latest 50 lifecycle audit events                                    |
| PATCH  | `/subscriptions/{id}`       | Admin; lifecycle transition                                                           |
| GET    | `/transactions`             | Filters, sorting, pagination, filtered status sums                                    |
| POST   | `/transactions/simulate`    | Admin + CSRF; 201 created, 200 replay, 404 unknown/foreign subscription, 409 conflict |
| GET    | `/transactions/{id}`        | Ledger record and customer name                                                       |
| GET    | `/analytics/overview`       | Full reporting envelope                                                               |
| GET    | `/analytics/revenue`        | Same reporting envelope; convenient domain alias                                      |
| GET    | `/analytics/customers`      | Same reporting envelope; convenient domain alias                                      |
| GET    | `/analytics/subscriptions`  | Same reporting envelope; convenient domain alias                                      |
| GET    | `/reports/transactions.csv` | All matching rows, bounded to 50,000; viewers allowed                                 |
| PATCH  | `/organization`             | Admin; organization name and valid IANA timezone                                      |

All protected reads permit admin and viewer. All business mutations require admin, independent of the UI.

## Customer input and pagination

Create: `{name, email, company?}`. PATCH accepts any subset of `{name, email, company, status}`. Omitted fields retain their stored values; `company: null` explicitly clears company. Explicit null name/email/status is rejected. An archived customer remains archived unless status is explicitly changed. Name is trimmed, email is normalized to lowercase, and email uniqueness is per organization. Archived records may be restored by updating status to `active`.

List parameters: `search`, `status=active|archived`, `sort=name|email|created_at`, `order=asc|desc`, `page` (1-based), `page_size` (1–100, default 20). Search matches literal substrings in name or email; SQL wildcard characters are escaped. Sorts have a UUID tie-breaker.

Paginated responses contain `{items, total, page, page_size}`. Missing records, including another tenant’s records, return 404. Validation failures return 422. Duplicate customer emails return 409.

## Plans and subscriptions

Plan create/update: `{name, price_cents, interval}`. `price_cents` is a positive integer, at most 100,000,000; interval is `monthly|yearly`. Currency is EUR. Subscription create: `{customer_id, plan_id, status?}` with `active|trial`, default active. Both linked records must belong to the authenticated organization; an archived customer cannot receive a new subscription (409).

Subscription PATCH: `{status: "active"|"cancelled"|"expired"}`. Allowed transitions are documented in [METRICS.md](METRICS.md); invalid transitions return 409. Existing snapshots cannot be edited through the API. List parameters: `status`, `customer_id`, `page`, `page_size`. Order is newest first.

## Transactions and CSV

Parameters: `status=paid|pending|failed|refunded`, `start_date`, `end_date`, `customer_id`, `sort=timestamp|amount_cents`, `order=asc|desc`, `page`, `page_size`. If dates are omitted the ledger includes all history; the UI supplies an explicit selected range. A supplied partial date range uses the same defaults as analytics.

The response extends pagination with `summary: {paid_cents, pending_cents, failed_cents, refunded_cents, count}` across **all filtered records**, independent of the current page. CSV accepts the same filters/sort, ignoring pagination so it exports the full matching result. It contains UUID, customer name, integer cents, currency, status, UTC timestamp, and external reference. A range exceeding the export bound returns 422; narrow the filters. Spreadsheet-like customer/reference values are prefixed with an apostrophe.

There is no live payment integration. `POST /transactions/simulate` is admin-only and accepts `{subscription_id, idempotency_key}` with UUID values. It returns 201 for a new simulated paid transaction and 200 for an identical replay. A conflicting key or non-billable subscription returns 409; another tenant’s subscription returns 404. Price and currency come from the saved subscription snapshot. The unique `(organization_id, idempotency_key)` constraint protects concurrent retries, and an audit event is written atomically.

## Analytics

Accepts optional inclusive `start_date=YYYY-MM-DD` and `end_date=YYYY-MM-DD`; defaults to the last 30 days in the organization timezone. Dates must be ordered, no more than 731 inclusive dates, and not in the future. Returns `start_date`, `end_date`, `timezone`, `snapshot_at`, `current`, `previous`, `churn_percent`, `paid_cents`, `previous_paid_cents`, nullable `revenue_growth_percent`, `new_customers`, `trend`, and `plans`.

Snapshot objects contain `mrr_cents`, `arr_cents`, `active_subscriptions`, `paying_customers`, and `arpu_cents`. Trend rows contain `date`, `mrr_cents`, `paid_cents`, `customers`, `new_subscriptions`, and `cancelled_subscriptions`. Plan rows contain `name`, `subscriptions`, `mrr_cents`, and `paid_cents`. See the exact financial and timezone definitions in [METRICS.md](METRICS.md).

## Errors

Errors consistently use a human-readable `detail`. Validation errors also include `errors: [{field, message}]` without echoing sensitive submitted input. Unexpected exceptions return a generic 500. SQLAlchemy integrity errors roll back and return 409. Request IDs and response security headers support troubleshooting; internal exception content is never returned to the browser.

Analytics responses include `history_start`, `snapshot_comparison_available` and `revenue_comparison_available`. Unavailable revenue comparisons return null. Each plan metric includes `plan_id`; plan names are labels and need not be unique. Duplicate names are distinguished by short IDs in the UI. A session selects one verified workspace; sign out and sign in again to select another. Public demo mode rejects all business mutations with 403, including requests from an admin session.
