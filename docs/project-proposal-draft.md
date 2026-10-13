# Appendix A: Project Proposal Draft

This draft is based on the current repository and its Docker Compose/Jenkins
configuration. Replace the bracketed roster entries with the team's confirmed
names and review the planned work and test scope before submitting. This is a
draft, not evidence that the pipeline or deployment has been demonstrated.

## Project details

| Item | Details |
|---|---|
| Group name | [Enter official group name] |
| Project title | EcomApp: Containerized E-Commerce Application with Jenkins CI/CD |
| Short description (3 to 5 sentences) | EcomApp is a web-based marketplace where buyers can browse products, manage a cart, and place and view orders, while sellers can manage listings and fulfillment. The application uses a React frontend, Node.js/Express services for authentication, catalog, and orders, and a MySQL database. Docker Compose runs the application containers on a private network, persists database files in a named volume, and exposes the application through an NGINX reverse proxy. Jenkins is configured to check out the repository, run the CI test command, build tagged images, deploy from the main branch, and verify the deployed version and catalog route. |
| Repository URL | https://github.com/JayIOIO/ecommerce-app |
| Project Lead / Scrum Master | [Confirm team member] |
| DevOps / CI-CD Engineer | [Confirm team member] |
| Infrastructure Engineer | [Confirm team member] |
| Backend and Database Engineer | [Confirm team member] |
| Frontend, QA, and Documentation Lead | [Confirm team member] |

## Modules and containers

| Module / Container | Technology | Purpose | Justification |
|---|---|---|---|
| Frontend | React, Vite, NGINX, Docker | Provides the buyer and seller web interface and serves the production frontend assets. | React supports an interactive UI; the multi-stage Docker build produces static assets and serves them from a small NGINX runtime image. |
| Authentication service | Node.js, Express, MySQL, Docker | Handles signup, login, JWT issuance, and profile updates. | Separating authentication isolates its API responsibilities and allows it to be run and deployed with the other services. |
| Catalog service | Node.js, Express, MySQL, Docker | Provides product search and seller-owned listing operations. | A dedicated API keeps catalog and listing logic separate from authentication and order workflows. |
| Order service | Node.js, Express, MySQL, Docker | Supports checkout, buyer order history, seller order views, and fulfillment updates. | Separating order operations makes the service boundary and its database/API responsibilities clear. |
| Database | MySQL 8.4, Docker named volume | Stores application users, products, and order data. | MySQL provides relational storage; the `db_data` named volume keeps database files when the database container is recreated. |
| Public reverse proxy | NGINX, Docker | Publishes one application entry point and routes web/API requests to the appropriate container. | A single public port simplifies browser access and keeps the database and backend service ports private to the Compose network. |
| CI/CD server | Jenkins, Docker Compose, Docker CLI | Runs the configured pipeline to test, build tagged images, deploy, and smoke-check the application. | Jenkins automates repeatable delivery steps; its home directory is stored in a separate named volume. It uses the host Docker daemon through the configured Docker socket. |

## Pipeline plan

| Pipeline item | Details |
|---|---|
| Git hosting | GitHub: https://github.com/JayIOIO/ecommerce-app |
| Trigger (webhook / polling) | Polling is configured in `Jenkinsfile` with `H/5 * * * *` (approximately every five minutes). The Jenkins job must be configured to use the repository and the actual default branch, `main`. |
| Planned stages | Checkout → Test → Image Build → Deploy → Smoke / Verify. Deployment is gated to `main` and follows the Test stage. A non-empty `ROLLBACK_BUILD` skips image building and selects a prior numeric image tag for deployment. |
| Tests to be run | Jenkins runs `npm ci` for the root, three backend services, and frontend, then `npm run test:ci`. That command checks backend JavaScript syntax, runs frontend lint, and builds the frontend. It currently does not run assertion-based API integration tests or browser end-to-end tests; those should be added before claiming those test types are covered. |
| Planned bonus features (optional) | Version-tagged Docker images and a `ROLLBACK_BUILD` pipeline parameter for selecting an earlier image tag; `/version` endpoint for deployment verification; dark theme and show/hide password controls in the frontend. Confirm which optional features the team wants to present. |

## Draft architecture diagram

```text
GitHub repository (main)
        | SCM polling, approximately every 5 minutes
        v
Jenkins (separate Compose stack)
Checkout -> Test -> Image Build -> Deploy -> Smoke / Verify
        | Docker CLI via host Docker socket
        v
Docker Compose application stack

Browser -> host port 8080 -> Public NGINX reverse proxy
                                  |-- / -------------> Frontend NGINX -> React files
                                  |-- /api/auth -----> Authentication API --\
                                  |-- /api/products -> Catalog API ----------+--> MySQL
                                  `-- /api/orders ---> Order API ------------/      |
                                                                                   |
                                                                            db_data volume

All application containers communicate on the private app-network.
```

The Jenkins container is a separate Compose stack from the application. Its
Docker-socket access assumes a trusted, controlled environment because it grants
Jenkins substantial control over the host Docker daemon. The pipeline's database
passwords and JWT secret are expected to be supplied through Jenkins Credentials;
only credential IDs belong in the pipeline file.

## Items to confirm before submission

- Replace all bracketed group/member placeholders with the team's official name
  and confirmed role assignments.
- Confirm the GitHub URL and `main` as the intended default branch in the
  team's Jenkins job.
- Run the CI command in the intended environment and record its result. The
  configured checks alone do not demonstrate a successful Jenkins run.
- Add evidence for automatic triggering, test-failure deployment gating,
  persistence, and rollback only after those behaviors have been exercised.
