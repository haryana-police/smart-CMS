# Final report persistence deployment

The application requires three new tables: `FirFinalReport`, `FirFinalReportAccused`, and `FirFinalReportEvent`. Deploy the database change before starting the updated application. This change has not been applied to the separate hosted server.

1. Back up the server database and retain its currently deployed Prisma schema as `previous.prisma`.
2. Use the full PostgreSQL schema at `prisma/postgresql/full/schema.prisma`.
3. Generate an additive migration using the installed Prisma CLI:
   `npx prisma migrate diff --from-schema-datamodel previous.prisma --to-schema-datamodel prisma/postgresql/full/schema.prisma --script --output final-report-upgrade.sql`
   Inspect the SQL: this feature needs only the three new tables, their indexes, and relations. Do not apply unrelated destructive statements or reset the database.
4. Apply the reviewed SQL through the server's normal migration process. Regenerate Prisma Client with `npx prisma generate --schema <selected-schema>` and rebuild/restart the application with its existing database configuration.
5. Verify saving a test report, reloading it, and opening Edit in a non-production environment. Use explicit authorization before forwarding an actual report to SHO.

Challan classification accepts only `Complete` and `Partial`. Final-report reason and investigation status are separate fields. Final Submit saves the report and its accused rows atomically; updates retain earlier event snapshots. Forwarding notifies the station SHO and waits for review. The SHO must view the saved revision before Approve or Reject is enabled. Approval places the report Under Checking; rejection requires a reason and returns it to the assigned IO with a backend notification. An edited revision requires fresh forwarding and review. Submitting CHI in Part B moves completed investigations to Completed Cases and continued investigations to Partial. CO clearance is not the transition trigger.

Existing legacy reports are not automatically backfilled. New structured reports use the backend workflow board in Part B. The hardcoded demo personas were later removed from the codebase; authentication resolves seeded database accounts and the configured developer administrator.

Validation: `node --test tests/final-report.test.cjs tests/final-report-db.test.cjs` uses an isolated PostgreSQL schema. `tests/fixtures/final-report-qa-schema.sql` is the PostgreSQL test fixture, not a migration for arbitrary deployed schemas.
