# Start from the official pinned MySQL server image.
FROM mysql:8.4.4

# MySQL runs this script on first initialization of an empty data directory.
COPY init.sql /docker-entrypoint-initdb.d/001-init.sql
