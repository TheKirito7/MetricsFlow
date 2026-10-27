# Production deployment

The production stack runs nginx and a runtime-only FastAPI image on a Docker host. Managed PostgreSQL is supplied by `DATABASE_URL`; its TLS and backup settings belong to the database provider. Only nginx is published on host loopback `127.0.0.1:8080`, behind a host HTTPS terminator. The API has no public port.

## Host and configuration

Use a Linux Docker host with a domain pointing to it, a trusted SSH account, and a managed PostgreSQL database in the same region. Configure a firewall to expose HTTPS and restricted SSH. A small VM is sufficient for this portfolio dataset. No hosting account or paid resource is created by local setup.

Clone `https://github.com/TheKirito7/MetricsFlow.git` on the host. Copy `.env.production.example` to `.env.production` and keep it untracked with permissions `chmod 600 .env.production`.

- Set `DATABASE_URL` to the provider's SQLAlchemy DSN (`postgresql+psycopg://...?...sslmode=verify-full`, or the provider's documented TLS settings). URL-encode reserved characters in credentials. Set the provider CA path when required.
- Set `ALLOWED_ORIGINS` and `PUBLIC_SITE_URL` to the exact public HTTPS origin. The latter becomes `VITE_PUBLIC_SITE_URL` in the frontend build, generating absolute `og:image`, `og:url`, and Twitter card URLs.
- Production Compose forces `APP_ENV=production`, secure cookies and explicit proxy trust. `SESSION_HOURS` remains configurable.
- The optional PostgreSQL service uses the `local-database` profile and the `POSTGRES_*` variables. Leave this profile disabled when using managed PostgreSQL. Compose still interpolates those variables; the example includes them for configuration validation.

## Private workspace or public demonstration

For a private production workspace, keep `READ_ONLY_DEMO=false` and all `PUBLIC_DEMO_*` values empty. Provision the administrator interactively after migrations:

```sh
docker compose --env-file .env.production -p metricsflow-prod -f docker-compose.production.yml run --rm backend python -m app.bootstrap --email owner@company.com --name "Workspace Owner" --organization "Company"
```

For a public portfolio demo, use a **dedicated database** and:

```dotenv
READ_ONLY_DEMO=true
DEMO_VIEWER_EMAIL=demo@example.com
DEMO_PASSWORD=choose-a-public-viewer-password
PUBLIC_DEMO_EMAIL=demo@example.com
PUBLIC_DEMO_PASSWORD=choose-a-public-viewer-password
```

Use a normal email domain for production validation; `.test` accounts are development-only. The viewer email/password are intentionally public. They must not grant access to private data. `PUBLIC_DEMO_*` values are frontend build arguments and display an "Enter demo workspace" action on the login page. Never put administrator credentials, provider keys, or database secrets in these values.

The server guard rejects every business mutation, including admin requests. Login/logout and reads remain available. Demo provisioning requires production read-only mode, refuses a database containing other organizations, creates only a viewer, and preserves an existing seed. It defaults to today's three-year history; the test clock is refused in production. Do not run the development seed by temporarily changing a deployed API to development mode.

## Release

Run from the repository on the Docker host:

```sh
docker compose --env-file .env.production -p metricsflow-prod -f docker-compose.production.yml build
# Managed PostgreSQL must be reachable before the release migration.
docker compose --env-file .env.production -p metricsflow-prod -f docker-compose.production.yml run --rm backend alembic upgrade head
# Public demo only; use the private bootstrap above for a real workspace.
docker compose --env-file .env.production -p metricsflow-prod -f docker-compose.production.yml run --rm backend python -m app.provision_demo --confirm-public-demo
docker compose --env-file .env.production -p metricsflow-prod -f docker-compose.production.yml up -d frontend backend
```

For self-hosted PostgreSQL instead, start `--profile local-database up -d db` before the migration, and configure the DSN with hostname `db`. Keep production and development Compose project names and volumes separate. Run migrations once per release before scaling API workers.

## HTTPS and proxy trust

The chain is **browser -> host HTTPS terminator -> container nginx -> Uvicorn**.

Configure the host's TLS nginx virtual host to proxy to `http://127.0.0.1:8080`, with:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

The terminator must replace incoming forwarding headers. Use a maintained certificate automation tool and verify renewal. Container nginx trusts only gateway `172.30.0.1`, fixed by the production subnet. It replaces forwarding headers before sending to the API from `172.30.0.10`. Uvicorn trusts only that exact peer. This preserves real client IPs for authentication throttling without trusting browser-supplied headers.

A different load balancer/subnet requires corresponding trusted-peer configuration. Do not expose the API directly, use wildcard forwarding trust, or publish the host-gateway nginx configuration as a public edge. The default image trusts no incoming forwarding chain; the production Compose mount adds the documented host-TLS contract.

## Verification and operations

```sh
python scripts/verify-production.py https://your-public-domain
```

Verify a viewer can sign in over HTTPS, the cookie is Secure/HttpOnly/SameSite, charts and filters load, a CSV downloads, and business writes return 403 in public demo mode. Confirm social metadata contains the actual deployed origin. Add the verified demo URL above the README fold and to the GitHub repository homepage.

nginx enables gzip, caches hashed assets immutably and returns 404 for unknown assets. SPA HTML is not immutable. Inter is bundled locally. Rebuild the social image with `node scripts/generate-og.mjs` after editing its source SVG.

The backend installs only `requirements.lock`; development and CI use `requirements-dev.lock`. Its Docker context excludes tests, caches, credentials and package metadata. Database backups, tested restores, log retention, TLS renewal, error monitoring, host patching and an edge rate limit must be configured for the actual environment. A public viewer account does not replace infrastructure protection.
