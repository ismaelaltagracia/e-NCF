# Despliegue automático (CI/CD) con GitHub Actions

Cada push/merge a la rama **`produccion`** dispara un despliegue automático en el servidor Debian: GitHub Actions se conecta por SSH, respalda la BD, hace `git pull`, reconstruye los contenedores y verifica la salud de la app.

El workflow está en `.github/workflows/deploy.yml`.

---

## Cómo funciona

```
push a rama "produccion"  ─▶  GitHub Actions  ─▶  SSH al servidor  ─▶
  backup BD → git reset --hard origin/produccion → docker compose up -d --build
  → docker image prune → verificar /health
```

- La rama `inicio` (desarrollo) **no** dispara despliegues.
- Si la app no responde `/health` tras el deploy, el job falla y verás los logs en Actions.
- Los datos (BD, Redis, MinIO) **persisten**: viven en los bind mounts `/opt/e-ncf-data`, no en los contenedores.

---

## Configuración (una sola vez)

### 1. Crear una clave SSH dedicada para el deploy (en tu Mac)
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/encf_cicd -N ""
```
Esto genera:
- `~/.ssh/encf_cicd`      → clave privada (va a GitHub Secrets)
- `~/.ssh/encf_cicd.pub`  → clave pública (va al servidor)

### 2. Autorizar la clave pública en el servidor
Copia el contenido de la clave pública al `authorized_keys` del usuario de despliegue del servidor:
```bash
# Desde tu Mac
ssh-copy-id -i ~/.ssh/encf_cicd.pub USUARIO@IP_SERVIDOR
# o manualmente: pega el contenido de encf_cicd.pub en ~/.ssh/authorized_keys del servidor
```
Prueba que entra sin pedir password:
```bash
ssh -i ~/.ssh/encf_cicd USUARIO@IP_SERVIDOR "echo conexion-ok"
```

### 3. Configurar los Secrets en GitHub
En el repo: **Settings → Secrets and variables → Actions → New repository secret**. Crea estos 4:

| Secret | Valor |
|--------|-------|
| `DEPLOY_HOST` | IP o dominio del servidor |
| `DEPLOY_USER` | usuario SSH (ej. `root` o tu usuario con permisos docker) |
| `DEPLOY_PORT` | puerto SSH (normalmente `22`) |
| `DEPLOY_SSH_KEY` | contenido COMPLETO de `~/.ssh/encf_cicd` (la clave PRIVADA, incluyendo las líneas BEGIN/END) |

```bash
# Para copiar la clave privada al portapapeles (Mac):
cat ~/.ssh/encf_cicd | pbcopy
```

> El usuario `DEPLOY_USER` debe poder ejecutar `docker` sin sudo. Si no, agrégalo al grupo docker en el servidor: `sudo usermod -aG docker USUARIO` (y reconecta la sesión).

### 4. Preparar el servidor (una sola vez)
El servidor debe tener el repo clonado en `/opt/e-ncf`, el `.env` de producción y las claves JWT. Si aún no:
```bash
# En el servidor
sudo mkdir -p /opt/e-ncf && sudo chown $USER:$USER /opt/e-ncf
git clone git@github.com:ismaelaltagracia/e-NCF.git /opt/e-ncf   # con deploy key de lectura
cd /opt/e-ncf
sudo mkdir -p /opt/e-ncf-data/{postgres,redis,minio,backups}
cp .env.example .env && nano .env     # NODE_ENV=production, DGII_AMBIENTE=produccion, claves...
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
# Primer arranque manual (los siguientes serán automáticos)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

> El `.env` y las `keys/` viven SOLO en el servidor (están en `.gitignore`), por lo que `git reset --hard` del deploy no los toca.

### 5. Crear la rama `produccion`
```bash
# En tu Mac
git checkout -b produccion
git push -u origin produccion
```

---

## Uso diario

```bash
# Desarrollas en inicio
git checkout inicio
# ... cambios ...
git commit -am "mis cambios" && git push origin inicio

# Cuando quieras desplegar a producción, fusiona a produccion:
git checkout produccion
git merge inicio
git push origin produccion     # ◀── esto dispara el despliegue automático
```

Verás el progreso en la pestaña **Actions** del repo. Si falla, el deploy se detiene y la versión anterior sigue corriendo.

---

## Rollback

Si una versión queda mal, revierte en git y vuelve a empujar:
```bash
git checkout produccion
git revert HEAD        # o: git reset --hard <commit-bueno>
git push origin produccion    # dispara deploy de la versión corregida
```
Si una migración dañó datos, restaura el backup pre-deploy del servidor:
```bash
# En el servidor, el backup automático pre-deploy está en:
ls -lt /opt/e-ncf-data/backups/pre-deploy-*.sql.gz | head
gunzip -c /opt/e-ncf-data/backups/pre-deploy-XXXX.sql.gz | docker exec -i encf-postgres psql -U "$DB_USER" -d "$DB_NAME"
```

---

## Notas de seguridad

- La clave privada de deploy vive solo en GitHub Secrets (cifrada) y nunca en el repo.
- Considera un usuario de deploy dedicado en el servidor (no root) con acceso a docker.
- El workflow solo corre en la rama `produccion`; nadie puede desplegar desde otra rama.
- Opcional: en GitHub, protege la rama `produccion` (Settings → Branches) para exigir PR y revisión antes de desplegar.
