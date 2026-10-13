# EcomApp Project Walkthrough

This guide explains the EcomApp marketplace from the browser to the database and deployment pipeline. It is written for teammates who need to run, explain, and demonstrate the project. The short explanations are intended for a general audience; the **Technical view** callouts give more implementation detail.

> **Be accurate in a presentation:** configuration in the repository shows what the system is designed to do. It does not, by itself, prove that the system ran successfully. Only describe a pipeline trigger, end-to-end flow, persistence check, or rollback as demonstrated after the team has actually run it and saved evidence.

## 1. What the project does

EcomApp is a small marketplace with two kinds of users:

- **Buyers** browse and search products, add products to a cart, check out, review their orders, and cancel an eligible pending order.
- **Sellers** create and manage their own product listings, see orders containing their products, and update fulfillment status.

The website is built from several cooperating parts:

| Part | Main responsibility | Project location |
|---|---|---|
| React frontend | Screens and interactions used by buyers and sellers | `frontend/` |
| Authentication API | Signup, login, profile updates, JWT creation and verification | `services/auth-service/` |
| Catalog API | Public product search and seller-owned listing management | `services/catalog-service/` |
| Order API | Checkout, buyer order history, seller orders and fulfillment | `services/order-service/` |
| MySQL | Persistent users, products, orders, and order items | `db/init.sql` |
| Vite development proxy | Forwards local browser API calls to local services | `frontend/vite.config.js` |
| NGINX reverse proxy | Single HTTP entry point for the containerized app | `proxy/` |
| Docker Compose | Starts and connects application containers | `docker-compose.yml` |
| Jenkins | Runs checks and automates image build, deployment, and verification | `Jenkinsfile`, `infra/jenkins/` |

### A plain-language analogy

Think of the frontend as the store counter, the APIs as specialized staff, and MySQL as the store's ledger:

- The authentication service checks who a user is.
- The catalog service handles merchandise and seller listings.
- The order service handles checkout and fulfillment.
- MySQL is the shared record book, so each service sees consistent data.
- In Docker deployment, NGINX is the reception desk directing each request to the right place.
- Jenkins is the automated release assistant that checks a code change before it replaces the running application.

## 2. Architecture and request flow

### Local development

```text
Browser
  |
  v
Vite frontend :5173
  |-- /api/auth/*      -> auth-service :4001
  |-- /api/products*   -> catalog-service :4002
  `-- /api/orders*     -> order-service :4003
                            |
                            v
                       Local MySQL
```

The browser normally calls relative paths such as `/api/products`. During local development, Vite forwards these requests to the corresponding API process. This avoids putting a different host and port into each frontend request.

### Containerized application

```text
Browser
  |
  v
Host port 8080 by default
  |
  v
NGINX proxy :8080
  |-- /                  -> frontend :8080
  |-- /api/auth*         -> auth-service :4001
  |-- /api/products*     -> catalog-service :4002
  `-- /api/orders*       -> order-service :4003
                              |
                              v
                           MySQL :3306
                              |
                         named db_data volume

The containers communicate over the private app-network.
```

In the Compose version, only the proxy publishes the application port to the host. The APIs and database are reached internally by Compose service name, rather than by using `localhost` inside a container. Each container has a health check; Compose uses service health to sequence startup.

### Example: searching for a product

1. The user types a term in the React search form.
2. The frontend sends `GET /api/products?search=...`.
3. Vite (local run) or NGINX (container run) forwards that request to the catalog service.
4. The catalog service builds a parameterized database query using the search term.
5. MySQL returns matching products.
6. The service responds with JSON, and React renders the product cards.

### Technical view: API boundaries

The API services are separate Express applications and listen on their own ports. The frontend does not connect to MySQL directly. That means validation, role checks, price calculation, and database writes stay on the server side instead of trusting browser code.

## 3. Buyer and seller workflows

### Account creation and login

1. A user chooses signup and enters a name, email, password, and account role.
2. The auth service validates the input and hashes the password before saving the account.
3. The service returns a signed JSON Web Token (JWT) and basic user information.
4. The frontend keeps the token for authenticated API calls.
5. On login, the service looks up the normalized email and compares the entered password with the stored hash.

