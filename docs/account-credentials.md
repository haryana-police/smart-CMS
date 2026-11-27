# Account credentials and the user store

## Source of truth

- **Postgres `User` table** owns identity and credentials: `pno`, `fullName`, `rank`, `role`,
  `status`, `mobileNumber`, `email`, `unitId` and `passwordHash`.
- **`PoliceUnit`** owns the posting referenced by `User.unitId`. A missing unit is created
  automatically when an account is added through the admin screen.
- **`ImportedJsonDocument` (`accounts-master-store.json`)** holds *non-secret* master profile
  extensions only: designation, rank display, authorized districts/stations, zone, special
  allocations, jurisdiction type, and similar UI fields.
- No plaintext PIN is stored anywhere. A credential is always a scrypt hash in the format
  `salt:hex-hash`, verified with a constant-time comparison in `src/lib/serverSession.ts`.
- The legacy plaintext sample property has been removed from the type, the account service,
  the runtime stores and the login fallback. Do not reintroduce it in any form.

## Login and session flow

1. `validLogin()` looks up `User` by `pno` first and verifies `passwordHash` with scrypt.
2. `baseSessionUser()` and `viewableOfficer()` also resolve from `User` first; the seeded JSON
   profile store is only a fallback for a principal that is not in the table. The hardcoded
   demo personas have been removed from the codebase entirely.
3. `accountMasterService` merges the JSON profile onto the `User` row for admin screens and
   the officer switcher. Every create, update, status change, password reset and delete writes
   to the `User` table as well as the profile store.
4. Audit snapshots strip credential fields before they are written.

Local zero-click admin login (`CMS_LOCAL_AUTO_ADMIN=true`) is gated by
`NODE_ENV !== 'production'`, demo mode and same-origin checks. It must stay unset in
operational deployments.

## Reproducible deploy seed

Export a private seed from a known-good database. It contains user profiles, usable
password hashes, postings, and imported station rosters. Keep it outside git.

```powershell
# 1. Generate the Prisma client for the target (Postgres) schema.
npm run prisma:generate

# 2. Export from the database that already has the correct accounts.
npm run accounts:seed:export
# Default output: prisma/accounts-seed.json
# Custom path:   $env:CMS_ACCOUNTS_SEED_FILE = 'C:\secure\accounts-seed.json'

# 3. For a non-Docker deployment, after migrations:
npm run prisma:generate
npm run accounts:seed -- --bootstrap
```

For Docker Compose, provision the seed as `accounts-seed.json` in a private
directory on the deployment host. Set `CMS_PRIVATE_SEED_DIR` to that directory
in the Compose environment. Startup runs migrations and imports the mounted
seed into an empty database. Later starts skip the bootstrap, preserving
account edits and credential resets. An existing populated database requires
a deliberate decision about how to merge account changes.

For an existing database, take a PostgreSQL backup and review the UPC list
before running the merge. With the private seed already mounted:

```sh
sudo docker compose run --rm --no-deps -T -e CMS_ACCOUNTS_SEED_FILE=/run/cms-bootstrap/accounts-seed.json cms node scripts/seed-accounts.mjs --merge-missing
```

The merge adds missing UPCs and fills in missing station roster documents.
It preserves existing users, PIN hashes, postings, and roster documents.

`POSTGRES_DATABASE_URL` is required. The importer rejects plaintext credentials
and permits missing mobile numbers. Older accounts without a usable hash are
seeded with a random, undisclosed credential. An administrator must reset that
credential before those officers can use PIN login.

The seed is ignored by git via `*accounts-seed*.json`. If you place it elsewhere, add that exact
path to your own ignore rules or store it in a secret manager.

## Guards

- `npm run test:credentials` scans tracked source and JSON for plaintext credential fields.
- `.githooks/pre-commit` runs equivalent checks on staged content and blocks staging runtime
  stores or account seed exports.
- Run the guard test in CI alongside `npx tsc --noEmit` before build/deploy.

If a deployed database has users but no matching JSON profiles, the service derives a minimal
profile from the `User`/`PoliceUnit` rows; the app still authenticates and displays the officer.
