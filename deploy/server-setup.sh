#!/usr/bin/env bash
# One-time setup of an Ubuntu server for HouseholdMe.
# Run as a sudo-capable user:  bash server-setup.sh
# Safe to re-run: every step checks whether it is already done.
set -euo pipefail

APP_DIR=/opt/householdme

echo "==> Swap (small servers need it for Postgres + two Node apps)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "==> Firewall (SSH, HTTP, HTTPS)"
if command -v ufw >/dev/null; then
  sudo ufw allow OpenSSH >/dev/null
  sudo ufw allow 80/tcp >/dev/null
  sudo ufw allow 443/tcp >/dev/null
  sudo ufw --force enable >/dev/null
fi

echo "==> App directory $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  echo "==> Generating $APP_DIR/.env with random secrets"
  umask 077
  cat > "$APP_DIR/.env" <<EOF
# HouseholdMe production settings. Edit, then: cd $APP_DIR && docker compose up -d
POSTGRES_PASSWORD=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
ADMIN_EMAIL=admin@householdme.com
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=\n')

# Public address of the site. With a domain: SITE_ADDRESS=example.com, SITE_URL=https://example.com, COOKIE_SECURE=true
SITE_ADDRESS=:80
SITE_URL=http://$(curl -fsS https://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
COOKIE_SECURE=false

# File storage: local volume now; set STORAGE_DRIVER=s3 and the S3_* values to switch
STORAGE_DRIVER=local
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
S3_PUBLIC_URL=
EOF
fi

echo "==> Done. Log out and back in (or run 'newgrp docker') so '$USER' can use docker without sudo."