The role is either `buyer` or `seller`. The user interface shows the actions for that role, and protected API routes independently enforce the role. Hiding a seller button in the browser is not the security boundary; the backend check is.

**Technical view:** passwords are hashed with bcryptjs. The auth service signs a JWT containing identity and role claims. Other services verify that token using the configured JWT secret. Tokens have a limited lifetime; the project does not implement refresh tokens.

### Seller creates a product

1. The seller opens **My Listings** and submits product details.
2. The frontend sends an authenticated `POST /api/products`.
3. The catalog service verifies the JWT and checks the seller role.
4. It validates the name, category, price, stock, and optional HTTP(S) image URL.
5. The listing is inserted with the authenticated seller's ID.
6. The frontend refreshes inventory and public search results.

Updates and deletion are scoped to both the product ID and the authenticated seller ID. Sellers cannot manage another seller's listing through these endpoints. A product with order history cannot be deleted; stock can instead be set to zero.

### Buyer checks out

1. The buyer adds available products to the cart.
2. The buyer submits the shipping address and payment method.
3. The frontend sends cart product IDs and quantities to `POST /api/orders`.
4. The order service verifies the buyer role and validates the request.
5. For each product, it reads the current database price and stock, and rejects a missing product or insufficient stock.
6. It creates a checkout order and its order-item records, then decreases product stock.
7. If all writes succeed, the database transaction commits. If a write fails, the service rolls the transaction back.
8. The buyer's order history refreshes.

The payment method is recorded as order data for this demonstration. The application does **not** process real card payments.

**Technical view:** the order service uses a database transaction and locks the product rows while checking stock. It calculates the total from database prices; it does not treat a client-supplied total as authoritative. Each order gets a unique opaque `ORD-...` order number.

### Seller fulfills an order

The seller order query returns orders with order items assigned to that seller. The seller can progress their items through `Processing`, `Shipped`, and `Delivered`. A seller can only update order items whose `seller_id` matches their account. For a checkout with items from multiple sellers, each seller controls only their own items.

### Buyer cancels an order

A buyer can cancel an order only while its overall status is `Pending` and the order belongs to that buyer. On successful cancellation, the service deletes the pending order and restores the stock quantities. A non-pending order cannot be cancelled through this endpoint.

## 4. Database model

The initial schema and demo products are defined in [`db/init.sql`](../db/init.sql).

```text
users
  1 ─────── many products       (seller ownership)
  1 ─────── many checkout_orders (buyer ownership)

checkout_orders
  1 ─────── many order_items

products
  1 ─────── many order_items

order_items also stores seller_id so each seller's fulfillment is scoped
to the seller who owned the product when it was ordered.
```

| Table | Stores |
|---|---|
| `users` | Name, unique email, password hash, buyer/seller role, creation time |
| `products` | Optional seller owner, product description/category, price, image, stock |
| `checkout_orders` | Buyer, order number, shipping information, payment method, total, summary status |
| `order_items` | Product, seller, quantity, purchase price, and per-item fulfillment status |

Foreign keys preserve relationships. For example, an order belongs to a user, and its order items point to products. `seller_id` may be `NULL` for initial demo products that do not belong to a registered seller.

**Important database behavior:** MySQL's initialization scripts run when its data directory is first created. Re-running a `CREATE TABLE IF NOT EXISTS` script does not update an existing table definition. For an existing database or Docker volume, use the documented migration approach or a deliberate schema migration; do not assume re-running initialization updates old tables.

## 5. Important API routes

The full routes are implemented in the service `server.js` files.

| Method | Route | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Service health response |
| `POST` | `/api/auth/signup` | Public | Register buyer or seller |
| `POST` | `/api/auth/login` | Public | Verify credentials and issue JWT |
| `PUT` | `/api/auth/profile` | Authenticated | Update the current user's profile |
| `GET` | `/api/products` | Public | Search/filter the catalog |
| `GET` | `/api/products/mine` | Seller | Read the current seller's listings |
| `POST` | `/api/products` | Seller | Create a seller-owned listing |
| `PUT` | `/api/products/:id` | Seller | Update a listing owned by the seller |
| `DELETE` | `/api/products/:id` | Seller | Delete an eligible listing owned by the seller |
| `POST` | `/api/orders` | Buyer | Place an order from cart items |
| `GET` | `/api/orders` | Buyer | Read the buyer's order history |
| `GET` | `/api/orders/seller` | Seller | Read orders containing the seller's products |
| `PUT` | `/api/orders/:id/status` | Seller | Update fulfillment for the seller's items |
| `DELETE` | `/api/orders/:id` | Buyer | Cancel a pending order and restore stock |

