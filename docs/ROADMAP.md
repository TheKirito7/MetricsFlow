# Development checklist

Checked items represent implemented behavior with automated or local runtime verification. External release milestones are tracked separately.

## Application

- [x] React/TypeScript foundation, FastAPI connectivity, PostgreSQL, dependency locks.
- [x] Responsive layout, navigation, light/dark themes, accessible forms.
- [x] Customer CRUD, archive, profile history and URL search/sort/status/page filters.
- [x] Plans, immutable subscription pricing, assignment, cancellation and history.
- [x] Transaction ledger, details, summaries, filtered CSV and export error recovery.
- [x] Idempotent simulated payments with atomic audit records and safe browser retries.
- [x] Historical MRR/ARR/ARPU, churn, customer growth and collected revenue comparisons.
- [x] Three-year seed with multiple-subscription customers and complete annual baselines.
- [x] Browser workspace selection after password verification.
- [x] Configurable sessions, cookies/CSRF, RBAC, tenant isolation and login throttling.
- [x] Read-only public demo guard and explicit viewer-only production provisioning.

## Engineering and presentation

- [x] Strict TypeScript, mypy, lint/format gates and coverage thresholds.
- [x] Financial, API, authorization, isolation and PostgreSQL concurrency tests.
- [x] Frontend forms, API integration, loading/error and pagination recovery tests.
- [x] Browser workflows, keyboard/focus behavior and automated accessibility across routes.
- [x] Production images, managed-database Compose topology and documented proxy trust.
- [x] Separate portfolio capture pipeline with a fresh, read-only database.
- [x] Verify regenerated screenshots and one-minute product tour.
- [x] Architecture/API/metric/deployment documentation and engineering case study.
- [x] MIT license, security policy, runtime versions, dependency and CodeQL workflows.
- [x] Publish logical commits to GitHub and verify [hosted CI](https://github.com/TheKirito7/MetricsFlow/actions/runs/40563875603) and [CodeQL](https://github.com/TheKirito7/MetricsFlow/actions/runs/40563875612).
- [ ] Deploy to a Docker host with managed PostgreSQL; verify HTTPS and viewer access.

## Next product work

- Invitations, membership administration and password recovery.
- Future-effective cancellation, scheduled billing and processor webhooks.
- Cohort retention, net revenue retention and MRR movement explanations.
- Profile query costs before introducing database aggregates or background exports.
- Additional browser engines, screen-reader review, deployed observability and restore exercises.

## Known limitations

Payments are simulated, without card processing or automatic billing. Each session selects one workspace. CSV exports are bounded to 50,000 matching records with a recoverable error. Reporting uses scoped in-memory bucketing appropriate to the demo dataset. Public hosting requires access to the chosen Docker host and managed PostgreSQL account.
