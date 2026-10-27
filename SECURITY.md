# Security policy

Security fixes target the latest version on `main`. This portfolio application uses fictional billing data; do not submit real payment details or personal customer data to a public demo.

Report vulnerabilities privately through [GitHub's security advisory form](https://github.com/TheKirito7/MetricsFlow/security/advisories/new). Include affected revision, reproduction steps, impact, and a minimal proof of concept with fictional records. Do not publish session cookies, passwords, database URLs, or another tenant's data in issues.

The application enforces verified organization membership, admin/viewer permissions, Argon2id passwords, revocable cookie sessions, CSRF checks, and bounded exports. A public demo must use a dedicated database, a viewer-only account, `READ_ONLY_DEMO=true`, and HTTPS. Development credentials and test clocks must never be used for a private production workspace.

See [deployment guidance](docs/DEPLOYMENT.md) for proxy trust, secure cookies, database TLS, migrations, and backups. Automated security analysis complements review; it does not establish that a deployment is vulnerability-free.