For protected routes the frontend sends an `Authorization: Bearer <token>` header. The token must not be pasted into project documentation, screenshots, or public issues.

## 6. Running the project

### Local development on Windows

Prerequisites: Node.js/npm, a local MySQL-compatible server, and Git. Follow the exact environment-variable guidance in the root [`README.md`](../README.md).

From PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
npm run setup
```

Set local `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to match the MySQL account and server on your machine. If the account has a blank password, `DB_PASSWORD=` is a valid local value. Keep `.env` private and out of Git.

Apply the schema once to the local server (or execute the SQL in Workbench), then start the processes:

```powershell
cmd /c "mysql -u root -p < db\init.sql"
npm run dev
```

If local MySQL root has no password, press Enter at the prompt. The exact `mysql` options may need to match your local installation. When the app is running, the expected local addresses are:

| Component | Address |
|---|---|
| Frontend | `http://localhost:5173` |
| Auth health | `http://localhost:4001/health` |
| Catalog health | `http://localhost:4002/health` |
| Orders health | `http://localhost:4003/health` |

Leave the development terminal open while testing; press **Ctrl+C** to stop the services.

### Containerized app

The root README is authoritative for the Compose environment variable names and startup commands. In general:

1. Install Docker Desktop with Linux container support (or Docker Engine and Compose v2).
2. Create `.env` from `.env.example` if it does not exist.
3. Set non-empty private values for the Compose database user/password, MySQL root password, and JWT secret.
4. Validate the Compose configuration, build images, and start the app using the README commands.
5. Check `docker compose ps` and service logs; open the proxy URL shown in the README.

The default proxy host port is `8080`, unless `PROXY_PORT` changes it. Do not use `docker compose down -v` for an ordinary stop: `-v` removes the named database volume and its data.

### Jenkins

Jenkins is intentionally run as a separate Compose project from the application. The root README documents first-time Jenkins setup, plugin/credential IDs, SCM job configuration, branch, and ports. Read that section before starting it; the Jenkins container mounts the host Docker socket, which gives Jenkins control of that Docker daemon.

The Jenkinsfile is a **declarative pipeline**. Its configured stages are:

1. **Checkout:** obtain repository content and identify the checked-out branch.
2. **Test:** install dependencies and run the root `npm run test:ci` command.
3. **Image Build:** build and tag application images for a normal build.
4. **Deploy:** on the configured deployment branch, deploy the selected image tag.
5. **Smoke / Verify:** check the deployed version and catalog route through the proxy.

The pipeline also has a `ROLLBACK_BUILD` parameter for selecting a previously successful image build number. The target images must still be present on the same Docker host.

**Be precise about test coverage:** the current root `test:ci` command runs backend JavaScript syntax checks, frontend lint, and a frontend production build. These are useful quality checks, but they are not comprehensive unit tests of business behavior. Do not call them a complete marketplace integration test unless additional assertion-based tests have been added and run.

### 6.1 How the infrastructure files fit together

These files are not separate applications. Each describes one part of turning the source code into a runnable application:

| File | What it describes | When it is used |
|---|---|---|
| `services/*/Dockerfile`, `frontend/Dockerfile`, `db/Dockerfile`, `proxy/Dockerfile` | How to package one service or image | When Docker builds that image |
| Each build context's `.dockerignore` | Which local files Docker must leave out of the build context | Before the matching Dockerfile is built |
| `docker-compose.yml` | Which containers run, how they connect, what settings they get, and what data persists | When a developer or Jenkins runs `docker compose` |
| `frontend/nginx.conf` | How the frontend container serves the compiled React site | Inside the frontend container |
| `proxy/nginx.conf` | How public requests are routed to frontend and APIs | Inside the public proxy container |
| `infra/jenkins/Dockerfile` and `infra/jenkins/docker-compose.yml` | How the separate Jenkins service is packaged and kept running | When Jenkins itself is started |
| Root `Jenkinsfile` | The ordered CI/CD instructions Jenkins checks out and executes | Each Jenkins pipeline run |

