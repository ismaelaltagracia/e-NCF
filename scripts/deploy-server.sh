#!/bin/bash
#
# e-NCF — Script de despliegue en servidor Ubuntu con Docker
#
# Uso:
#   1. Edita las variables de abajo con tu dominio e IP
#   2. Copia este script al servidor: scp deploy-server.sh root@TU_IP:/root/
#   3. Ejecuta en el servidor: bash /root/deploy-server.sh
#
# Requisitos:
#   - Ubuntu 22.04 o superior
#   - Acceso root
#   - Dominio apuntando al IP del servidor (DNS configurado)
#

set -e

# ═══════════════════════════════════════════
# CONFIGURA ESTOS VALORES
# ═══════════════════════════════════════════
DOMINIO="tudominio.com"
EMAIL_SSL="admin@tudominio.com"
REPO_URL=""  # Si usas git, pon la URL del repo aquí
SMTP_HOST=""
SMTP_PASSWORD=""
SMTP_FROM="facturas@tudominio.com"
# ═══════════════════════════════════════════

echo "═══════════════════════════════════════════"
echo "  e-NCF — Despliegue en producción"
echo "═══════════════════════════════════════════"
echo ""
echo "Dominio: $DOMINIO"
echo "Email SSL: $EMAIL_SSL"
echo ""

# ─── 1. Actualizar sistema ───
echo "▶ [1/8] Actualizando sistema..."
apt update -qq && apt upgrade -y -qq

# ─── 2. Instalar Docker ───
echo "▶ [2/8] Instalando Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    echo "  ✓ Docker instalado"
else
    echo "  ✓ Docker ya instalado"
fi

# ─── 3. Instalar Nginx + Certbot ───
echo "▶ [3/8] Instalando Nginx y Certbot..."
apt install -y -qq nginx certbot python3-certbot-nginx

# ─── 4. Firewall ───
echo "▶ [4/8] Configurando firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "  ✓ Firewall configurado (SSH + HTTP + HTTPS)"

# ─── 5. Descargar código ───
echo "▶ [5/8] Preparando código..."
mkdir -p /opt/e-ncf
cd /opt/e-ncf

if [ -n "$REPO_URL" ]; then
    if [ -d ".git" ]; then
        git pull
    else
        git clone "$REPO_URL" .
    fi
    echo "  ✓ Código descargado desde git"
else
    if [ ! -f "docker-compose.yml" ]; then
        echo "  ⚠ No hay repo configurado y no hay código en /opt/e-ncf"
        echo "  Sube el código manualmente con:"
        echo "    rsync -avz --exclude node_modules /ruta/local/ root@IP:/opt/e-ncf/"
        exit 1
    fi
    echo "  ✓ Código ya presente en /opt/e-ncf"
fi

# ─── 6. Generar .env y keys ───
echo "▶ [6/8] Configurando ambiente de producción..."

# Generar passwords seguros
DB_PASS=$(openssl rand -hex 24)
REDIS_PASS=$(openssl rand -hex 16)
MINIO_KEY=$(openssl rand -hex 16)
MINIO_SECRET=$(openssl rand -hex 24)
ENCRYPT_KEY=$(openssl rand -base64 32)

# Generar JWT keys si no existen
mkdir -p keys
if [ ! -f "keys/private.pem" ]; then
    openssl genrsa -out keys/private.pem 2048 2>/dev/null
    openssl rsa -in keys/private.pem -pubout -out keys/public.pem 2>/dev/null
    echo "  ✓ JWT keys generadas"
fi

# Crear .env
cat > .env << EOF
# ═══ Producción (generado por deploy-server.sh) ═══
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://$DOMINIO

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=encf_prod
DB_USER=encf_prod_user
DB_PASSWORD=$DB_PASS

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASS

# MinIO
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_ACCESS_KEY=$MINIO_KEY
MINIO_SECRET_KEY=$MINIO_SECRET
MINIO_BUCKET_XML=encf-xml
MINIO_BUCKET_PDF=encf-pdf
MINIO_USE_SSL=false
MINIO_PUBLIC_ENDPOINT=https://$DOMINIO/storage

# JWT
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_EXPIRES_IN=15m

# Encryption
ENCRYPTION_KEY=$ENCRYPT_KEY

# DGII
DGII_AMBIENTE=produccion
DGII_SEMILLA_URL=https://ecf.dgii.gov.do/ECF/WSCertificacion/CertECF.asmx
DGII_TOKEN_URL=https://ecf.dgii.gov.do/ECF/WSCertificacion/CertECF.asmx
DGII_ECF_URL=https://ecf.dgii.gov.do/ECF/EmisionCF
DGII_ESTADO_URL=https://ecf.dgii.gov.do/ECF/ConsultaEstado
DGII_STATUS_ENDPOINT=https://ecf.dgii.gov.do/ECF/ConsultaEstado
DGII_RNC_URL=https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx
DGII_POLLING_INTERVAL_MS=300000

# Email
SMTP_HOST=$SMTP_HOST
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=$SMTP_PASSWORD
SMTP_FROM=$SMTP_FROM

# Backup
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
EOF

echo "  ✓ .env generado con credenciales seguras"

# ─── 7. Docker deploy ───
echo "▶ [7/8] Desplegando con Docker..."
docker compose up -d --build

# Esperar a que los servicios estén healthy
echo "  Esperando servicios..."
sleep 15

# Verificar
if curl -sf http://localhost:3000/health > /dev/null; then
    echo "  ✓ API respondiendo correctamente"
else
    echo "  ⚠ API no responde. Revisa logs: docker compose logs encf-api"
fi

# ─── 8. Nginx + SSL ───
echo "▶ [8/8] Configurando Nginx + SSL..."

cat > /etc/nginx/sites-available/encf << NGINX
server {
    listen 80;
    server_name $DOMINIO www.$DOMINIO;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 10M;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/encf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Obtener SSL
if [ -n "$EMAIL_SSL" ] && [ "$DOMINIO" != "tudominio.com" ]; then
    certbot --nginx -d "$DOMINIO" -d "www.$DOMINIO" --non-interactive --agree-tos -m "$EMAIL_SSL"
    echo "  ✓ SSL configurado con Let's Encrypt"
else
    echo "  ⚠ SSL no configurado (dominio por defecto). Ejecuta manualmente:"
    echo "    certbot --nginx -d $DOMINIO -d www.$DOMINIO"
fi

# ─── Resumen ───
echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ DESPLIEGUE COMPLETADO"
echo "═══════════════════════════════════════════"
echo ""
echo "  URL:  https://$DOMINIO"
echo "  API:  https://$DOMINIO/health"
echo ""
echo "  Credenciales guardadas en: /opt/e-ncf/.env"
echo ""
echo "  Comandos útiles:"
echo "    docker compose logs -f encf-api   # Ver logs"
echo "    docker compose ps                 # Estado de servicios"
echo "    docker compose up --build -d      # Actualizar"
echo ""
echo "═══════════════════════════════════════════"
