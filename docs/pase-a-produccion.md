# Pase a Producción — e-NCF

> Checklist completo para llevar la plataforma de desarrollo a producción.

---

## Estado actual del desarrollo

| Componente | Estado |
|------------|--------|
| Backend NestJS (API completa) | ✅ Completo |
| Frontend React (portal web) | ✅ Completo |
| App móvil Flutter (iOS + Android) | ✅ Completo |
| Print Bridge (middleware impresora) | ✅ Completo |
| Landing page de marketing | ✅ Completo |
| Email con PDF adjunto | ✅ Completo |
| Carga masiva de facturas | ✅ Completo |
| Modo contingencia | ✅ Completo |
| Reportes 606/607/608 | ✅ Completo |
| Circuit breaker + retry queue | ✅ Completo |
| Certificación en TesteCF | ✅ Completo |

---

## Fase 1: Bloqueantes (sin esto no se puede lanzar)

### 1.1 Certificación DGII para producción

**Qué es:** La DGII debe aprobar formalmente tu sistema para emitir facturas electrónicas reales (ambiente de producción).

**Proceso:**
1. Completar las 15 pruebas de certificación en ambiente TesteCF
2. Enviar solicitud formal a la DGII con evidencia de pruebas aprobadas
3. La DGII revisa y emite la autorización
4. Te asignan credenciales de producción (endpoints reales)

**Documentos necesarios:**
- Reporte de pruebas completadas (15 escenarios)
- Carta de solicitud dirigida a la Gerencia de Facturación Electrónica
- Copia del RNC de la empresa operadora del sistema
- Descripción técnica del sistema

**Tiempo estimado:** 2-4 semanas (depende de la DGII)

**Contacto:** facturacionelectronica@dgii.gov.do

**Acción inmediata:** Iniciar este proceso HOY. Es el paso más lento.

---

### 1.2 Servidor de producción

**Requerimientos mínimos:**

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco | 40 GB SSD | 80 GB SSD |
| Ancho de banda | 2 TB/mes | 4 TB/mes |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

**Opciones recomendadas:**

| Proveedor | Plan | Precio mensual | Notas |
|-----------|------|---------------|-------|
| DigitalOcean | Droplet 4GB | US$24/mes | Datacenter NYC, buena latencia a RD |
| Hetzner | CPX21 | €5.29/mes (~US$6) | Excelente relación precio/rendimiento |
| AWS Lightsail | 4GB | US$20/mes | Ecosistema AWS completo |
| Contabo | VPS M | US$7/mes | Mucho storage barato |

**Recomendación:** Hetzner CPX21 para arrancar (barato, confiable). Migrar a DigitalOcean o AWS cuando el tráfico crezca.

**Acción:**
```bash
# Instalar Docker en el servidor
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Clonar repo y desplegar
git clone <tu-repo> /opt/e-ncf
cd /opt/e-ncf
cp .env.example .env
# Editar .env con valores de producción
docker compose up -d
```

---

### 1.3 Dominio + HTTPS

**Dominio sugerido:** `facturedo.do` o `encf.do` (dominio .do = RD$2,500/año en NIC.do)

**Alternativa más barata:** `encf.app` o `facturedo.com` (~US$12/año)

**Configuración HTTPS:**
```bash
# Instalar Certbot (Let's Encrypt gratuito)
sudo apt install certbot

# Configurar Nginx como reverse proxy
sudo apt install nginx

# Obtener certificado SSL
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
```

**Configuración Nginx mínima** (`/etc/nginx/sites-available/encf`):
```nginx
server {
    listen 443 ssl;
    server_name tudominio.com;

    ssl_certificate /etc/letsencrypt/live/tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tudominio.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name tudominio.com;
    return 301 https://$host$request_uri;
}
```

---

### 1.4 SMTP para emails reales

**Opciones:**