The build flow is: Compose reads its service definitions, Docker sends each build context (after applying `.dockerignore`) to the Docker engine, the corresponding Dockerfile creates an image, and Compose starts containers from those images. Jenkins uses the same repository files and Compose project to run checks, build tags, deploy a selected tag, and verify it.

### Dockerfiles: recipes for individual images

A Dockerfile is an image recipe. It starts from a base image, adds only the files and dependencies needed, sets runtime behavior, and declares the port the application listens on. `EXPOSE` documents the container port; it does **not** publish that port to the host. Host publishing is configured by Compose.

#### Backend services

The auth, catalog, and order Dockerfiles follow the same pattern:

```dockerfile
FROM node:22.14.0-alpine3.21
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.js ./
USER node
EXPOSE <service-port>
CMD ["npm", "start"]
```

- `FROM` selects a specific Node 22 Alpine base, rather than the moving `latest` tag.
- `WORKDIR` makes `/app` the working directory for later instructions.
- Copying package manifests before application source allows Docker to reuse the dependency-install layer when only `server.js` changes.
- `npm ci --omit=dev` installs exactly the lockfile dependencies and excludes development-only packages.
- `COPY --chown=node:node` gives the runtime user ownership of the source file.
- `USER node` avoids running the Node API as root inside the container.
- `EXPOSE` records the API's container port (4001, 4002, or 4003); Compose still keeps those ports internal.
- `CMD` starts the service with the `start` script from its package file.

Each API has its own build context, dependency manifest, image, environment, health check, and Compose service. This allows one API container to be replaced without bundling all backend code into a single runtime image.

#### Frontend: build once, serve static output

`frontend/Dockerfile` uses a **multi-stage build**:

```dockerfile
FROM node:22.14.0-alpine3.21 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm run build

FROM nginxinc/nginx-unprivileged:1.27.4-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

The first stage needs Node/npm to install packages, lint, and compile React/Vite into static files under `dist/`. The second stage starts from an unprivileged NGINX image and copies only the compiled site and its NGINX config. It does not carry the Node toolchain or source tree into the final image, so the production runtime image is smaller and has fewer unnecessary tools.

#### Database image

`db/Dockerfile` starts from the official MySQL 8.4 image and copies `db/init.sql` into `/docker-entrypoint-initdb.d/`. On a new, empty MySQL data directory, the official image runs that SQL during initialization to create the schema and seed products.

Initialization scripts are not a migration mechanism for an already-initialized data volume. If the schema has already been created and `db_data` contains files, editing or re-running the image does not automatically alter the existing tables.

#### Reverse-proxy image

`proxy/Dockerfile` starts from unprivileged NGINX, copies `proxy/nginx.conf`, and accepts an `APP_VERSION` build argument. It replaces the `__APP_VERSION__` placeholder in the NGINX config with the image tag. Thus, `GET /version` can report which proxy/application release was built.

### `.dockerignore`: what Docker is allowed to send to a build

Docker sends files from a **build context** to the Docker engine so a Dockerfile can copy them. A `.dockerignore` removes unwanted files from that context before the build; it helps avoid copying local secrets, bulky dependencies, generated output, or Git history into an image.

The service, frontend, and proxy contexts use patterns equivalent to:

```text
.env
.env.*
!.env.example
node_modules
coverage
dist
.git
```

- `.env` and `.env.*` keep local environment files out of that context.
- `!.env.example` is an exception that permits the sample template if it is needed; it does not permit `.env`.
- `node_modules` avoids reusing dependencies installed for a different operating system or machine; the image installs its own dependencies.
- `coverage` and `dist` omit generated test/build output from the input context. For the frontend, the image generates `dist` inside its build stage.
- `.git` omits repository metadata, which is not required to run the application.

`db/.dockerignore` follows the same principle with database-specific files such as local `.env` values, Git data, and generated folders. Jenkins does not use this app image context: its Dockerfile and Compose file live under `infra/jenkins/` and define Jenkins as a separate stack.

**Important distinction:** `.dockerignore` is not a substitute for `.gitignore`. `.gitignore` controls what Git tracks; `.dockerignore` controls what Docker sends during a build. Keep both protections, and never put real secrets in `.env.example`.

### `docker-compose.yml`: describe the application as one stack

Compose is the runbook for the application containers. The top-level file gives the project a stable name (with an optional environment override) and declares services, images/build contexts, environment values, networks, ports, storage, health checks, and startup dependencies.

#### Image names and tags

Each service has both an `image` and a `build` section. For example:

```yaml
image: ${IMAGE_NAMESPACE:-ecomapp}-auth-service:${IMAGE_TAG:-local}
build:
  context: ./services/auth-service
