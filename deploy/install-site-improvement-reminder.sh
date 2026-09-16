#!/usr/bin/env sh
set -eu
# Run from /opt/math-woods after the application and database migrations are ready.
for unit in math-woods-site-improvement-reminder.service math-woods-site-improvement-reminder.timer; do
  sudo -n install -m 0644 "deploy/$unit" "/etc/systemd/system/$unit"
done
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now math-woods-site-improvement-reminder.timer
