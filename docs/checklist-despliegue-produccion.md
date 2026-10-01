# Checklist de Despliegue a Producción — e-NCF

> Estado consolidado tras las Fases 0, 1 y 2. Este documento reúne lo que ya está resuelto en código y lo que falta (operativo) para emitir facturas fiscales reales ante la DGII.

Última actualización: 23 sep 2026

---

## 1. Resumen de estado

| Área | Estado |
|------|--------|
| Fase 0 — Bloqueantes de emisión | ✅ Completa |
| Fase 1 — Conformidad DGII (ACECF, RFCE, RNC, tipos) | ✅ Completa |
| Protocolo DGII REST + multipart (semilla/token/envío) | ✅ Corregido y verificado |
| Fase 2 — Robustez (rate limit, lockout, RLS) | ✅ Completa (RLS como andamiaje) |
| Build de producción | ✅ Limpio |
| Suite de tests | ✅ 46 suites / 470 tests verdes |
| **Certificación DGII (15 escenarios)** | ⏳ Pendiente (requiere certificado real) |

---

## 2. Ya resuelto en código

- **Emisión e-CF**: conversión JSON→XML con multi-tasa ITBIS (I1/I2/I3 + exento), firma XAdES-BES, código de seguridad correcto (6 primeros chars del SignatureValue), transmisión REST multipart, cola de reintentos funcional.
- **RFCE**: resumen para E32 bajo RD$250,000 (host `fc.dgii.gov.do`).
- **Aprobación Comercial (ACECF)** y **Anulación**: generan, firman y transmiten a la DGII.
- **Autenticación DGII**: GET semilla → firma → POST multipart validarsemilla → token JSON (con caché en Redis y re-handshake ante 401).
- **QR del PDF**: URL correcta por ambiente y tipo (e-CF vs consumo), con código de seguridad y fecha.
- **Validación RNC**: web service DGII con fallback a CSV local.
- **Seguridad**: JWT RS256, refresh tokens rotados, cifrado AES-256-GCM del certificado y su contraseña, lockout de usuarios y super_admin, rate limit con degradación controlada, helmet + CORS, validación de env al arranque, `synchronize` off en prod.
- **Tipos de comprobante**: E31–E47 alineados (enum + migración).

---

## 3. Pendiente antes de certificar (BLOQUEANTE)

### 3.1 Certificado digital y credenciales
- [ ] Obtener el certificado `.p12` de producción de la empresa emisora (DigiFirma / Cámara de Comercio).
- [ ] Cargarlo en la plataforma (Configuración → Certificado) y verificar que el RNC del cert coincide con el de la empresa.

### 3.2 XSD oficial de la DGII
- [ ] Descargar los XSD oficiales del e-CF del portal DGII (Documentación Técnica → XSD).
- [ ] Colocar el XSD principal en `xsd/ecf.xsd` (ver `xsd/README.md`).
- [ ] Reconstruir la imagen para que quede incluido en `/app/xsd/`.

### 3.3 Reconfirmar endpoints y esquemas contra el ambiente real
- [ ] Verificar las rutas exactas contra el Swagger/`help` de TesteCF:
  - `https://ecf.dgii.gov.do/testecf/autenticacion/help/index.html`
  - `.../recepcion/help`, `.../aprobacioncomercial/help`, `.../consultaresultado/help`
- [ ] Confirmar la estructura exacta del XML de ACECF y del RFCE contra los formatos oficiales.

### 3.4 Certificación (15 escenarios en TesteCF)
- [ ] Registrar las secuencias NCF de prueba asignadas por la DGII.
- [ ] Ejecutar los 15 escenarios (E31, E32, E33, E34, E41, E43–E45, anulación, consulta estado, aprobación comercial, consulta rangos).
- [ ] Guardar evidencia de las 15 pruebas aprobadas.
- [ ] Enviar la solicitud formal de producción a la DGII y esperar autorización.

---

## 4. Infraestructura de producción

### 4.1 Servidor y despliegue
- [ ] Provisionar servidor (mín. 2 vCPU / 4 GB; ver `docs/pase-a-produccion.md`).
- [ ] Instalar Docker; clonar repo; configurar `.env` de producción.
- [ ] `docker compose up -d` y verificar `curl https://<dominio>/health`.

### 4.2 Variables de entorno de producción
- [ ] `NODE_ENV=production` (activa migraciones y desactiva `synchronize`).
- [ ] `DGII_AMBIENTE=produccion` y descomentar el bloque de URLs `eCF` en `.env`.
- [ ] Generar `ENCRYPTION_KEY` nueva (32 bytes hex), claves JWT nuevas, contraseñas fuertes de DB/Redis/MinIO.
- [ ] `CORS_ORIGINS` con el dominio real.
- [ ] SMTP real (Resend/Brevo/SES).

### 4.3 Seguridad de red
- [ ] HTTPS con Nginx + Let's Encrypt.
- [ ] Firewall: exponer solo 80/443 y SSH; Postgres/Redis/MinIO solo en red interna.
- [ ] Confirmar que `keys/*.pem` y `.env` NO están versionados en git.

### 4.4 Observabilidad y respaldo
- [ ] Sentry (errores) y UptimeRobot (health cada 5 min).
- [ ] Verificar backups de Postgres (dump + restore de prueba).

---

## 5. Opcional / Fase 3 (endurecimiento adicional)

### 5.1 RLS estricto (multi-tenant a nivel de BD)
El andamiaje de RLS ya está en el código (migración `1700000000003` + `TenantContextService`), pero **no filtra todavía** porque la app se conecta con el rol dueño de las tablas. Para activarlo como defensa real:
- [ ] Crear un rol de aplicación PostgreSQL SIN ser dueño de las tablas (sin BYPASSRLS) y conectar la app con ese rol; o aplicar `FORCE ROW LEVEL SECURITY`.
- [ ] Adoptar el patrón transaccional por request con `TenantContextService.runWithTenant()` en los servicios que acceden a datos por tenant.
- [ ] Endurecer la política quitando la cláusula de compatibilidad (`current_setting(...) = ''`).

### 5.2 Otros
- [ ] Reemplazar el parseo por regex de semilla/token/track_id por un parser XML estricto.
- [ ] Métricas de negocio (facturas emitidas, tasa de rechazo DGII).
- [ ] Pruebas de carga del endpoint de emisión.

---

## 6. Comandos útiles

```bash
# Verificar salud
curl https://<dominio>/health

# Ver logs del backend
docker compose logs -f app

# Aplicar cambios
git pull && docker compose up --build -d

# Backup manual de la BD
docker exec encf-postgres pg_dump -U <user> <db> | gzip > backup-$(date +%Y%m%d).sql.gz
```

---

## 7. Criterio de "listo para emitir facturas reales"

Se puede emitir producción cuando **todos** estos se cumplan:
1. Certificación DGII aprobada (15/15) y autorización recibida.
2. XSD oficial colocado y validación activa.
3. Servidor con HTTPS, `.env` de producción con claves nuevas, `DGII_AMBIENTE=produccion`.
4. Primera factura real emitida y verificada en el portal de la DGII (escaneando el QR).
5. Backups y monitoreo activos.