```

`build.context` selects the folder Docker uses as input, including that folder's Dockerfile and `.dockerignore`. `image` names the resulting image. If no CI tag is supplied, a local image uses the `local` tag. Jenkins supplies `IMAGE_TAG` as its build number, producing versioned image names such as `ecomapp-auth-service:42`.

#### Environment and secret values

Compose passes database host, port, user, password, database name, and JWT secret to API containers as environment variables. In containers the DB host is `db`, the Compose service name—not `localhost`, which would refer to the API container itself.

Expressions such as `${COMPOSE_DB_PASSWORD:?Set COMPOSE_DB_PASSWORD in .env}` mean “read this setting from the environment or `.env`, and stop with an error if it is absent.” This avoids silently starting the stack with a missing required secret. For local Compose, put non-empty private values in the ignored `.env` file. Jenkins instead binds secret values from its credentials store for the relevant pipeline steps.

There are distinct variable names for local development and Compose database settings in this project. Use the exact names in `.env.example` and the README; do not assume the empty-password behavior of local MariaDB is also valid for the Compose MySQL setup.

#### Network, port publishing, and storage

- `app-network` is a user-defined private bridge network. The containers find each other by service name.
- `ports` appears only on `proxy`: it maps a host port (default `8080`) to NGINX's container port `8080`. No host ports are published for MySQL or the APIs.
- `db_data:/var/lib/mysql` mounts a named Docker volume over MySQL's data directory. Container recreation does not normally delete the named volume.
- `docker compose down` removes containers and the default network but keeps named volumes. `docker compose down -v` also deletes the named volume and its database data, so it is not a routine cleanup command.

#### Readiness, health checks, and startup order

Each service has a health check:

- MySQL runs a query against the initialized `users` table. This checks more than whether the database process exists; it confirms the expected schema can be queried.
- Each Node API runs a small Node `fetch` against its own `/health` route.
- The frontend checks its NGINX `/health` route.
- The proxy checks the public catalog API route through its own NGINX listener.

`depends_on` with `condition: service_healthy` tells Compose to wait for dependencies to report healthy before starting dependent services. The APIs wait for MySQL; the frontend waits for the APIs; the proxy waits for the frontend and APIs. This improves startup ordering, but health checks are not a replacement for robust runtime reconnection if a dependency fails later.

`restart: unless-stopped` asks Docker to restart a service after failures or host restart unless an operator explicitly stopped it. Compose health status is also useful evidence: a container may be running while its health check is failing.

### NGINX configuration: two servers with different jobs

This project contains two NGINX config files. They are easy to confuse, but they run in different containers.

#### `frontend/nginx.conf`: serve the compiled React application

The frontend image copies the Vite build output into NGINX's static web root. Its NGINX config:

- Listens on port 8080 inside the frontend container.
- Uses `/usr/share/nginx/html` as the static root.
- Returns a simple successful `/health` response for Compose.
- Uses `try_files $uri $uri/ /index.html` for other paths.

The `try_files` fallback supports client-side React routes: if a requested path is not a physical file, NGINX serves `index.html` and lets the React application choose what to display.

#### `proxy/nginx.conf`: route incoming browser requests

The proxy image listens on container port 8080. It defines internal upstreams:

```nginx
frontend:8080
auth-service:4001
catalog-service:4002
order-service:4003
```

Those hostnames are Compose service names resolved on `app-network`. The configured resolver is Docker's internal DNS resolver so NGINX can resolve container names on the Compose network.

- `location /api/auth` forwards auth requests to the auth service.
- `location /api/products` forwards product requests to the catalog service.
- `location /api/orders` forwards order requests to the order service.
- `location /` forwards other browser requests to the frontend container.
- `location = /health` returns proxy health.
- `location = /version` returns the version string injected when the proxy image is built.

The API `proxy_pass` directives do not add a URI suffix, so the original `/api/...` path is preserved for Express routes. Forwarded headers retain the incoming host and client/protocol metadata for the upstream request.

**Request example:** browser requests `http://localhost:8080/api/products?search=mouse`; host port 8080 reaches the proxy container; NGINX sees the `/api/products` location and forwards that same URI and query string to `catalog-service:4002`; the catalog API responds; NGINX passes the response back to the browser.

