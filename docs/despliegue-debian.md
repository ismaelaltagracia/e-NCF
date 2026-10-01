# Despliegue en servidor Debian con Docker — e-NCF

Guía paso a paso para desplegar la app completa (backend NestJS + SPA React + PostgreSQL + Redis + MinIO + backups) en un servidor Debian 11/12 con Docker.

El stack corre con `docker compose`. El backend sirve también el frontend compilado en `/app`, así que no hay que desplegar el cliente por separado.

---

## 0. Antes de empezar — qué necesitas a mano

- IP y acceso SSH al servidor Debian (root o usuario con sudo).
- Un dominio apuntando por DNS a la IP del servidor (registro A).
- El **certificado digital `.p12`** de la empresa (para emitir; se puede cargar después desde la app).
- El **XSD oficial de e-CF** de la DGII (opcional para arrancar; necesario para validación estricta).
- El CSV de RNC de contribuyentes (opcional; mejora la validación de RNC con respaldo local).

---

## 1. Subir el código al servidor

Tienes dos opciones.

### Opción A — con Git (recomendada)
En el servidor:
```bash
mkdir -p /opt/e-ncf && cd /opt/e-ncf
git clone <URL_DE_TU_REPO> .
```

### Opción B — copiar desde tu Mac con rsync
Desde tu máquina local (excluyendo lo pesado/innecesario):
```bash
rsync -avz \
  --exclude node_modules \
  --exclude client/node_modules \
  --exclude dist \
  --exclude .git \
  --exclude .env \
  /Users/mac/Documents/Aplicaciones/e-NCF/ root@TU_IP:/opt/e-ncf/
```

---

## 2. Despliegue automatizado (recomendado)

El repo trae `scripts/deploy-server.sh`, que instala Docker, Nginx, Certbot, firewall, genera el `.env` de producción con credenciales seguras y las URLs REST de la DGII, levanta el stack y configura HTTPS.

1. Edita las variables de la cabecera del script (en el servidor, `/opt/e-ncf/scripts/deploy-server.sh`):
   ```bash
   DOMINIO="tudominio.com"
   EMAIL_SSL="admin@tudominio.com"
   REPO_URL="<URL_DE_TU_REPO>"   # vacío si subiste por rsync
   SMTP_HOST="smtp.resend.com"
   SMTP_PASSWORD="re_xxxxx"
   SMTP_FROM="facturas@tudominio.com"
   ```
2. Ejecuta:
   ```bash
   bash /opt/e-ncf/scripts/deploy-server.sh
   ```
3. Al terminar, verifica: `https://tudominio.com/health` debe responder `status: up`.

> El script funciona en Debian (usa `apt`, `ufw`, `certbot`). Guarda las credenciales generadas en `/opt/e-ncf/.env` — respáldalas.

---

## 3. Despliegue manual (si prefieres control total)

```bash
# 3.1 Instalar Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 3.2 Firewall
apt install -y ufw
ufw default deny incoming && ufw default allow outgoing
ufw allow ssh && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

# 3.3 Preparar .env de producción
cd /opt/e-ncf
cp .env.example .env
nano .env   # ver sección 4
```

### 3.4 Generar secretos y claves JWT
```bash
cd /opt/e-ncf
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Valores para el .env:
openssl rand -hex 32   # ENCRYPTION_KEY (debe ser hex de 64 chars)
openssl rand -hex 24   # DB_PASSWORD
openssl rand -hex 16   # REDIS_PASSWORD
openssl rand -hex 24   # MINIO_SECRET_KEY
```

### 3.5 Levantar el stack
```bash
docker compose up -d --build
docker compose ps          # todos healthy
curl http://localhost:3000/health
```

### 3.6 Nginx + HTTPS
```bash
apt install -y nginx certbot python3-certbot-nginx
# Crear /etc/nginx/sites-available/encf con proxy_pass a http://localhost:3000
# (ver el bloque que genera deploy-server.sh)
certbot --nginx -d tudominio.com -d www.tudominio.com
```

