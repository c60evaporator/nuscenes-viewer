#!/bin/bash
set -e

# Initialization SQL: Create ${POSTGRES_APP_USER} user (if not exists)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${POSTGRES_APP_USER}') THEN
      CREATE ROLE ${POSTGRES_APP_USER} WITH LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}';
    END IF;
  END \$\$;
EOSQL