### Jenkins: the pipeline file versus the Jenkins container

Jenkins has two separate pieces:

1. `infra/jenkins/Dockerfile` and `infra/jenkins/docker-compose.yml` run Jenkins itself.
2. The root `Jenkinsfile` tells Jenkins how to build and deploy the application repository.

Keeping Jenkins in its own Compose file means the app pipeline can replace the app containers without redeploying the CI server. Jenkins uses the `jenkins_home` named volume for its configuration and job state. The Compose file also mounts `/var/run/docker.sock`, allowing Jenkins to invoke the host Docker engine and manage the app containers. This is powerful host-level access; the Jenkins instance should be used only by trusted users/code.

The custom Jenkins image starts from Jenkins with Java 21, then installs the Docker CLI/Compose plugin, Node 22, and plugins listed in `infra/jenkins/plugins.txt`. The Docker CLI inside Jenkins talks to the host daemon through the mounted socket; the Docker engine itself is not nested inside Jenkins.

#### Pipeline stage-by-stage

The root pipeline currently implements:

1. **Checkout:** `checkout scm` obtains the revision from the Jenkins job's SCM configuration. The pipeline derives the checked-out branch and refuses to continue if it cannot determine it.
2. **Test:** `npm ci` installs dependencies from lockfiles at the root, in all three service folders, and in the frontend. Then `npm run test:ci` runs the repository's syntax check, frontend lint, and production build.
3. **Image Build:** for a normal run (empty `ROLLBACK_BUILD`), Jenkins temporarily binds database and JWT credentials, then runs `docker compose build --pull`. The tag is the Jenkins build number. During rollback this stage is skipped.
4. **Deploy:** this stage runs only when the checked-out branch is `main`. It chooses either this run's build number or the `ROLLBACK_BUILD` value, checks that each expected tagged image exists locally, and runs `docker compose up -d --no-build --remove-orphans`. `--no-build` means use the selected images rather than rebuilding them during deployment.
5. **Smoke / Verify:** on `main`, Jenkins requests `/version` through the published proxy and verifies it equals the selected image tag. It also requests `/api/products` and displays Compose service state.

Declarative pipeline stages are ordered. If a command in **Test** exits nonzero, Jenkins marks the run failed; subsequent normal stages, including **Image Build** and **Deploy**, are skipped. This ordering is the configured quality gate. A screenshot of a Jenkinsfile cannot prove the gate was exercised: capture an actual run where Test fails and Deploy is visibly skipped.

#### Trigger, credentials, and rollback

- `pollSCM('H/5 * * * *')` asks Jenkins to check the configured Git repository approximately every five minutes. The job must be configured from SCM with the right repository URL, branch, and `Jenkinsfile` script path. A push-trigger claim needs an observed automatically started build; a manually started build is not proof of the trigger.
- Database and JWT values are stored in Jenkins Credentials under IDs such as `ecommerce-db-password`, `ecommerce-mysql-root-password`, and `ecommerce-jwt-secret`. The Jenkinsfile refers to these IDs and temporarily exposes values to the shell only for the required Compose command. Do not print or commit credential values.
- Leave `ROLLBACK_BUILD` empty for a normal pipeline run. For rollback, manually start a parameterized Jenkins run and enter the numeric Jenkins build number whose images should be restored.
- The rollback run still performs the pipeline's tests. It skips creating new images, chooses the requested old tag, checks all six image tags exist, deploys them, and checks the deployed version via the proxy.
- Images must still exist on the same Docker host. This sample has no remote image registry, and image rollback does not restore an earlier database schema or database contents.

