# Technical document outline (8–15 pages)

**Status:** Outline only. This checkout is the feature-stage starter, not the final team deployment. This file is not the submission PDF. Fill every bracketed item from actual team records and runs before exporting an 8–15-page PDF.

## Page plan

1. **Cover and team** — project/course/section, repository, verified date, five confirmed members and roles. One role/name is still unconfirmed in the supplied team guide; do not invent it.
2. **Executive summary and scope** — problem, feature baseline, actual project stage, and verified exclusions/limitations.
3. **Application and module responsibilities** — React/Vite UI, auth service, catalog service, order service, and MySQL schema; distinguish inherited baseline from team contributions.
4. **Architecture** — insert Tato's reviewed diagram and port/request-path explanation. Current feature-stage topology is browser/Vite development server, three local API processes, and local MySQL. Add final proxy/container topology only after verifying it.
5. **Technology choices** — React, Vite, Express, MySQL; state evidence-backed reasons and relevant trade-offs. Add Docker, Compose, NGINX, and Jenkins rationale only for tools actually integrated.
6. **Feature contracts and persistence** — verified API routes, roles, schema/relationships, database configuration, and data lifecycle. Avoid exposing real test-account data.
7. **Local setup and user workflows** — clean-clone prerequisites and reproducible commands; link README; include completed buyer/seller QA records.
8. **Containerization and Compose** — final Dockerfiles, image provenance, networks, health/dependency order, and named DB volume; attach actual `docker compose config` and runtime evidence.
9. **Jenkins and trigger** — separate Jenkins deployment, safe credentials handling, job/SCM trigger configuration, and an actual push-triggered run identifier.
10. **Tests and quality gates** — backend/API tests, disposable cross-service smoke test, lint/build, pass/failure results, and proof a failed test blocks deployment.
11. **Persistence and rollback** — before/after DB-volume evidence and actual rollback image/commit/run; describe tested limitations.
12. **Defects and fixes** — linked issue, reproduction, root cause, fix PR/commit, and retest evidence for each real defect.
13. **Contribution and process** — issue/PR/commit evidence per confirmed member; include the fifth required member only after confirmation.
14. **Limitations and conclusion** — remaining work and only verified claims.
15. **References and appendices** — repository, relevant official docs, sanitized logs, evidence index, and glossary.

## Evidence to collect from owners

- **Tato:** final architecture diagram, actual ports/proxy paths, Docker/Compose validation output, persistence proof, and rollback deployment path.
- **Riboroso:** API/role contract, service and smoke-test explanation, test results, Jenkins trigger and quality-gate run IDs, and verified image tag source.
- **Salenga:** confirmed roster, contribution/process evidence, issue/PR references, and final acceptance decisions.
- **Ash:** completed QA checklist, truthful frontend build-label source, README clean-clone validation, and safe browser evidence.

## Export/review gate

Before PDF export, remove placeholders, check all factual statements against merged configuration or dated run output, redact credentials/personal data, confirm page count is 8–15, and ask a teammate unfamiliar with setup to follow the README from a clean clone.
