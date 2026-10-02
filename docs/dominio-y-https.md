# Dominio e-mitte.com + HTTPS (Nginx + Let's Encrypt)

Guía para servir la aplicación en `https://e-mitte.com` con certificado SSL
gratuito y renovación automática, sin afectar el correo (Titan/GoDaddy).

## Arquitectura

```
Internet ──▶ Nginx (contenedor, puertos 80/443) ──▶ app (NestJS, :3000 interno)
                 │
                 └── certbot (contenedor) renueva el certificado cada 12h
```

- El backend ya **no** se expone a internet; Nginx es el único punto de entrada.
- Postgres/Redis/MinIO siguen cerrados (solo red interna de Docker).
- Certificados y challenge viven en bind mounts persistentes bajo `/opt/e-ncf-data`.

## Requisitos previos

1. DNS de GoDaddy ya configurado (registro **A** `@` → IP del servidor; `www` es
   CNAME a `e-mitte.com`). **No se tocan** los registros MX ni los TXT/CNAME del
   correo (DKIM, `email`, SPF): el correo sigue funcionando.
2. Verifica que el dominio ya resuelve al servidor antes de emitir el certificado:
   ```bash
   dig +short e-mitte.com        # debe devolver la IP del servidor
   dig +short www.e-mitte.com
   ```
3. Firewall: abre 80 y 443.
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

## Pasos de despliegue (en el servidor)

```bash
cd /opt/e-ncf

# 1. Traer esta rama (o ya mergeada a produccion vía CI/CD)
git pull

# 2. Crear el directorio de datos para certificados/challenge
sudo mkdir -p /opt/e-ncf-data/{letsencrypt,certbot-www}

# 3. Ajustar el .env de producción
#    FRONTEND_URL=https://e-mitte.com
#    CORS_ORIGINS=https://e-mitte.com,https://www.e-mitte.com
nano .env

# 4. Levantar el stack (app + dependencias; nginx se levanta en el paso 5)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 5. Emitir el certificado SSL inicial (una sola vez)
#    Edita EMAIL dentro del script si quieres recibir avisos de expiración.
sudo bash scripts/init-letsencrypt.sh
```

Al terminar, la app queda en **https://e-mitte.com**. La renovación es automática
(servicio `certbot`), y Nginx recarga cada 6h para tomar el certificado renovado.

## Verificación

```bash
curl -I https://e-mitte.com                 # 200/301, cabeceras TLS
curl -s https://e-mitte.com/health | head   # estado del backend
```
Abre `https://e-mitte.com/app/login` en el navegador y confirma el candado válido.

## Notas

- **Primer intento con STAGING**: si quieres probar sin consumir la cuota de
  Let's Encrypt (5 certs/semana por dominio), pon `STAGING=1` dentro de
  `scripts/init-letsencrypt.sh`, ejecútalo, verifica, y luego vuelve a `STAGING=0`
  y reejecútalo para el certificado real.
- **Correo**: este cambio no toca MX/DKIM/SPF. El correo Titan sigue intacto.
- **Enlaces de recuperación de contraseña**: con `FRONTEND_URL=https://e-mitte.com`
  el email de reset enlazará a `https://e-mitte.com/app/reset-password?token=...`.
- **Cerrar el 3000**: en producción el backend ya no publica 3000. Si tenías una
  regla de firewall abriéndolo, puedes cerrarla: `sudo ufw delete allow 3000/tcp`.