**Implementation/design caveat:** the `Test` stage shown here is a syntax/lint/build gate. It is not the separate buyer/seller API smoke test. If the course expects an automated end-to-end test in the pipeline, verify that one has been added and wired into the pipeline before claiming that coverage.

### Reading the configuration as one deployment

For a regular Jenkins deployment:

1. Jenkins checks out a commit and tests it.
2. Compose builds images from the service-specific contexts. Each context is filtered by its `.dockerignore`.
3. Jenkins tags each image using `BUILD_NUMBER`; the proxy build embeds the same tag at `/version`.
4. Compose creates or reuses `app-network` and `db_data`, waits for healthy dependencies, and starts/replaces application containers.
5. Only the NGINX proxy publishes a host port. It routes the browser to the static frontend or one of the API containers.
6. Jenkins checks the deployed version and catalog endpoint through the proxy.

For rollback, the same Compose definitions are used, but Jenkins selects an older already-built tag and starts it without rebuilding. The database volume remains attached, so image rollback does not rewind user, product, or order data.

## 7. Frontend usability features

The frontend includes:

- A dark/light theme toggle; the selected theme is saved in browser `localStorage`.
- A show/hide password control on login and signup.
- Role-aware navigation for buyer and seller accounts.
- Product keyword/category filters, seller inventory controls, cart quantity controls, order history, and profile controls.

These controls improve usability, but backend authorization and validation remain responsible for enforcing data access and business rules.

## 8. Configuration and secrets

Configuration changes between a developer's computer and a container, so values are supplied through environment variables rather than embedded in application source.

- `.env.example` is the safe template to share.
- `.env` contains local secrets and must remain untracked.
- Local development DB variables are separate from Compose DB variables; use the exact names documented by the README.
- Jenkins uses credential IDs to retrieve secret values at runtime. Secret values belong in Jenkins Credentials, not the Jenkinsfile or repository.
- A JWT secret must be consistent across the auth, catalog, and order services that issue/verify tokens.

Never put passwords, JWT secrets, account credentials, or bearer tokens in this walkthrough, source control, screenshots, or public messages.

## 9. Tests, evidence, and limitations

Run these checks from the project root when applicable:

```powershell
npm run check:services
npm run lint
npm run build:frontend
npm run test:ci
```

These commands check syntax, lint, and frontend compilation. A successful result does not by itself prove that MySQL credentials work, the full UI journey is successful, the Docker proxy is reachable, or Jenkins has triggered automatically.

For project evidence, record only results the team actually observed:

- Docker Compose service health and browser access through the proxy.
- Buyer and seller signup/login and role-specific actions.
- Seller listing creation followed by a buyer checkout and seller order visibility.
- The actual Jenkins trigger/run URL and stage outcomes.
- A test failure that prevents deployment, plus a later passing recovery run.
- Database data surviving a normal stack restart/redeployment.
- Rollback to a previous tagged image and verification through the proxy.

The app is an educational demonstration, not a production payment platform. It does not perform real payment processing. Its image rollback restores application containers/images, not database state or schema.

## 10. Demo sequence

Use disposable test data and a rehearsed machine. A clear demo sequence is:

1. Show the app running and explain the browser-to-proxy-to-service-to-database request path.
2. Register or log in as a seller and create a small disposable listing.
3. Log in as a buyer, find that listing, add it to the cart, and place an order.
4. Return to the seller account and show the order and its product item.
5. Show the Jenkins pipeline started by the configured trigger, if that has been proven on the team's configured job.
6. Show the Test stage failing for a prepared test change and Deploy being skipped; then restore/fix the code and show a passing run.
7. Show that application data survives the intended restart/redeployment.
8. Roll back to an earlier successful image tag and verify the app through the proxy.

Do not run destructive database/volume commands on shared demo data. Keep the rollback and test-failure demonstrations isolated and recover the application to a passing state afterward.

## 11. Professor Q&A practice

### Application and architecture

**Q: What does your application do?**  
A: It is a buyer/seller marketplace. Buyers search products and place orders; sellers manage their own listings and fulfill orders containing their products.

