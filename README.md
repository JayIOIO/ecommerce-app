# EcomApp — Feature-Stage Team Starter

This is the team's application-feature baseline for the System Architecture final project. It contains the buyer/seller storefront, authentication, catalog, order services, and MySQL schema. It is deliberately prepared **before the infrastructure/automation phase**: there is no Docker/Compose setup, NGINX deployment proxy, Jenkins configuration, or CI-integrated smoke-test stage in this checkout. A local disposable-data integration smoke test is available as `npm run test:smoke`.

The modules are separate source folders, but they share the local MySQL database and the frontend calls their APIs through the Vite development proxy. This lets teammates work on module changes against a runnable baseline. Add and review the missing infrastructure, integration tests, and automation as subsequent team contributions.

## Application features in this baseline

| Module | Source | Responsibilities |
|---|---|---|
| Frontend | `frontend/` | React buyer/seller experience, product search, listings, checkout, and order views. |
| Authentication | `services/auth-service/` | Buyer/seller signup, login, JWT issuance, and profile update. |
| Catalog | `services/catalog-service/` | Public product search; seller-owned listing management. |
| Orders | `services/order-service/` | Buyer checkout/history; seller order views and fulfillment updates. |
| Database schema | `db/init.sql` | MySQL tables, relationships, indexes, and initial sample products. |

## Prerequisites

- Git.
- Node.js 22 LTS (or a compatible current Node release) and npm.
- MySQL Server 8 or a compatible MySQL installation running locally.
- MySQL Workbench is optional; it can be used to create the schema from `db/init.sql`.

This feature-stage starter does not require Docker or Jenkins to run locally. Those are intended team additions in a later project phase.

## Run locally on Windows

### 1. Configure the database

Make sure the local MySQL Server is running. In PowerShell, copy the environment template and edit the local database credentials and JWT secret:

```powershell
Copy-Item .env.example .env
notepad .env
```

The example uses the local `root` MySQL account. Set `DB_PASSWORD` to the password configured on your local MySQL server. If your local MySQL account has no password, leave it empty (`DB_PASSWORD=`). These settings are for local development only; do not commit `.env` or use a root account for a public deployment.

Create the schema and demo data once. One option is to open `db/init.sql` in MySQL Workbench and execute it against your local MySQL server. If the MySQL command-line client is installed, run this from PowerShell:

```powershell
cmd /c "mysql -u root -p < db\init.sql"
```

Enter your local MySQL root password when prompted, or press Enter if it has no password. The script creates the `ecommerce_db` database, tables, and initial products.

### 2. Install Node dependencies

From the repository root:

```powershell
npm run setup
```

This installs dependencies for the local process runner, each backend service, and the frontend.

### 3. Start all application modules

```powershell
npm run dev
```

The command starts four development processes. Keep this terminal open while using the app. Open:

- Frontend: <http://localhost:5173>
- Authentication health: <http://localhost:4001/health>
- Catalog health: <http://localhost:4002/health>
- Order health: <http://localhost:4003/health>

The Vite development server forwards `/api/auth`, `/api/products`, and `/api/orders` to their respective local backend services. Register as a buyer or seller in the UI to try the feature flows.

Press **Ctrl+C** in the terminal to stop all four processes.

### Troubleshooting

- **Database connection error:** verify MySQL is running and `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD` in `.env` match your local installation.
- **Unknown database/table:** run `db/init.sql` against the configured database.
- **Port already in use:** close the other process using port `5173`, `4001`, `4002`, or `4003`, then try again.
- **API calls fail in the browser:** confirm all three backend health URLs respond and restart `npm run dev`.
- **Node/Vite version error:** install a supported Node.js release and reopen PowerShell so it picks up the new PATH.

## Check the modules

From the project root:

```powershell
npm run check:services
npm run lint
npm run build:frontend
```

These checks validate backend JavaScript syntax and frontend lint/build. The separate local integration smoke test is documented below; none of these checks is currently wired into a CI pipeline in this checkout.

## Local integration smoke test

With the three APIs and the disposable MySQL database configured by `.env` already running, execute:

```powershell
npm run test:smoke
```

The test creates uniquely named buyer/seller accounts and one product, checks public search, buyer checkout, seller order visibility and fulfillment, and verifies the delivered buyer history. Every scenario prints a `PASS` line; any failed assertion or HTTP response fails the process with exit code 1. A database connection is verified before test data is created. In a `finally` cleanup transaction, it deletes only that run's buyer-owned orders, seller-owned product by its returned ID and unique name, and the user IDs returned by the two signups. Cleanup failures also fail the command.

**Run this only against a disposable local/test database that the configured database user can clean.** It directly removes its generated test rows as part of teardown and is not intended for production, shared, or instructor-demo data. Optional API URL overrides are `SMOKE_AUTH_URL`, `SMOKE_CATALOG_URL`, and `SMOKE_ORDERS_URL`; they must point at services using the same configured disposable MySQL database. `SMOKE_EMAIL_DOMAIN` can change the unique test-email domain if `example.test` is not accepted by a test deployment.

