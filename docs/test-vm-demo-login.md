# Test VM demo login

Demo login is **on by default** so a freshly deployed test VM opens without any runtime configuration. Pull `main`, install dependencies with `npm ci`, run `npm run build`, then restart the app using its existing process manager.

The hardcoded demo persona accounts (SP/ASP/DSP/SHO/MHC sample users) have been removed from
the codebase. The login page now shows only the **Officer Login by District** roster, which
lists the seeded officer accounts from the PostgreSQL `User` table (or the mounted account
profile store fallback). The demo PIN `123456` no longer signs anyone in manually; officers
still open their IDs with one click while demo mode is enabled.

Optional runtime settings (not committed secrets files):

```dotenv
CMS_ALLOWED_ORIGINS=http://112.196.123.220:18091
CMS_SESSION_SECRET=<random secret of at least 32 characters>
CMS_DEVELOPER_ADMIN_PASSWORD=<unique developer administrator password>
```

- `CMS_ALLOWED_ORIGINS` is only needed when a reverse proxy rewrites `Host`.
- `CMS_SESSION_SECRET` keeps signed sessions valid across restarts; without it a random per-process secret is used.
- `CMS_DEVELOPER_ADMIN_PASSWORD` is required for manual `DEV-ADMIN` sign-in in every mode.

The login page reads picker availability from `/api/auth/session` (`officerPickerEnabled`). Officer cards sign in with one click; they do not depend on seeded database passwords. The Developer Admin button is also one-click: it opens the developer roster through the quick-login path. The personnel directory (`/users`) lets that administrator open any officer ID as a read-only preview: the developer stays signed in as Developer Admin, no officer account is signed in, and the session ends only on an explicit sign out. Persona switching (`switchTo`) is rejected by the session API.

Check the session endpoint response: an unauthenticated response is HTTP 401 and includes `officerPickerEnabled: true`. After clicking an officer account, POST and subsequent GET of `/api/auth/session` should succeed. Manual `DEV-ADMIN` sign-in requires `CMS_DEVELOPER_ADMIN_PASSWORD`; the demo PIN is never accepted.

## Disabling demo mode

Set `DISABLE_DEMO_LOGIN=true` in the process environment and restart. The officer roster, the one-click officer cards and the one-click developer admin are then disabled; only database credentials or `DEV-ADMIN` with `CMS_DEVELOPER_ADMIN_PASSWORD` are accepted.

`ENABLE_DEMO_LOGIN` and `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` are still accepted for compatibility with older environments but are no longer required.

## Troubleshooting

- **The login page still shows "Demo Personas by District"**: the VM is still serving an older build. Pull `main`, run `npm run build`, then restart the process. Confirm the new build by calling `GET /api/auth/session`: an unauthenticated body must include `officerPickerEnabled`.
- **Officer cards visible but one-click login fails**: the VM database has no seeded accounts and no mounted account profile store. Run the account seed (`scripts/seed-accounts.mjs` with `POSTGRES_DATABASE_URL`) or provision the private bootstrap seed.
- **HTTP 403 "Invalid request origin"**: the browser Origin (for example `http://112.196.123.220:18091`) is not recognised because a reverse proxy rewrites `Host`. Add the exact browser origin to `CMS_ALLOWED_ORIGINS` and restart. Comma-separated `X-Forwarded-Host` values are compared individually.
- **DEV-ADMIN returns 401**: manual `DEV-ADMIN` sign-in always requires `CMS_DEVELOPER_ADMIN_PASSWORD` in the process environment. Set it and restart; the one-click Developer Admin button remains available while demo mode is enabled.

## Security warning

With demo mode on, anyone who can reach the login page can one-click into Developer Admin, a global `SUPER_ADMIN`, and open any officer account. Keep demo mode for the isolated test VM with fake data. Set `DISABLE_DEMO_LOGIN=true` on the operational deployment containing real case records so passwords and database credentials are required.

Keep credentials out of Git.
