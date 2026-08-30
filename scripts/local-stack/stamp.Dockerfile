FROM alpine:3.21
LABEL org.opencontainers.image.source="https://github.com/arcanewords-app/arcane-reader"
LABEL org.opencontainers.image.description="Arcane Reader local Postgres PGDATA stamp. Contains prod-like catalog text. Keep private (do not push to a public registry)."
LABEL arcane.stamp.postgres_major="17"
COPY pgdata.tar.gz /stamp/pgdata.tar.gz
COPY manifest.json /stamp/manifest.json
