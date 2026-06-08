# Docker Setup for Splitpro

This guide covers Docker setup for Splitpro. You can choose between a production Docker Compose setup or a standalone container.

## Prerequisites

Before you begin, ensure that you have the following installed:

- Docker
- Docker Compose

## Production Docker Compose Setup

This setup includes PostgreSQL and the Splitpro application.

1. Download the Docker Compose file from the Splitpro repository: [compose.yml](https://github.com/oss-apps/split-pro/blob/main/docker/prod/compose.yml)
2. Navigate to the directory containing the `compose.yml` file.
3. Create a `.env` file in the same directory. Copy the contents of `.env.example`.
4. Adjust the variables to your deployment (see [docs/CONFIGURATION.md](../docs/CONFIGURATION.md)).
5. Run the following command to start the containers:

```bash
docker-compose up -d
```

This will start the PostgreSQL database and the Splitpro application containers.

6. Access the Splitpro application by visiting `http://localhost:3000` in your web browser.

## DigitalOcean Droplet with auto-deploy from GitHub

If you want to keep full expense history and auto-deploy on every commit to `main`, this is the recommended setup.

### Why this setup

- PostgreSQL stays on persistent disk (`database` volume).
- Receipts stay on persistent disk (`uploads` volume).
- You can rebuild and deploy directly from your branch source on each push.

### 1) Prepare the droplet

1. Create a droplet with Docker + Docker Compose installed.
2. Clone this repository to a stable path (for example `/opt/split-pro`).
3. Copy `.env.example` to `.env` and configure required variables.
4. Start once manually:

```bash
cd /opt/split-pro
docker compose -f docker/prod/compose.yml -f docker/prod/compose.source.override.yml up -d --build
```

The `compose.source.override.yml` file builds SplitPro from your checked out branch source instead of using the prebuilt image tag.

### 2) Enable persistent data and backups

- Keep Docker named volumes (`database`, `uploads`) attached to the droplet.
- Enable DigitalOcean backups/snapshots for the droplet.
- Create regular PostgreSQL dumps:

```bash
docker exec -t splitpro-db pg_dumpall -c -U postgres > splitpro_backup.sql
```

Store dump files outside the droplet or sync them to external object storage.

### 3) Configure GitHub Actions deployment

This repository includes `.github/workflows/deploy-droplet.yml`:

- Auto deploy on `push` to `main`.
- Manual deploy with selected branch via **Run workflow**.

Add these repository secrets:

- `DEPLOY_HOST`: droplet IP or hostname
- `DEPLOY_PORT`: SSH port (usually `22`)
- `DEPLOY_USER`: SSH user
- `DEPLOY_SSH_KEY`: private key for deploy user
- `DEPLOY_PATH`: repository path on droplet (for example `/opt/split-pro`)

### 4) Branch override deploys

To deploy a non-main branch:

1. Open **GitHub Actions**.
2. Select **Deploy to Droplet** workflow.
3. Click **Run workflow**.
4. Set `branch` to the branch you want.

### Minimal .env example

```bash
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="strong-password"
POSTGRES_DB="splitpro"
DATABASE_URL="postgresql://postgres:strong-password@postgres:5432/splitpro"
NEXTAUTH_SECRET="<generated>" # you can use `openssl rand -base64 32` to generate a strong secret
NEXTAUTH_URL="http://localhost:3000"
# See https://developers.google.com/identity/protocols/oauth2
GOOGLE_CLIENT_ID="<client-id>"
GOOGLE_CLIENT_SECRET="<client-secret>"
```

## Other options

There are of course other ways to run Splitpro with Docker. The above is the recommended production setup, but you can run it in other ways provided you know what you are doing.

If you prefer a more minimal setup, you can run the Splitpro application in a standalone container and connect it to an external PostgreSQL database. In this case, you can pass the environment variables directly when running the container.

Just make sure you install `pg_cron` if you want to use recurring transactions and currency/bank cache cleaning.

### Kubernetes

Some community members have successfully deployed Splitpro on Kubernetes. You can check out their deployments:

- https://github.com/gravelfreeman/talos/blob/main/clusters/main/kubernetes/apps/splitpro/app/helm-release.yaml

## Success

You have now successfully set up Splitpro using Docker. If you encounter any issues or have further questions, please seek assistance from the community.

## Migrating instance

To migrate your instance it is sufficient to copy the `.env` file, your uploads volume directory, as well as to migrate your database.

For v1 to v2 upgrades, see [docs/MIGRATING_FROM_V1.md](../docs/MIGRATING_FROM_V1.md).

#### DB backup

```bash
docker exec -t <postgres container name> pg_dumpall -c -U postgres > splitpro_backup.sql
```

#### DB restore

```bash
cat splitpro_backup.sql | docker exec -i <postgres container name> psql -U postgres
```

Make sure to adjust the database name and user if you are not using the default `postgres` user or database. Also, the above restore command should be run on a clean database.

## Authentication

Splitpro uses NextAuth with email, OAuth, and OIDC providers. Configure at least one provider and ensure `NEXTAUTH_URL` matches the URL you will access in the browser.

See [docs/AUTHENTICATION.md](../docs/AUTHENTICATION.md) for details.

## Recurring transactions (pg_cron)

Recurring expenses require PostgreSQL with `pg_cron`. The example compose file already enables it. If you use another database image, you must enable the extension yourself.

See [docs/RECURRING_TRANSACTIONS.md](../docs/RECURRING_TRANSACTIONS.md).

## Receipt storage

Receipts are stored locally. Make sure the `uploads` volume is mounted so files persist across restarts (see `docker/prod/compose.yml`).
