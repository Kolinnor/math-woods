#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/math-woods}"
APP_OWNER="${APP_OWNER:-${SUDO_USER:-deploy}}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root with sudo." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release ufw fail2ban unattended-upgrades

install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p "$APP_DIR"
if id "$APP_OWNER" >/dev/null 2>&1; then
  chown "$APP_OWNER":"$APP_OWNER" "$APP_DIR"
  usermod -aG docker "$APP_OWNER"
else
  echo "User $APP_OWNER does not exist yet; create it or chown $APP_DIR manually." >&2
fi

echo "VPS base setup complete."
echo "Copy Math Woods to $APP_DIR, then reconnect your SSH session so Docker group membership applies."