| Proveedor | Gratis hasta | Precio después | Setup |
|-----------|-------------|---------------|-------|
| Resend | 3,000 emails/mes | US$20/mes (50K) | API Key, 2 min |
| Brevo (Sendinblue) | 300 emails/día | US$9/mes (20K) | SMTP credentials |
| Amazon SES | 62,000/mes (con EC2) | US$0.10/1000 | Configuración IAM |
| Gmail SMTP | 500/día | N/A | No recomendado para producción |

**Recomendación:** Resend (moderno, API simple, plan gratis generoso).

**Variables en `.env` producción:**
```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=re_xxxxxxxxxxxx
SMTP_FROM=Facturación <facturas@tudominio.com>
```

---

### 1.5 Variables de entorno de producción

Crear archivo `.env` en el servidor con estos valores:

```env
# ===========================
# Producción
# ===========================
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://tudominio.com

# ===========================
# Database
# ===========================
DB_HOST=postgres
DB_PORT=5432
DB_NAME=encf_prod
DB_USER=encf_prod_user
DB_PASSWORD=<contraseña-fuerte-generada>

# ===========================
# Redis
# ===========================
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<contraseña-fuerte-generada>

# ===========================
# MinIO / S3
# ===========================
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=<key-fuerte-generada>
MINIO_SECRET_KEY=<secret-fuerte-generada>
MINIO_BUCKET_XML=encf-xml
MINIO_BUCKET_PDF=encf-pdf
MINIO_USE_SSL=false
MINIO_PUBLIC_ENDPOINT=https://tudominio.com/storage

# ===========================
# JWT (generar nuevas keys para producción)
# ===========================
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_EXPIRES_IN=15m

# ===========================
# Encryption (generar nueva key de 256 bits)
# ===========================
ENCRYPTION_KEY=<base64-de-32-bytes-aleatorios>

# ===========================
# DGII PRODUCCIÓN
# ===========================
DGII_AMBIENTE=produccion
DGII_SEMILLA_URL=https://ecf.dgii.gov.do/ECF/WSCertificacion/CertECF.asmx
DGII_TOKEN_URL=https://ecf.dgii.gov.do/ECF/WSCertificacion/CertECF.asmx
DGII_ECF_URL=https://ecf.dgii.gov.do/ECF/EmisionCF
DGII_ESTADO_URL=https://ecf.dgii.gov.do/ECF/ConsultaEstado
DGII_STATUS_ENDPOINT=https://ecf.dgii.gov.do/ECF/ConsultaEstado
DGII_RNC_URL=https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx
DGII_POLLING_INTERVAL_MS=300000

# ===========================
# Email / SMTP
# ===========================
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=re_xxxxxxxxxxxx
SMTP_FROM=Facturación <facturas@tudominio.com>

# ===========================
# Backup
# ===========================
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
```

**Generar keys seguras:**
```bash
# Generar key de encriptación (32 bytes aleatorios en base64)
openssl rand -base64 32

# Generar par de keys JWT (RS256)
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Generar contraseñas seguras
openssl rand -hex 24
```

---

## Fase 2: Antes del primer cliente

### 2.1 Monitoreo de errores (Sentry)

```bash
# Instalar en el proyecto
cd /opt/e-ncf
npm install @sentry/nestjs

# Agregar a .env
SENTRY_DSN=https://xxxx@o123.ingest.sentry.io/456
```

**Setup:** Crear cuenta gratis en sentry.io → nuevo proyecto Node.js → copiar DSN.

---

### 2.2 Monitoreo de uptime (UptimeRobot)

1. Crear cuenta gratis en uptimerobot.com
2. Agregar monitor HTTP(s): `https://tudominio.com/health`
3. Configurar alertas: email + Telegram/WhatsApp
4. Intervalo: cada 5 minutos

---

### 2.3 Verificar backups

```bash
# Probar que el backup funciona
docker exec encf-postgres pg_dump -U encf_prod_user encf_prod > /tmp/test-backup.sql

# Verificar que se puede restaurar
docker exec -i encf-postgres psql -U encf_prod_user -d encf_test < /tmp/test-backup.sql
```

