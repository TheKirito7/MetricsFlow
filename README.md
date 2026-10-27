# MetricsFlow

[![CI](https://github.com/TheKirito7/MetricsFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/TheKirito7/MetricsFlow/actions/workflows/ci.yml)
[![CodeQL](https://github.com/TheKirito7/MetricsFlow/actions/workflows/codeql.yml/badge.svg)](https://github.com/TheKirito7/MetricsFlow/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A subscription analytics SaaS with traceable revenue metrics, customer management, subscriptions, and a simulated payment ledger. Built with React, strict TypeScript, FastAPI, and PostgreSQL.

**[Watch the one-minute tour](docs/demo/metricsflow-tour.webm)** | **[Engineering case study](docs/CASE_STUDY.md)** | **[API reference](docs/API.md)**

![MetricsFlow overview](docs/screenshots/overview.png)

## Features

- Database-backed MRR, ARR, ARPU, paying customers, churn, collected revenue, and historical comparisons.
- Customer search, create, edit, archive, profiles, subscription history and transaction history.
- Editable plans and subscriptions with immutable price snapshots and explicit cancellation dates.
- Transaction filters, summaries, details, CSV export recovery and replay-safe simulated payments.
- Cookie authentication, verified workspace selection, admin/viewer permissions and tenant isolation.
- Responsive navigation, mobile transaction cards, themes, accessible forms and shareable URL filters.

Charts use persisted records. Fictional seed data spans three years and includes customers with multiple subscriptions. Payments are simulated; no Stripe account is required.

## Run locally

Requirements: Docker Compose, or Node 24 and Python 3.14 with PostgreSQL 17. Version files and dependency locks are included.

```sh
cp .env.example .env
# Set DEMO_PASSWORD in .env to a local-only password of at least 12 characters.
docker compose up --build -d
docker compose exec backend python -m app.seed
```

Open **http://localhost:5173**. Sign in with `DEMO_VIEWER_EMAIL` or `DEMO_ADMIN_EMAIL` and your configured `.env` password. These are local accounts, not public production credentials. OpenAPI is at **http://localhost:8000/docs**.

PowerShell: use `Copy-Item .env.example .env`. `docker compose down` retains data. Seeding preserves existing records and does not rewrite their dates. To generate fresh history, use a new dedicated database, run migrations, and seed it. Retain databases containing work you want to keep.

For native development, start PostgreSQL with `docker compose up -d db`, then:

```sh
python -m venv .venv
# Windows: .venv/Scripts/activate; macOS/Linux: source .venv/bin/activate
python -m pip install -r backend/requirements-dev.lock
python -m pip install --no-deps -e backend
npm ci
alembic -c backend/alembic.ini upgrade head
python -m app.seed
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Run `npm run dev` in another terminal. Vite proxies `/api` on the same browser origin. If PowerShell blocks activation, invoke executables under `.venv/Scripts/` directly.

## Configuration

Keep `.env` and `.env.production` untracked. See [.env.example](.env.example) and [.env.production.example](.env.production.example).

| Variable                                                 | Purpose                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`                                           | SQLAlchemy PostgreSQL DSN; use TLS for managed databases       |
| `APP_ENV`, `COOKIE_SECURE`                               | Production requires secure cookies and HTTPS                   |
| `ALLOWED_ORIGINS`                                        | Exact trusted origins for state-changing requests              |
| `SESSION_HOURS`                                          | Session lifetime; `/me` returns the actual expiry              |
| `FORWARDED_ALLOW_IPS`                                    | Explicit proxy peers; wildcard trust is refused in production  |
| `DEMO_ADMIN_EMAIL`, `DEMO_VIEWER_EMAIL`, `DEMO_PASSWORD` | Local seed accounts; password is required                      |
| `SEED_TODAY`                                             | Optional fixed reference date; normal seeds default to today   |
| `READ_ONLY_DEMO`                                         | Reject all business mutations, including admin requests        |
| `PUBLIC_SITE_URL`                                        | Production origin for absolute Open Graph and Twitter metadata |

Public demo provisioning creates only a viewer, requires a dedicated database, and refuses to run unless production read-only mode is enabled. Private production workspaces use an interactive administrator bootstrap. See [deployment instructions](docs/DEPLOYMENT.md).

## Architecture and stack

```text
frontend/src/     app, shared UI/layout/charts, domain features, hooks, typed client
backend/app/      versioned routes, schemas, services, repositories, models, security
backend/alembic/  schema migrations
backend/tests/    calculation, security, API and PostgreSQL concurrency tests
e2e/              business workflows and accessibility checks
portfolio/        isolated read-only screenshots and product tour
docs/             architecture, metrics, deployment and case study
```

The modular monolith uses one transaction per request. Membership establishes organization scope; admin dependencies protect writes. React Router lazy-loads features. TanStack Query owns server state; TanStack Table renders paginated records. Recharts displays calculated data. React Hook Form and Zod validate forms, with Pydantic on the server. Tailwind tokens and shared shadcn-style/Radix controls coexist with domain CSS. Inter is bundled locally.

See [architecture](docs/ARCHITECTURE.md), [financial definitions](docs/METRICS.md), and the [development checklist](docs/ROADMAP.md).

## Tests and quality gates

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage
npm run build
ruff check backend
ruff format --check backend
mypy --config-file backend/pyproject.toml
pytest backend/tests -q --cov=app --cov-config=backend/pyproject.toml --cov-report=term
```

The fast backend run uses isolated SQLite. To include PostgreSQL concurrency checks, create `metricsflow_test` using `docker compose exec -T db createdb -U metricsflow metricsflow_test`, then set `TEST_DATABASE_URL` before pytest. Database names must end in `_test`; tables are removed after each test. Never use the demo database for tests.

Playwright starts separate services on ports 5174/8001 with an isolated `_e2e` database:

```sh
docker compose exec -T db createdb -U metricsflow metricsflow_e2e
export E2E_DATABASE_URL="postgresql+psycopg://metricsflow:local-development-only@127.0.0.1:5432/metricsflow_e2e"
export DEMO_PASSWORD="a-local-test-password"
npx playwright install chromium
npm run e2e
```

PowerShell uses `$env:NAME="value"` instead of `export`. Skip `createdb` if the database exists. Set `E2E_PYTHON` when using another Python executable. CI runs frontend checks, PostgreSQL tests, builds and browser workflows, retaining coverage reports. CodeQL analyzes Python and TypeScript; Dependabot proposes dependency updates.

Coverage floors: backend 80% including branches; frontend 80% lines, 75% statements, 70% functions, 65% branches. Automated accessibility checks complement manual review.

## Screenshots

| Customers                                          | Subscriptions                                        |
| -------------------------------------------------- | ---------------------------------------------------- |
| ![Customers](docs/screenshots/customers.png)       | ![Subscriptions](docs/screenshots/subscriptions.png) |
| Transactions                                       | Analytics                                            |
| ![Transactions](docs/screenshots/transactions.png) | ![Analytics](docs/screenshots/analytics.png)         |
| Settings                                           | Dark theme                                           |
| ![Settings](docs/screenshots/settings.png)         | ![Dark overview](docs/screenshots/overview-dark.png) |

[Mobile overview](docs/screenshots/mobile.png) | [One-minute WebM tour](docs/demo/metricsflow-tour.webm)

Media is generated separately from business tests. Create `metricsflow_portfolio`, set `PORTFOLIO_DATABASE_URL` and `DEMO_PASSWORD`, then run `npm run portfolio`. This resets only the `_portfolio` database, seeds three years of deterministic records, verifies cleanliness and comparison baselines, and captures eight views and video. No business mutations precede capture.

## Migrations and deployment

```sh
alembic -c backend/alembic.ini upgrade head
alembic -c backend/alembic.ini check
```

Review generated migrations before release. Production uses runtime-only FastAPI, nginx, a Docker host with HTTPS and managed PostgreSQL. [DEPLOYMENT.md](docs/DEPLOYMENT.md) provides release commands, the public demo provisioning path, social metadata settings and proxy trust contract. An optional `local-database` Compose profile supports self-hosted PostgreSQL.

## Known limitations

- A public demo URL is pending host and managed database provisioning; the tour and local setup are available above.
- Payments are simulated. Scheduled billing, processor webhooks, invitations and password recovery are outside the MVP.
- Reporting buckets scoped records in memory. Larger datasets need measured database aggregation and background exports.
- A session selects one workspace; sign out and sign in to choose another. Member administration is not included.
- Additional browser engines, assistive-technology review, deployed monitoring and backup restore checks remain follow-up work.

## License and security

[MIT](LICENSE). Report vulnerabilities privately through [SECURITY.md](SECURITY.md).
