#!/bin/sh
# Pasang game di VPS Ubuntu/Debian. Jalankan dari dalam folder build:
#   sudo sh deploy/install-vps.sh namadomain.com [email-untuk-https]
# Tanpa domain, game disajikan lewat IP server:
#   sudo sh deploy/install-vps.sh
set -e

DOMAIN="${1:-_}"
EMAIL="$2"
BUILD_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="$(basename "$BUILD_DIR")"
WEBROOT="/var/www/$SLUG"

if [ "$(id -u)" -ne 0 ]; then
    echo "Jalankan dengan sudo." >&2
    exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y nginx
fi

if [ "$BUILD_DIR" != "$WEBROOT" ]; then
    mkdir -p "$WEBROOT"
    cp -a "$BUILD_DIR"/. "$WEBROOT"/
fi

# Hanya root yang bisa menulis: proses web tidak bisa mengubah game walau berhasil dieksploitasi
chown -R root:root "$WEBROOT"
find "$WEBROOT" -type d -exec chmod 755 {} +
find "$WEBROOT" -type f -exec chmod 644 {} +

ZONE="$(printf '%s' "$SLUG" | tr -c 'a-zA-Z0-9' '_')"
SNIPPET="/etc/nginx/snippets/$SLUG-security.conf"
mkdir -p /etc/nginx/snippets
cp "$BUILD_DIR/deploy/security-headers.conf" "$SNIPPET"

SITE="/etc/nginx/sites-available/$SLUG"
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__WEBROOT__|$WEBROOT|g" -e "s|__ZONE__|$ZONE|g" -e "s|__SECURITY_SNIPPET__|$SNIPPET|g" "$BUILD_DIR/deploy/nginx-site.conf" > "$SITE"

# Tanda tangan URL paket aset memakai modul secure_link
if ! nginx -V 2>&1 | grep -q http_secure_link_module; then
    apt-get install -y nginx-extras
fi
ln -sf "$SITE" "/etc/nginx/sites-enabled/$SLUG"

# Situs bawaan nginx menutupi akses lewat IP
if [ "$DOMAIN" = "_" ]; then
    rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx || systemctl restart nginx

if [ "$DOMAIN" != "_" ] && [ -n "$EMAIL" ]; then
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx --non-interactive --agree-tos -m "$EMAIL" -d "$DOMAIN" --redirect
fi

if [ "$DOMAIN" = "_" ]; then
    echo "Selesai. Buka http://<ip-server>/"
elif [ -n "$EMAIL" ]; then
    echo "Selesai. Buka https://$DOMAIN/"
else
    echo "Selesai. Buka http://$DOMAIN/"
fi