---

## 4. Variables de entorno clave (`.env` de producción)

- `NODE_ENV=production` → activa migraciones (`migrationsRun`) y desactiva `synchronize`.
- `DGII_AMBIENTE=produccion` → el backend usa el segmento `eCF` de la DGII.
- `CORS_ORIGINS=https://tudominio.com`
- `ENCRYPTION_KEY` = **hex de 64 caracteres** (el arranque lo valida; si no cumple, no levanta).
- URLs DGII: ya vienen correctas en el `.env` que genera `deploy-server.sh` (bloque `eCF`). Si editas a mano, usa el bloque de producción comentado en `.env.example`.

---

## 5. Post-despliegue

### 5.1 Colocar el XSD oficial de la DGII (validación estricta)
```bash
# Copia el ecf.xsd oficial a /opt/e-ncf/xsd/ y reconstruye
scp ecf.xsd root@TU_IP:/opt/e-ncf/xsd/ecf.xsd
cd /opt/e-ncf && docker compose up -d --build app
```
Sin el XSD, el backend arranca igual y aplica la validación estructural por reglas (bloqueante).

### 5.2 Importar el padrón de RNC (respaldo local de validación)
Copia el CSV al servidor y cárgalo dentro del contenedor de Postgres:
```bash
# Copiar el CSV al contenedor
docker cp RNC_Contribuyentes.csv encf-postgres:/tmp/rnc.csv

# Importar (ajusta DB_* según tu .env)
docker exec -e PGPASSWORD="$DB_PASSWORD" encf-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "
TRUNCATE rnc_contribuyentes;
\copy rnc_contribuyentes(rnc, razon_social, actividad_economica, fecha_inicio_operaciones, estado, regimen_pago) FROM '/tmp/rnc.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',', ENCODING 'LATIN1');
"
```

### 5.3 Crear el Super Admin (primer acceso a la plataforma)
No hay registro de super admin por UI; se crea en la BD. Genera el hash bcrypt y el insert:
```bash
# Hash de la contraseña (ejecuta dentro del contenedor del backend, que tiene bcrypt)
docker exec encf-api node -e "console.log(require('bcrypt').hashSync('TuPasswordFuerte123!', 12))"

# Inserta el super admin (pega el hash obtenido)
docker exec -e PGPASSWORD="$DB_PASSWORD" encf-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "
INSERT INTO super_admins (id, email, password_hash, nombre, activo)
VALUES (gen_random_uuid(), 'superadmin@tudominio.com', '<HASH_BCRYPT>', 'Super Admin', true);
"
```

### 5.4 Cargar el certificado de la empresa
Desde la app web (recomendado): inicia sesión como admin de la empresa → **Configuración → Certificado** → sube el `.p12` con su contraseña. El certificado se cifra con AES-256-GCM antes de guardarse.

---

## 6. Persistencia de datos y configuración de producción

El `docker-compose.yml` base guarda los datos en **volúmenes nombrados** de Docker (`postgres_data`, `redis_data`, `minio_data`, `backup_data`). Estos **sobreviven** a `docker compose up --build`, `restart` y `stop`. La BD **solo** se perdería con `docker compose down -v` (la `-v` borra volúmenes) o `docker volume rm`.

Para producción se recomienda el override `docker-compose.prod.yml`, que mejora la persistencia y la seguridad:

- **Bind mounts a `/opt/e-ncf-data/`** (en vez de volúmenes anónimos): la base de datos, Redis y MinIO escriben en una ruta fija del host. Es explícito, fácil de respaldar y **no se borra con `down -v`**.
- **Postgres/Redis/MinIO cerrados a internet**: sin puertos publicados; solo accesibles por la red interna de Docker. Solo el backend se publica (en `127.0.0.1:3000`), y Nginx hace el proxy a HTTPS.
- **`restart: always`**, límite de memoria del backend y rotación de logs.

