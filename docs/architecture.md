# Application architecture

## Starting point: without Docker or Jenkins

The application originally ran as separate local processes. The developer's browser
loaded the Vite development server, which forwarded API requests to the backend
processes. All three services connected to a MySQL server configured by the local
`.env` file.

```text
Browser
  |
  v
Vite development server :5173
  |-- /api/auth/*     -> Auth service :4001 --\
  |-- /api/products*  -> Catalog service :4002 --+--> Local MySQL
  `-- /api/orders*    -> Order service :4003 --/
```

There was no public application proxy, container network, or Docker-managed
persistent volume in this starting arrangement. The schema and seed data were
applied manually from `db/init.sql`.

## Containerized application

The Compose stack adds a single host entry point. NGINX serves as the proxy for the
React frontend and preserves the existing Express API path prefixes. Internal
services connect to MySQL using Compose DNS; only the proxy publishes a host port.

```text
Browser :PROXY_PORT (default 8080)
  |
  v
proxy :8080
  |-- /                 -> frontend :8080
  |-- /api/auth*        -> auth-service :4001 --\
  |-- /api/products*    -> catalog-service :4002 --+--> db :3306
  `-- /api/orders*      -> order-service :4003 --/       |
                                                        db_data
                   All containers join app-network
```

The MySQL image loads `db/init.sql` when it initializes a new data directory. Its
health check verifies that the resulting `users` table can be queried before the
API containers start. Frontend and proxy startup are gated on backend health.
`db_data` is a named volume, so stopping/recreating containers does not discard the
database; `docker compose down -v` explicitly removes it.

The Node services and NGINX proxy/frontend use non-root runtime images. The
official MySQL image starts its entrypoint with the permissions it needs to
initialize the data directory and runs the database process as its dedicated
`mysql` user. Docker build contexts exclude environment files, dependency
directories, Git metadata, generated output, and test artifacts where applicable.

Jenkins, CI/CD deployment, and integration-test orchestration are not included in
this application stack.