---

### 2.4 Firewall

```bash
# Solo abrir puertos necesarios
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

MinIO, Redis y PostgreSQL NUNCA deben estar expuestos a internet (solo accesibles via Docker network).

---

## Fase 3: Lanzamiento público

### 3.1 Términos de servicio

Necesitas antes de cobrar:
- Términos y condiciones de uso
- Política de privacidad
- Política de datos (RGPD / Ley 172-13 de RD)

**Acción:** Contratar un abogado o usar plantilla adaptada (hay generadores online para SaaS).

---

### 3.2 Pasarela de pago

Para cobrar los planes mensuales:

| Opción | Funciona en RD | Comisión | Setup |
|--------|---------------|----------|-------|
| Stripe | ✅ (desde 2023) | 2.9% + $0.30 | API, 1 día |
| PayPal | ✅ | 3.49% + $0.49 | Botones, rápido |
| Cardnet (local) | ✅ | ~3.5% | Contrato, 1-2 semanas |
| Transferencia bancaria | ✅ | 0% | Manual, no escala |

**Recomendación:** Arrancar con transferencia bancaria (primer mes gratis, cobro manual). Integrar Stripe cuando tengas 30+ clientes pagos.

---

### 3.3 Publicar app móvil

**iOS (App Store):**
- Apple Developer Account: US$99/año
- Build: `flutter build ios --release`
- Subir via Xcode → App Store Connect
- Review: 1-3 días

**Android (Play Store):**
- Google Play Console: US$25 (una vez)
- Build: `flutter build appbundle --release`
- Subir APK/AAB a Play Console
- Review: 1-2 días

---

## Cronograma de pase a producción

| Día | Tarea | Resultado |
|-----|-------|-----------|
| **Día 1** | Iniciar proceso certificación DGII | Solicitud enviada |
| **Día 1** | Contratar servidor + dominio | Infraestructura lista |
| **Día 2** | Configurar Nginx + HTTPS + SMTP | App accesible por HTTPS |
| **Día 2** | Deploy con Docker + .env producción | App corriendo |
| **Día 3** | Sentry + UptimeRobot + verificar backups | Monitoreo activo |
| **Día 3** | Probar flujo completo en producción (TesteCF) | Validar todo funciona |
| **Semana 2-4** | Esperar aprobación DGII | — |
| **Post-aprobación** | Cambiar a `DGII_AMBIENTE=produccion` | Facturas reales |
| **Post-aprobación** | Beta con 10 empresas (contadores aliados) | Feedback |
| **+1 semana** | Ajustes según feedback | — |
| **Lanzamiento** | Activar landing + marketing | Público |

---

## Comandos de deploy en producción

```bash
# Deploy inicial
ssh root@tu-servidor
git clone <repo> /opt/e-ncf
cd /opt/e-ncf
cp .env.example .env
nano .env  # configurar valores de producción
docker compose up -d

# Verificar que todo está corriendo
docker compose ps
curl https://tudominio.com/health

# Ver logs
docker compose logs -f encf-api

# Actualizar (cuando hay cambios)
cd /opt/e-ncf
git pull
docker compose up --build -d

# Backup manual
docker exec encf-postgres pg_dump -U encf_prod_user encf_prod | gzip > backup-$(date +%Y%m%d).sql.gz
```

---

## Checklist final antes de anunciar

- [ ] Certificación DGII aprobada
- [ ] Servidor corriendo con HTTPS
- [ ] Email funciona (probar envío real)
- [ ] Backup probado (restore exitoso)
- [ ] Sentry capturando errores
- [ ] UptimeRobot alertando
- [ ] Firewall configurado
- [ ] Crear primera factura real y verificar en DGII
- [ ] Términos de servicio publicados
- [ ] Landing page accesible
- [ ] Al menos 1 contador aliado listo para referir
