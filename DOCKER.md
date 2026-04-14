# Docker Deployment Guide

This guide covers how to self-host Net Worth Tracker using Docker on any VPS or server. Firebase still handles authentication and the database — Docker just runs the Next.js application layer.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Build and Run](#build-and-run)
3. [Environment Variables](#environment-variables)
4. [Stopping the Stack](#stopping-the-stack)
5. [Cron Jobs](#cron-jobs)
6. [Reverse Proxy with Nginx](#reverse-proxy-with-nginx)
7. [Keeping the Container Updated](#keeping-the-container-updated)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Docker** 20.10+ and **Docker Compose** v2+ on your server
- A configured Firebase project (see [SETUP.md](SETUP.md) — complete the Firebase section before continuing)
- A domain name pointing to your server (for HTTPS with Let's Encrypt)

---

## Build and Run

### Option A — docker-compose (recommended)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/net-worth-tracker.git
cd net-worth-tracker

# 2. Configure environment variables
cp .env.local.example .env.local
# Fill in .env.local with your Firebase credentials and secrets (see below)

# 3. Build and start
# IMPORTANT: Compose does not use .env.local for build-time variable substitution
# unless you pass it explicitly with --env-file.
docker compose --env-file .env.local up -d --build

# 4. Check logs
docker compose logs -f app
```

The app will be available at `http://your-server-ip:3000`.

### Option B — plain docker build

```bash
# Build the image, passing NEXT_PUBLIC_* vars as build args
docker build \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=your_value \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com \
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id \
  --build-arg NEXT_PUBLIC_APP_URL=https://your-domain.com \
  -t net-worth-tracker .

# Run with server-side secrets passed at runtime
docker run -d \
  -p 3000:3000 \
  --env-file .env.local \
  --restart unless-stopped \
  --name net-worth-tracker \
  net-worth-tracker
```

---

## Environment Variables

### Why two mechanisms?

Next.js `NEXT_PUBLIC_*` variables are inlined into the JavaScript bundle **at build time**. They must be known when `docker build` runs, not when the container starts. All other variables (Firebase Admin credentials, API keys) are **runtime** secrets injected via `env_file` or `-e` flags.

### Build-time variables (pass as `--build-arg`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase client API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase app ID |
| `NEXT_PUBLIC_APP_URL` | Yes | Your deployed URL (e.g. `https://app.yourdomain.com`) |
| `NEXT_PUBLIC_REGISTRATIONS_ENABLED` | No | Allow new signups (default: `true`) |
| `NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED` | No | Enable email allowlist (default: `false`) |
| `NEXT_PUBLIC_REGISTRATION_WHITELIST` | No | Comma-separated allowed emails |
| `NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS` | No | Enable dummy data in Settings (default: `false`) |
| `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` | No | Enable AI assistant (default: `true`) |

When using docker-compose, these are picked up from `.env.local` via the `args` block in `docker-compose.yml` only if you pass the env file explicitly:

```bash
docker compose --env-file .env.local up -d --build
```

Without `--env-file .env.local`, Docker Compose only uses `.env` automatically for variable substitution in `build.args`. The `env_file:` section in `docker-compose.yml` applies only to container runtime variables, not to the image build step.

### Runtime variables (in `.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes* | Full Firebase Admin JSON (recommended) |
| `FIREBASE_ADMIN_PROJECT_ID` | Yes* | Firebase project ID (alternative to JSON) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Yes* | Service account email (alternative) |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Yes* | Private key (alternative) |
| `CRON_SECRET` | Yes | Random secret for authenticating cron calls |

*Use either `FIREBASE_SERVICE_ACCOUNT_KEY` **or** the three separate `FIREBASE_ADMIN_*` vars.

> **Security**: Never commit `.env.local` to Git. The `.gitignore` already excludes it. Make sure Docker build context does not include it either — `.dockerignore` excludes `.env*` files.

---

## Stopping the Stack

Useful docker-compose commands when you want to stop or remove the app:

```bash
# Stop containers without removing them
docker compose stop

# Stop and remove containers, networks, and the default Compose resources
docker compose down

# Stop and remove everything including named volumes
# Use this only if you explicitly want to delete persisted Docker volume data
docker compose down -v
```

If you started the stack with `.env.local`, it is safest to keep using the same flag consistently:

```bash
docker compose --env-file .env.local stop
docker compose --env-file .env.local down
```

---

## Cron Jobs

Vercel runs the two cron jobs automatically. In a Docker deployment you need to trigger them yourself.

The two endpoints:
- `POST /api/cron/monthly-snapshot` — creates monthly portfolio snapshots for all users
- `POST /api/cron/daily-dividend-processing` — processes dividend data and creates cashflow entries

Both require the `Authorization: Bearer $CRON_SECRET` header.

### Option A — external scheduler (recommended, zero-maintenance)

Use a free service like [cron-job.org](https://cron-job.org) or [easycron.com](https://www.easycron.com):

1. Create two jobs with the following settings:

| Job | URL | Schedule (UTC) |
|-----|-----|----------------|
| Monthly Snapshot | `https://your-domain.com/api/cron/monthly-snapshot` | `0 18 28-31 * *` |
| Daily Dividends | `https://your-domain.com/api/cron/daily-dividend-processing` | `0 18 * * *` |

2. Add an HTTP header to each job:
   ```
   Authorization: Bearer your_cron_secret_here
   ```

### Option B — Linux crontab on the host

```bash
# Edit the server crontab
crontab -e

# Add these two lines (replace YOUR_URL and YOUR_SECRET)
0 18 28-31 * * curl -s -X GET -H "Authorization: Bearer YOUR_SECRET" https://YOUR_URL/api/cron/monthly-snapshot
0 18 * * *   curl -s -X GET -H "Authorization: Bearer YOUR_SECRET" https://YOUR_URL/api/cron/daily-dividend-processing
```

### Option C — cron sidecar in docker-compose

Add a lightweight cron container to `docker-compose.yml`:

```yaml
  cron:
    image: alpine:3.19
    depends_on:
      - app
    environment:
      CRON_SECRET: ${CRON_SECRET}
      APP_URL: ${NEXT_PUBLIC_APP_URL}
    command: >
      sh -c "echo '0 18 28-31 * * wget -qO- --header=\"Authorization: Bearer $$CRON_SECRET\" $$APP_URL/api/cron/monthly-snapshot' > /etc/crontabs/root &&
             echo '0 18 * * * wget -qO- --header=\"Authorization: Bearer $$CRON_SECRET\" $$APP_URL/api/cron/daily-dividend-processing' >> /etc/crontabs/root &&
             crond -f -l 2"
    restart: unless-stopped
```

### Testing cron endpoints manually

```bash
curl -X GET \
  -H "Authorization: Bearer your_cron_secret" \
  https://your-domain.com/api/cron/monthly-snapshot
```

---

## Reverse Proxy with Nginx

Expose the app on port 443 with automatic HTTPS via Let's Encrypt.

### Install certbot and nginx

```bash
apt install -y nginx certbot python3-certbot-nginx
```

### Nginx config

Create `/etc/nginx/sites-available/net-worth-tracker`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Forward all requests to the Next.js container
    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable the site and get a certificate
ln -s /etc/nginx/sites-available/net-worth-tracker /etc/nginx/sites-enabled/
certbot --nginx -d your-domain.com
nginx -t && systemctl reload nginx
```

---

## Keeping the Container Updated

When you pull new code and want to redeploy:

```bash
git pull

# Rebuild and restart with zero downtime (compose replaces the old container)
docker compose --env-file .env.local up -d --build

# Clean up old images to free disk space
docker image prune -f
```

---

## Troubleshooting

### Container exits immediately after start

Check the logs:

```bash
docker compose logs app
```

Common causes:
- Missing `FIREBASE_SERVICE_ACCOUNT_KEY` or Admin SDK vars — the app crashes at startup if the Admin SDK cannot initialize
- `NEXT_PUBLIC_*` vars were empty at build time — rebuild the image with the correct `--build-arg` values

### "Invalid Firebase credentials" error

If you use `FIREBASE_ADMIN_PRIVATE_KEY` (not the full JSON), the private key newlines must be preserved. The safest approach is to use `FIREBASE_SERVICE_ACCOUNT_KEY` with the full JSON content instead. See [VERCEL_SETUP.md](VERCEL_SETUP.md) for the exact formatting instructions — the same tips apply for Docker.

### Google login fails / redirect blocked

Firebase Authentication rejects OAuth redirects from unauthorized domains. This is a Firebase security rule, not a Docker issue.

**Fix**: go to **Firebase Console** → your project → **Authentication** → **Settings** → **Authorized domains**, then add your server's domain (e.g. `app.yourdomain.com`).

Note: `*.vercel.app` is pre-authorized by Firebase automatically — that's why Vercel works out of the box. Any other domain, including your own Docker-hosted one, must be added manually.

### App runs but login fails (other causes)

Make sure `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` matches your Firebase project's auth domain.

### Port 3000 already in use

Change the host port in `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # map host 8080 → container 3000
```

Then point nginx at `localhost:8080` instead.

### Cron jobs not running

Test the endpoint manually (see [Testing cron endpoints](#testing-cron-endpoints-manually)) to confirm the app is reachable and the secret is correct. If the endpoint returns 401, check that `CRON_SECRET` in your scheduler matches the value in `.env.local`.
