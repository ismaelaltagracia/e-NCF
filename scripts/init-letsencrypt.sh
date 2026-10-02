#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Emisión INICIAL del certificado Let's Encrypt para e-mitte.com.
#
# Se ejecuta UNA sola vez en el servidor, después de:
#   1. Que el DNS de e-mitte.com (y www) apunte a este servidor.
#   2. Haber hecho `docker compose ... up -d` al menos del backend.
#
# Qué hace:
#   - Crea un certificado AUTOFIRMADO temporal para que Nginx pueda arrancar su
#     bloque 443 (que referencia el cert) sin romper.
#   - Levanta Nginx.
#   - Pide el certificado REAL a Let's Encrypt vía webroot (challenge HTTP-01).
#   - Recarga Nginx con el certificado real.
#
# La renovación posterior es automática (servicio "certbot" del compose).
#
# Uso:
#   sudo bash scripts/init-letsencrypt.sh
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

# --- Configuración (ajusta EMAIL si quieres recibir avisos de expiración) ---
DOMAINS=(e-mitte.com www.e-mitte.com)
EMAIL="admin@e-mitte.com"          # para avisos de Let's Encrypt
DATA_DIR="/opt/e-ncf-data"
LE_DIR="${DATA_DIR}/letsencrypt"
WEBROOT="${DATA_DIR}/certbot-www"
STAGING=0                           # pon 1 para probar sin consumir cuota de LE

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
PRIMARY="${DOMAINS[0]}"
LIVE_PATH="${LE_DIR}/live/${PRIMARY}"

echo "==> Preparando directorios de certificados..."
mkdir -p "${LE_DIR}" "${WEBROOT}"

# 1) Certificado autofirmado temporal (solo para que Nginx levante el 443).
if [ ! -e "${LIVE_PATH}/fullchain.pem" ]; then
  echo "==> Creando certificado temporal autofirmado para ${PRIMARY}..."
  mkdir -p "${LIVE_PATH}"
  docker run --rm -v "${LE_DIR}:/etc/letsencrypt" certbot/certbot \
    sh -c "openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout '/etc/letsencrypt/live/${PRIMARY}/privkey.pem' \
      -out '/etc/letsencrypt/live/${PRIMARY}/fullchain.pem' \
      -subj '/CN=${PRIMARY}'"
fi

echo "==> Levantando Nginx (y backend) ..."
${COMPOSE} up -d nginx

echo "==> Borrando certificado temporal..."
docker run --rm -v "${LE_DIR}:/etc/letsencrypt" certbot/certbot \
  sh -c "rm -rf /etc/letsencrypt/live/${PRIMARY} \
    /etc/letsencrypt/archive/${PRIMARY} \
    /etc/letsencrypt/renewal/${PRIMARY}.conf"

# 2) Solicitud del certificado real vía webroot.
domain_args=""
for d in "${DOMAINS[@]}"; do domain_args="${domain_args} -d ${d}"; done

staging_arg=""
if [ "${STAGING}" != "0" ]; then staging_arg="--staging"; fi

echo "==> Solicitando certificado real a Let's Encrypt para: ${DOMAINS[*]}"
docker run --rm \
  -v "${LE_DIR}:/etc/letsencrypt" \
  -v "${WEBROOT}:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
    ${staging_arg} \
    --email "${EMAIL}" \
    --agree-tos --no-eff-email \
    --force-renewal \
    ${domain_args}

echo "==> Recargando Nginx con el certificado real..."
${COMPOSE} exec nginx nginx -s reload

echo ""
echo "✓ Certificado emitido. Prueba: https://${PRIMARY}"
