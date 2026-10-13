# EcomApp — Feature-Stage Team Starter

This is the team's e-commerce application for the System Architecture final project. It contains the buyer/seller storefront, authentication, catalog, order services, MySQL schema, a Docker Compose deployment with an NGINX reverse proxy, and a separate Jenkins CI/CD stack.

Final project reference: <https://github.com/JayIOIO/FinalProject-CI-CD-Automation>.

The modules are separate source folders and share a MySQL database. For local feature work, the frontend calls the APIs through the Vite development proxy; for a containerized run, NGINX routes browser traffic to the frontend and APIs over a private Compose network.

For a detailed walkthrough of the architecture, application flows, database, deployment, and professor Q&A, see [docs/EcomApp-Project-Walkthrough.md](./docs/EcomApp-Project-Walkthrough.md).

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

Docker Desktop with Linux containers (or Docker Engine with Compose v2) is required for the containerized run and Jenkins pipeline below. Jenkins runs in a separate Compose project from the application.

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

The CI command used by Jenkins is:

```powershell
npm run test:ci
```

It validates backend JavaScript syntax and frontend lint/build. It is not a substitute for API assertion and end-to-end integration tests; those remain necessary before claiming core backend correctness.

## Jenkins CI/CD

Jenkins is an independent stack and shares the host's Linux Docker daemon with the application. Use Docker Desktop with Linux containers on Windows, or Docker Engine on Linux. The Jenkins container mounts `/var/run/docker.sock`; access to that socket grants control over the Docker host, so run this Jenkins instance only for trusted users and code. For smoke checks, Jenkins reaches the app's published proxy through `host.docker.internal`.

### Start Jenkins and complete first-time setup

The defaults require host TCP port `8081` for Jenkins and `50000` for inbound agents, if agents are used. The application proxy uses host port `8080` by default. Change `JENKINS_HTTP_PORT` or `JENKINS_AGENT_PORT` if either Jenkins port is occupied. If the application proxy port changes, update `PROXY_PORT` in the Jenkinsfile to the same host port.

From the repository root in PowerShell:

```powershell
docker compose -p ecomapp-jenkins -f infra\jenkins\docker-compose.yml up -d --build
docker compose -p ecomapp-jenkins -f infra\jenkins\docker-compose.yml exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Open <http://localhost:8081>, enter the one-time password printed by the second command, and finish the Jenkins setup wizard. The custom image preinstalls the **Pipeline**, **Pipeline Stage View**, **Git**, and **Credentials Binding** plugins. Create the first administrator using the wizard; do not put its password in this repository.

`/var/jenkins_home` is stored in the named `ecomapp-jenkins_jenkins_home` volume. Stop/start or remove/recreate the Jenkins container without `-v` to preserve Jenkins configuration and job history:

```powershell
docker compose -p ecomapp-jenkins -f infra\jenkins\docker-compose.yml stop
docker compose -p ecomapp-jenkins -f infra\jenkins\docker-compose.yml start
```

Do not use `docker compose down -v` unless deleting Jenkins history is intended.

### Configure the pipeline job and secrets

Create a **Pipeline** job, select **Pipeline script from SCM**, and enter:

| Setting | Value |
|---|---|
| SCM | Git |
| Repository URL | `https://github.com/JayIOIO/FinalProject-CI-CD-Automation.git` |
| Branch specifier | `*/main` (the reference repository's default branch) |
| Script path | `Jenkinsfile` |

The selected trigger is the Jenkinsfile's **Poll SCM**, schedule `H/5 * * * *` (Jenkins checks approximately every five minutes). Do not also enable a GitHub webhook unless the team deliberately changes the trigger and updates this documentation. Polling requires the Jenkins job to be configured from SCM and to have completed its initial setup/build.

Before a deployment build, add these **Secret text** credentials under **Manage Jenkins → Credentials → System → Global credentials**. Use the IDs exactly as listed; enter private values directly in Jenkins and never commit or print them:

| Credential ID | Purpose |
|---|---|
| `ecommerce-db-password` | Application MySQL user password (`COMPOSE_DB_PASSWORD`) |
| `ecommerce-mysql-root-password` | MySQL root password |
| `ecommerce-jwt-secret` | Application JWT signing secret |

The pipeline uses only these credential IDs. `COMPOSE_DB_USER` is a non-secret pipeline setting. On Linux hosts where the Docker socket group is not GID `0`, set `DOCKER_GID` to the socket's group ID when starting Jenkins; the Compose service adds that group to the Jenkins process.

### Builds, deployment gate, and rollback

The stages run in order: **Checkout → Test → Image Build → Deploy → Smoke / Verify**. `Test` runs the same `npm run test:ci` command documented above. Declarative pipeline failure handling stops later stages after a failed test. Image build tags all six app images with the Jenkins `BUILD_NUMBER`; the proxy's `GET /version` endpoint returns the deployed tag.

Leave the `ROLLBACK_BUILD` parameter empty for a normal build. To roll back, enter the number of an earlier successful build whose tagged images are still present on this same Docker daemon. The pipeline skips Image Build, verifies that all six tagged images exist, redeploys them, then checks both `/version` and `/api/products` through the proxy. Rollback restores application images only; it does not roll back database contents or schema.

The pipeline can deploy only from `main`; other branches still check out and run tests but do not deploy. To run the deliberate failing-test case on an approved test branch, use a separate Pipeline-from-SCM job for that branch or a multibranch job; do not change the production job's `main` deployment gate. The Jenkins job's initial setup build, automatic poll-triggered run after a reviewed change, failing-test demonstration, previous-version rollback, and teammate reviews must be completed and recorded by the team; they cannot be evidenced by the repository configuration alone.

## Team collaboration: use the shared GitHub repository

Use the [Final Project CI/CD Automation repository](https://github.com/JayIOIO/FinalProject-CI-CD-Automation) as the shared project repository. Add collaborators there, then have each teammate clone it and branch from its `main` default branch:

```powershell
git clone https://github.com/JayIOIO/FinalProject-CI-CD-Automation.git
Set-Location FinalProject-CI-CD-Automation
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
