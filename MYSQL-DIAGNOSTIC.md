# Protected MySQL connectivity diagnostic

The deployed application's WhatsApp employee lookup is still backed by Google
Sheets. The diagnostic below is separate: it checks only whether the configured
MySQL service can authenticate and execute `SELECT 1`. It does not inspect the
employee view or any HR tables.

## Render configuration

Configure these values in the Render service environment, never in Git:

- `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`
- `DB_CA_PATH` pointing to the mounted, provider-trusted CA certificate
- `MYSQL_DIAGNOSTIC_TOKEN` as a long, randomly generated secret

TLS certificate-chain and hostname validation are enabled. The connection
targets `DB_HOST` but validates the certificate for
`srv1311180.hstgr.cloud`. The endpoint will fail closed if required connection
settings or the CA certificate are missing.

## Run the check

After deploying the diagnostic code, send an authenticated `POST` request to
`/internal/mysql-diagnostic` with:

```text
Authorization: Bearer <MYSQL_DIAGNOSTIC_TOKEN>
```

An unauthenticated request receives `404`. A successful database query returns
only `status: connected` and a correlation ID. A connection/query failure
returns HTTP 503 with `status: unavailable` and a correlation ID. Use that ID to
find the safe server-side diagnostic log; database errors and credentials are
not included in the HTTP response.

The endpoint performs no writes. A successful `SELECT 1` proves basic
authenticated MySQL connectivity only; it does not verify `staff_limited`
columns, employee lookup, HR tables, or write permissions.