**Q: Why use separate services?**  
A: Authentication, catalog operations, and orders are different responsibilities. Separate services make each boundary and API responsibility clearer and allow the services to be built/deployed as distinct containers.

**Q: How does a browser request reach the database?**  
A: The browser sends an API request through Vite locally or NGINX in the container stack. The relevant Express service validates it and queries MySQL. The frontend never connects directly to the database.

**Q: Why use a reverse proxy?**  
A: It gives the browser one application entry point. NGINX serves/routes frontend traffic and forwards API paths to the correct internal service, so we do not need to expose every service port publicly.

**Q: What is the difference between a container and an image?**  
A: An image is the packaged template containing an application and its runtime. A container is a running instance created from an image.

**Q: What is a Docker network?**  
A: It is a private communication space for containers. Here the application containers can reach one another by Compose service names over `app-network`.

### Data and API behavior

**Q: How are passwords protected?**  
A: The auth service stores a bcrypt hash, not the original password. During login it compares the submitted password with the stored hash.

**Q: How do protected requests work?**  
A: After login/signup the frontend receives a signed JWT and sends it as a Bearer token. Each protected backend endpoint verifies the token and checks the required role.

**Q: How do you prevent one seller from changing another seller's product?**  
A: The catalog service uses the authenticated user's ID in the update/delete query. It does not trust a seller ID supplied by the browser.

**Q: How do you prevent checkout from using a false price?**  
A: The order service reads the price from the database and calculates the total on the server. The total displayed by the browser is not authoritative.

**Q: Why use a transaction for checkout?**  
A: Creating the order, creating its line items, and decrementing stock are one logical operation. A transaction commits all of them together or rolls them all back if something fails.

**Q: Why do you lock product rows during checkout?**  
A: A row lock makes concurrent checkouts serialize stock checks for that product, reducing the chance that two buyers both purchase the same last unit.

**Q: Why keep seller ID on an order item?**  
A: It identifies which seller owns each ordered item. In an order containing products from multiple sellers, each seller can see/update only their own items.

**Q: What does the database volume preserve?**  
A: It stores MySQL files outside the disposable database container. Recreating app containers or normally stopping the Compose project does not remove that data; explicitly deleting the volume does.

### CI/CD and operations

**Q: What does the Jenkins pipeline do?**  
A: It checks out source, runs the configured checks, builds tagged images, deploys on the configured branch, and performs a post-deployment verification. The actual Jenkins job and its run history must be shown to prove it executed.

**Q: How does the test gate prevent a bad deployment?**  
A: Pipeline stages run in order. When the Test stage exits unsuccessfully, Jenkins marks the run as failed and does not proceed to later stages such as Deploy. Show the failed run and skipped deployment stage as evidence.

**Q: What do the current tests check?**  
A: The root `test:ci` command checks backend JavaScript syntax, runs frontend lint, and builds the frontend. This catches certain syntax/style/build failures. It does not yet represent exhaustive behavioral tests for all buyer and seller flows.

**Q: How do image tags support rollback?**  
A: Images are tagged with Jenkins build numbers. A previous successful tag can be selected with `ROLLBACK_BUILD`, if all required tagged images still exist on the same Docker daemon.

**Q: Does rollback restore orders or database schema?**  
A: No. This rollback selects application images. Persistent database data/schema remain outside image rollback and require a separate backup/migration strategy.

**Q: What is the health check for?**  
A: It lets Compose or deployment tooling check whether a service responds to a simple readiness request, rather than assuming a started process is ready.

**Q: What would you improve next?**  
A: Add broader automated tests for backend behavior and UI integration, complete repeatable end-to-end QA, and use proper backup and migration practices before treating this educational demo like a production system.

## 12. One-minute explanation

> “EcomApp is a small marketplace with buyer and seller roles. The React frontend communicates with three Express services: authentication, catalog, and orders. The services share a MySQL database, and protected routes verify JWTs and enforce roles. At checkout, the order service validates stock, calculates prices from the database, and records the order and stock changes in a transaction. For container deployment, Docker Compose connects services on a private network, MySQL data uses a named volume, and NGINX is the public entry point. Jenkins defines the automated check/build/deploy/verify pipeline. We will show the actual run evidence for automation, persistence, test gating, and rollback rather than treating configuration alone as proof.”
