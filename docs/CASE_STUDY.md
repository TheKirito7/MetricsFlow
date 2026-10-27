# MetricsFlow: making subscription metrics explainable

MetricsFlow is a full-stack subscription analytics application for a fictional European SaaS business. A number on the dashboard must be traceable to customer relationships, saved billing terms, and ledger records.

[Product tour](demo/metricsflow-tour.webm) · [Metric definitions](METRICS.md) · [Source and CI](https://github.com/TheKirito7/MetricsFlow)

## Product problem

Recurring revenue describes active contractual charges at a reporting instant. Collected revenue describes successful payments during a period. Combining them produces misleading business meaning.

The overview presents snapshot KPIs with explicit dates and within-period changes. The ledger presents period totals, independently filtered and exportable. Customers with several subscriptions demonstrate why paying customers and active subscriptions are different denominators.

## Architecture

React and strict TypeScript provide the interface. TanStack Query owns server state; filters live in the URL. Shared controls use Tailwind tokens and accessible Radix primitives. Domain CSS handles responsive layout and charts. FastAPI, SQLAlchemy, Alembic, and PostgreSQL form a modular monolith. Routes validate and authorize; services implement billing rules and metrics; repositories scope database operations.

A request uses one database transaction. Subscription assignment copies the plan's price, interval, currency, and name. Editing a plan changes future assignments without rewriting historical revenue. Decimal normalization handles annual charges; records store integer cents. Organization-local boundaries convert to UTC, including daylight-saving transitions.

## Security decisions

The server resolves an opaque, hashed session to a verified membership. The browser cannot select an arbitrary tenant by changing a parameter. Admin dependencies protect every business mutation; foreign resources return 404. Multi-workspace accounts choose among verified memberships after password verification.

Argon2id, HTTP-only cookies, CSRF tokens, exact-origin checks, expiry, session rotation, and persistent login throttles form the authentication boundary. PostgreSQL advisory locks serialize concurrent throttle checks. Public demonstrations add a server-side read-only guard and a dedicated viewer account; replaying an admin request cannot bypass that guard.

## Failure case: payment retries

A simulated payment can succeed even when the response is lost. An identical retry carries the same organization-scoped idempotency key; a database uniqueness constraint prevents double recording. The transaction and audit event commit atomically. Reusing a key for a different subscription returns a conflict. The form starts a fresh key when the selected operation changes and preserves it for identical retries.

This interaction updates collected revenue without changing MRR. No payment processor or real card data is involved.

## Evidence

Financial tests cover annual normalization, boundary dates, churn cohorts, zero denominators, price changes, and tenant exclusion. PostgreSQL tests cover concurrent throttles and payment retries. Component tests exercise validation, loading/error recovery, URL filters, workspace selection, and export failures. Playwright covers business workflows, viewer restrictions, keyboard behavior, themes, and automated accessibility across routes.

Portfolio media has a separate database and read-only process. It starts from a fresh three-year seed, asserts complete comparison history and the absence of test-created records, then captures eight views and a one-minute video. Business workflow tests never write portfolio images.

| Verification               | Result                                               |
| -------------------------- | ---------------------------------------------------- |
| PostgreSQL backend suite   | 53 tests; 89.62% combined statement/branch coverage  |
| Frontend suite             | 35 tests; 85.43% line coverage                       |
| Browser business workflows | 12 passing Chromium workflows                        |
| Portfolio media            | Eight clean screenshots; 62-second WebM tour         |
| Static checks              | Strict TypeScript, mypy, ESLint, Ruff and formatting |

Reports and hosted results are available in [GitHub Actions](https://github.com/TheKirito7/MetricsFlow/actions).

## Tradeoffs

Reporting uses a fixed number of scoped queries and buckets historical records in memory. That keeps the definitions readable at this dataset size; database aggregates should follow measured growth. CSV exports are bounded to 50,000 records and explain how to narrow filters. Immediate cancellation provides a clear, tested effective boundary.

Password recovery, invitations, scheduled billing, real processor events, and cohort retention are future work. Deployment uses same-origin nginx routing, a private API network, managed PostgreSQL, and explicit trusted proxy peers. Monitoring and backup restoration require verification on the selected host.
