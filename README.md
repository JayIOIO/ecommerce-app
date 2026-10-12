# EcomApp — Feature-Stage Team Starter

This is the team's e-commerce application for the System Architecture final project. It contains the buyer/seller storefront, authentication, catalog, order services, MySQL schema, and a Docker Compose deployment with an NGINX reverse proxy. Jenkins and the CI/CD pipeline are outside this repository's current infrastructure scope.

The modules are separate source folders and share a MySQL database. For local feature work, the frontend calls the APIs through the Vite development proxy; for a containerized run, NGINX routes browser traffic to the frontend and APIs over a private Compose network.

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
- MySQL Workbench is optional; it can be used to create the schema from `db/init.sql` for local development.

Docker Desktop with Linux containers (or Docker Engine with Compose v2) is required only for the containerized run below. Jenkins is not part of the application Compose stack.

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

## Run with Docker Compose

On a fresh checkout, create the local environment file without overwriting an existing one:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Set `COMPOSE_DB_USER`, `COMPOSE_DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and `JWT_SECRET` to private, non-empty values before starting. If you already had a `.env` before these settings were added, add them from `.env.example`. Compose uses the `COMPOSE_DB_*` credentials; `DB_USER` and `DB_PASSWORD` remain dedicated to the local `npm run dev` setup. The Docker schema currently uses the fixed database name `ecommerce_db`.

Build each image individually to catch service-specific packaging errors, then start the stack:

```powershell
docker compose build db
docker compose build auth-service
docker compose build catalog-service
docker compose build order-service
docker compose build frontend
docker compose build proxy
docker compose config --quiet
docker compose up -d
docker compose ps
```

Only the proxy is published on the host. Open the app at `http://localhost:8080` (or the port set by `PROXY_PORT`) and test the catalog at `/api/products`. The database, APIs, frontend, and proxy use the `app-network` Compose network and resolve one another by service name. The named `db_data` volume preserves the database across container recreation and normal `docker compose down` / `docker compose up -d` restarts. Do not use `docker compose down -v` unless you explicitly intend to delete the database.

The MySQL health check waits for the initialized `users` table before starting the APIs; the frontend and proxy wait for the relevant service health checks. `db/init.sql` runs automatically only when MySQL initializes an empty data directory, so it does not reset or migrate an existing `db_data` volume.

See [docs/architecture.md](./docs/architecture.md) for the before/after deployment diagrams and infrastructure boundaries.

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

These checks validate backend JavaScript syntax and frontend lint/build. They are not a substitute for the integration tests the team should add in the later testing/automation phase.

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

The feature folders are already present in this starter, so do not claim that existing features were newly written during collaboration. Teammates can make genuine assigned improvements, tests, and documentation changes to those modules. Remaining team work is outside this infrastructure change:

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
4. **Containerization:** verify Dockerfiles, Compose, proxy routes, named database volume, environment configuration, and health checks from a fresh checkout.
5. **CI/CD:** add Jenkins separately, connect it to the Git repository, run tests before image build/deploy, configure automatic triggering, then prove the failure gate and rollback.
6. **Submission and demo:** finish the README/technical document/slides and rehearse only claims supported by actual evidence.

Keep `.env` private. Keep `db/init.sql` and `.env.example` in Git; never commit actual credentials.
