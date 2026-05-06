Gravitino Trino plugin directory (jars are gitignored).

Before first `docker compose up`, download and unpack the official connector:

  bash docker/stack/trino/sync-plugin-from-dev.sh

Override download URL (mirror):

  GRAVITINO_TRINO_CONNECTOR_URL=https://.../gravitino-trino-connector-473-478-1.2.0.tar.gz bash docker/stack/trino/sync-plugin-from-dev.sh