### Primer arranque en producción
```bash
# Crear los directorios de datos persistentes (una sola vez)
sudo mkdir -p /opt/e-ncf-data/{postgres,redis,minio,backups}

# Levantar con el override de producción
cd /opt/e-ncf
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

> Define un alias para no repetir los `-f` cada vez:
> ```bash
> echo "alias dce='docker compose -f /opt/e-ncf/docker-compose.yml -f /opt/e-ncf/docker-compose.prod.yml'" >> ~/.bashrc && source ~/.bashrc
> # Luego: dce ps / dce logs -f app / dce up -d --build
> ```

---

## 7. Estrategia recomendada para implementar cambios

### Flujo recomendado (rolling update sin perder datos)
```bash
cd /opt/e-ncf
git pull                                 # traer la nueva versión
dce up -d --build                        # rebuild solo lo cambiado; recrea contenedores
dce ps                                   # verificar healthy
curl -s http://localhost:3000/health     # verificar app
```
Esto reconstruye la imagen y recrea los contenedores. **Los datos persisten** porque viven en los bind mounts/volúmenes, no en los contenedores. Postgres aplica migraciones automáticamente al arrancar (`NODE_ENV=production`).

### Buenas prácticas antes de cada cambio
1. **Respaldar la BD antes de actualizar** (sobre todo si la actualización trae migraciones):
   ```bash
   docker exec encf-postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > /opt/e-ncf-data/backups/pre-deploy-$(date +%Y%m%d-%H%M).sql.gz
   ```
2. **Usar tags/releases en git** en vez de desplegar siempre `main`, para poder volver atrás (`git checkout vX.Y.Z`).
3. **Verificar salud tras el deploy** y revisar logs: `dce logs -f app`.
4. **Rollback**: si algo falla, `git checkout <tag-anterior> && dce up -d --build`. Si una migración corrompió datos, restaurar el dump previo.

### Qué NO hacer
- ❌ `docker compose down -v` en el servidor (borra los volúmenes y, por tanto, la BD).
- ❌ `docker system prune --volumes` sin revisar (puede borrar datos).
- ❌ Editar datos directamente en los contenedores sin respaldo.

### Entorno de staging (opcional, recomendado para cambios grandes)
Levanta una segunda copia en otro directorio/puerto con su propio `.env` y bind mounts separados (`/opt/e-ncf-staging-data/`), prueba allí la actualización y las migraciones, y solo entonces aplica a producción.

---

## 8. Operación diaria

```bash
cd /opt/e-ncf

# Estado y salud
dce ps
curl https://tudominio.com/health

# Logs del backend
dce logs -f app

# Backup manual de la BD
docker exec encf-postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > /opt/e-ncf-data/backups/backup-$(date +%Y%m%d).sql.gz

# Restaurar un backup
gunzip -c /opt/e-ncf-data/backups/backup-YYYYMMDD.sql.gz | docker exec -i encf-postgres psql -U "$DB_USER" -d "$DB_NAME"
```

Los backups automáticos ya están configurados (servicio `backup`, diario 2am, retención 30 días en `/opt/e-ncf-data/backups`).

### Diagnóstico del servidor
```bash
bash /opt/e-ncf/scripts/check-server.sh
```
Reporta OS, recursos, Docker, estado de contenedores, persistencia de datos, puertos expuestos y salud de la app. Útil para verificar que todo quedó bien y que Postgres/Redis/MinIO no están expuestos a internet.

---

## 7. Verificación final (checklist rápido)

- [ ] `https://tudominio.com/health` → `status: up` con las 3 dependencias `up`.
- [ ] `https://tudominio.com/app` carga la SPA.
- [ ] `https://tudominio.com/api/docs` muestra Swagger.
- [ ] Super admin puede iniciar sesión.
- [ ] HTTPS válido (candado), HTTP redirige a HTTPS.
- [ ] `docker compose ps` → todos `healthy`.
- [ ] Backup probado (dump + restore de prueba).

Para el paso a facturación real (certificación DGII, XSD, 15 escenarios), ver `docs/checklist-despliegue-produccion.md`.