## Frontend build identifier

The login and signed-in headers display a build identifier supplied at Vite build time through `VITE_BUILD_ID`. If it is unset, the UI says `unlabeled build`; this avoids implying a release identity that the build did not receive. To label a build with the source revision that produced it, set the value from that revision before building:

```powershell
$env:VITE_BUILD_ID = (git rev-parse --short HEAD)
npm run build:frontend
```

The value is embedded in the frontend bundle; changing a runtime container environment variable after the bundle has been built does not change the displayed label. The deployment pipeline must supply the actual checked-out commit or release identifier as `VITE_BUILD_ID` when it builds the frontend image. Do not set a manually chosen build number that does not match the deployed image. Unset the PowerShell variable after the build with `Remove-Item Env:VITE_BUILD_ID`.

Only use `git rev-parse --short HEAD` as the label when the build is from a clean checkout of that commit. On a dirty worktree, `HEAD` does not identify uncommitted changes; CI should use the immutable revision checked out for that run.

## Frontend QA and submission-document drafts

The local UI run, outcomes, and remaining final-proxy validation are recorded in [the QA checklist](docs/qa-checklist.md) and its [dated execution log](docs/evidence/frontend-qa-run-2026-10-13.md). The [build-label screenshots](docs/evidence/) show a local QA identifier, not a deployed release. The technical report is [available as a 10-page PDF](docs/ecomapp-technical-report.pdf) with [HTML source](docs/technical-report.html); the 15-slide presentation is [available as an interactive HTML deck](docs/ash-project-deck.html) and [PDF](docs/ecomapp-presentation.pdf). The report/deck describe the verified feature-stage checkout and explicitly mark final deployment/pipeline/persistence/rollback evidence as outstanding.

## Team collaboration: use this as the shared GitHub base

The repository owner should create a new GitHub repository and push this starter as its initial baseline. Add collaborators, then have each teammate clone that same repository and branch from the shared default branch:

```powershell
git clone <NEW-GITHUB-REPOSITORY-URL>
Set-Location <REPOSITORY-FOLDER>
git switch main
git pull
git switch -c <role-or-task-branch>
```

For each real task:

1. Create a GitHub issue that names the owner, acceptance criteria, reviewer, and evidence expected.
2. Agree on shared contracts before parallel work: API paths and payloads, service ports, environment-variable names, database tables, and health-check behavior.
3. Work only on the issue branch; do not commit `.env`, `node_modules`, local database files, or generated build output.
4. Run the relevant check(s), then commit and push the branch.
5. Open a pull request to the default branch. Explain the change, how it was tested, and any follow-up needed.
6. Ask a teammate to review; fix comments and merge only after checks pass.
7. Update the issue and contribution log with the real commit/PR and evidence.

The feature folders are already present in this starter, so do not claim that existing features were newly written during collaboration. Teammates can make genuine assigned improvements, tests, and documentation changes to those modules. The infrastructure/automation work is intentionally still to be added:

- **Infrastructure:** add custom Dockerfiles, Docker Compose, the deployment proxy, health/dependency configuration, and persistent database volume.
- **DevOps / CI-CD:** add the separate Jenkins deployment, pipeline-as-code, credentials setup instructions, automatic Git trigger, image tags, quality gate, and deployment verification.
- **Backend / database:** review and extend module tests and schema as assigned; agree on changes with other service owners.
- **Frontend / QA / docs:** maintain the buyer/seller UI, manual QA, automated smoke/integration coverage, and project documentation.
- **Project lead:** coordinate the module contracts, issues, reviews, integration branch/release, contribution log, and final evidence.

The current assignment list provided to the team has Riboroso named for both DevOps / CI-CD and Backend & Database. If the course requires five distinct group members, confirm and add the fifth member before finalizing the roster.

## Planned next stages

Use separate, reviewed pull requests so the course work has a visible collaboration history:

1. **Feature baseline:** import this starter into the new GitHub repository and confirm each module runs locally.
2. **Module contributions:** make real feature/test improvements on role-owned branches; review and merge them.
3. **Integration testing:** agree test cases for signup/role access, product search/listings, checkout/history, and seller fulfillment; run them against the local services.
4. **Containerization:** add and verify Dockerfiles, Compose, proxy routes, named database volume, environment configuration, and health checks.
5. **CI/CD:** add Jenkins separately, connect it to the Git repository, run tests before image build/deploy, configure automatic triggering, then prove the failure gate and rollback.
6. **Submission and demo:** finish the README/technical document/slides and rehearse only claims supported by actual evidence.

Keep `.env` private. Keep `db/init.sql` and `.env.example` in Git; never commit actual credentials.
