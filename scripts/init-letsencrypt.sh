#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Configuración COMPLETA de dominio + HTTPS para e-mitte.com, en un solo paso.
#
# Hace TODO lo necesario, de forma idempotente (se puede reejecutar sin dañar):
#   1. Ajusta FRONTEND_URL y CORS_ORIGINS en el .env (dominio).
#   2. Abre los puertos 80/443 en el firewall (ufw) si está activo.
#   3. Prepara los directorios de certificados.
#   4. Crea un certificado temporal autofirmado para que Nginx pueda arrancar.
#   5. Levanta/recrea Nginx.
#   6. Pide el certificado REAL a Let's Encrypt (challenge HTTP-01 por webroot).
#   7. Recarga Nginx con el certificado real.
#
# La renovación posterior es automática (servicio "certbot" del compose).
#
# Uso:
#   sudo bash scripts/init-letsencrypt.sh                 # certificado real
#   sudo STAGING=1 bash scripts/init-letsencrypt.sh       # prueba (no gasta cuota)
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

# --- Configuración ---------------------------------------------------------
DOMAINS=(e-mitte.com www.e-mitte.com)
EMAIL="${LE_EMAIL:-admin@e-mitte.com}"   # avisos de expiración de Let's Encrypt
DATA_DIR="/opt/e-ncf-data"
LE_DIR="${DATA_DIR}/letsencrypt"
WEBROOT="${DATA_DIR}/certbot-www"
STAGING="${STAGING:-0}"                   # 1 = modo prueba (no consume cuota)
ENV_FILE="/opt/e-ncf/.env"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
PRIMARY="${DOMAINS[0]}"
LIVE_PATH="${LE_DIR}/live/${PRIMARY}"

cd /opt/e-ncf

# --- Paso 1: ajustar el .env (dominio) -------------------------------------
echo "==> Ajustando FRONTEND_URL y CORS_ORIGINS en el .env ..."
set_env_var() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    # Reemplaza el valor existente (usa | como separador por si hay / en el valor).
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}
set_env_var "FRONTEND_URL" "https://${PRIMARY}"
set_env_var "CORS_ORIGINS" "https://${PRIMARY},https://www.${PRIMARY}"

# --- Paso 2: firewall ------------------------------------------------------
if command -v ufw >/dev/null 2>&1; then
  echo "==> Abriendo puertos 80/443 en el firewall ..."
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi

# --- Paso 3: directorios ---------------------------------------------------
echo "==> Preparando directorios de certificados ..."
mkdir -p "${LE_DIR}" "${WEBROOT}"

# --- Paso 4: certificado temporal autofirmado ------------------------------
# Usamos el openssl del host (Debian lo trae) para no depender del entrypoint
# de la imagen certbot. Esto permite que Nginx levante su bloque 443.
echo "==> Creando certificado temporal autofirmado para que Nginx arranque ..."
mkdir -p "${LIVE_PATH}"
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "${LIVE_PATH}/privkey.pem" \
  -out "${LIVE_PATH}/fullchain.pem" \
  -subj "/CN=${PRIMARY}"

# --- Paso 5: aplicar .env nuevo y levantar/recrear Nginx -------------------
echo "==> Recreando backend (nuevo .env) y Nginx ..."
${COMPOSE} up -d app
${COMPOSE} up -d --force-recreate nginx
# Darle un momento a Nginx para que levante con el cert temporal.
sleep 5

# --- Paso 6: borrar temporal y pedir el certificado real -------------------
echo "==> Borrando certificado temporal ..."
rm -rf "${LE_DIR}/live/${PRIMARY}" \
  "${LE_DIR}/archive/${PRIMARY}" \
  "${LE_DIR}/renewal/${PRIMARY}.conf" 2>/dev/null || true

domain_args=""
for d in "${DOMAINS[@]}"; do domain_args="${domain_args} -d ${d}"; done
staging_arg=""
if [ "${STAGING}" != "0" ]; then
  staging_arg="--staging"
  echo "==> MODO STAGING (certificado de prueba, no válido en navegador)"
fi

echo "==> Solicitando certificado a Let's Encrypt para: ${DOMAINS[*]}"
docker run --rm \
  -v "${LE_DIR}:/etc/letsencrypt" \
  -v "${WEBROOT}:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
    ${staging_arg} \
    --email "${EMAIL}" \
    --agree-tos --no-eff-email \
    --force-renewal \
    ${domain_args}

# --- Paso 7: recargar Nginx con el certificado real ------------------------
echo "==> Recargando Nginx ..."
${COMPOSE} exec nginx nginx -s reload 2>/dev/null || ${COMPOSE} restart nginx

echo ""
if [ "${STAGING}" != "0" ]; then
  echo "✓ STAGING OK. Si no hubo errores, reejecuta SIN STAGING para el cert real:"
  echo "    sudo bash scripts/init-letsencrypt.sh"
else
  echo "✓ Certificado emitido. Prueba: https://${PRIMARY}/app/login"
fi
