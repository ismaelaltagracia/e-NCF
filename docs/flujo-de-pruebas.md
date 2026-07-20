# Flujo de Pruebas — e-NCF API Gateway

## Requisitos Previos

- Docker Compose levantado: `docker compose up -d`
- Health check OK: `GET http://localhost:3000/health` → status "up"
- Buckets MinIO creados: `encf-xml`, `encf-pdf`

---

## Flujo 1: Onboarding Completo (SPA + API)

### Paso 1 — Registro de Empresa

**Desde la app:** `http://localhost:3000/app/registro`

| Campo | Valor de prueba |
|-------|-----------------|
| Nombre de Empresa | Mi PYME SRL |
| RNC | 123456789 |
| Nombre del Administrador | Juan Pérez |
| Correo Electrónico | admin@mipyme.com |
| Contraseña | Admin123! |

**Equivalente API:**
```
POST /api/v1/onboarding/registro
Content-Type: application/json

{
  "empresa_nombre": "Mi PYME SRL",
  "rnc": "123456789",
  "admin_nombre": "Juan Pérez",
  "email": "admin@mipyme.com",
  "password": "Admin123!"
}
```

**Respuesta esperada:** `201 Created`
```json
{
  "empresa_id": "uuid",
  "usuario_id": "uuid"
}
```

**Validaciones a verificar:**
- [ ] RNC duplicado → 409 Conflict
- [ ] Email duplicado → 409 Conflict
- [ ] Contraseña sin mayúscula → 400 Bad Request
- [ ] RNC con longitud inválida → 400 Bad Request

---

### Paso 2 — Login

**Desde la app:** `http://localhost:3000/app/login`

| Campo | Valor |
|-------|-------|
| Email | admin@mipyme.com |
| Contraseña | Admin123! |

**Equivalente API:**
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@mipyme.com",
  "password": "Admin123!"
}
```

**Respuesta esperada:** `200 OK`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "uuid",
  "expires_in": 900,
  "token_type": "Bearer"
}
```

**Validaciones a verificar:**
- [ ] Credenciales incorrectas → 401 Unauthorized
- [ ] Empresa inactiva → 403 Forbidden
- [ ] 5 intentos fallidos → 429 Too Many Requests (bloqueo 15 min)

---

### Paso 3 — Subir Certificado Digital

**Desde la app:** Paso automático tras registro (si el token está disponible)

**API:**
```
POST /api/v1/empresas/me/certificado
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

certificado: [archivo .p12 o .pfx, max 10MB]
password: contraseña_del_certificado
```

**Respuesta esperada:** `200 OK`
```json
{
  "message": "Certificado cargado exitosamente",
  "estado": "activo"
}
```

**Validaciones a verificar:**
- [ ] Archivo no .p12/.pfx → 400 Bad Request
- [ ] Archivo > 10MB → 400 Bad Request
- [ ] Certificado expirado → 400 Bad Request
- [ ] RNC del certificado no coincide → 400 Bad Request
- [ ] Solo rol admin puede subir → 403 Forbidden

> **Nota:** Tras este paso, la empresa pasa a estado "activo" y tiene acceso completo al sistema.

---

## Flujo 2: Gestión de Catálogo

### Paso 4 — Crear Producto/Servicio

**Desde la app:** `http://localhost:3000/app/catalogo` → botón "Agregar"

**API:**
```
POST /api/v1/catalogo
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "tipo": "servicio",
  "codigo": "SRV-001",
  "descripcion": "Consultoría técnica",
  "precio_unitario": 5000.00,
  "tasa_itbis": 18
}
```

**Respuesta esperada:** `201 Created`
```json
{
  "id": "uuid",
  "tipo": "servicio",
  "codigo": "SRV-001",
  "descripcion": "Consultoría técnica",
  "precio_unitario": "5000.00",
  "tasa_itbis": 18,
  "activo": true
}
```

**Validaciones a verificar:**
- [ ] tasa_itbis no en [0, 16, 18] → 400
- [ ] precio_unitario negativo → 400
- [ ] Rol "lector" no puede crear → 403

### Paso 5 — Buscar en Catálogo

**API:**
```
GET /api/v1/catalogo?search=consul&tipo=servicio
Authorization: Bearer {access_token}
```

**Validaciones:**
- [ ] Búsqueda case-insensitive funciona
- [ ] Solo muestra ítems de la empresa autenticada (multi-tenencia)

---

## Flujo 3: Configurar Secuencias NCF

### Paso 6 — Crear Secuencia

**API:**
```
POST /api/v1/secuencias-ncf
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "tipo_comprobante": "E31",
  "prefijo": "E31",
  "numero_inicio": 1,
  "numero_fin": 1000,
  "numero_actual": 1
}
```

**Respuesta esperada:** `201 Created`

**Validaciones:**
- [ ] Solo admin puede crear → 403 para facturador/lector
- [ ] Secuencia duplicada (mismo tipo + prefijo) → 409 Conflict

### Paso 7 — Consultar Estado de Secuencias

**API:**
```
GET /api/v1/secuencias-ncf/estado
Authorization: Bearer {access_token}
```

**Respuesta esperada:** Muestra capacidad restante y warning al 90%.

---

## Flujo 4: Emisión de Factura Electrónica

### Paso 8 — Crear Factura

**Desde la app:** `http://localhost:3000/app/facturas` → formulario de emisión

**API:**
```
POST /api/v1/facturas
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "rnc_emisor": "123456789",
  "rnc_receptor": "101234567",
  "nombre_receptor": "Cliente Ejemplo SRL",
  "tipo_comprobante": "E31",
  "items": [
    {
      "descripcion": "Consultoría técnica",
      "cantidad": 2,
      "precio_unitario": 5000.00,
      "tasa_itbis": 18
    },
    {
      "descripcion": "Soporte mensual",
      "cantidad": 1,
      "precio_unitario": 3000.00,
      "tasa_itbis": 18
    }
  ],
  "subtotal": 13000.00,
  "total_itbis": 2340.00,
  "monto_total": 15340.00
}
```

**Respuesta esperada:** `201 Created`
```json
{
  "id": "uuid",
  "e_ncf": "E3100000001",
  "track_id": "...",
  "estado_dgii": "enviado"
}
```

**Flujo interno del sistema:**
1. Validar payload (Zod)
2. Verificar límite mensual del plan
3. Asignar e-NCF desde secuencia (SELECT FOR UPDATE)
4. Crear registro en DB
5. Convertir JSON → XML conforme XSD
6. Firmar XML con XAdES-BES (certificado PKCS12)
7. Subir XML firmado a MinIO
8. Transmitir a DGII via Circuit Breaker
9. Si DGII acepta → guardar track_id, encolar PDF
10. Si error transitorio → encolar en BullMQ (reintento con backoff)

**Validaciones a verificar:**
- [ ] Items vacío → 400
- [ ] RNC emisor no coincide con empresa → 400
- [ ] Aritmética incorrecta (total ≠ subtotal + itbis) → 400
- [ ] Límite mensual alcanzado → 402 Payment Required
- [ ] Secuencia agotada → 409 Conflict
- [ ] Modo manual sin e_ncf → 400
- [ ] Rol lector no puede crear → 403

---

### Paso 9 — Listar Facturas

**API:**
```
GET /api/v1/facturas?page=1&limit=10
Authorization: Bearer {access_token}
```

**Validaciones:**
- [ ] Solo muestra facturas de la empresa autenticada
- [ ] Paginación funciona correctamente

### Paso 10 — Consultar Estado DGII

**API:**
```
GET /api/v1/facturas/{factura_id}/estado
Authorization: Bearer {access_token}
```

**Respuesta:** Estado actual de la factura en la DGII.

### Paso 11 — Descargar PDF

**API:**
```
GET /api/v1/facturas/{factura_id}/pdf
Authorization: Bearer {access_token}
```

**Respuesta esperada:** `200 OK`
```json
{
  "url": "https://minio:9000/encf-pdf/...",
  "expires_at": "2026-07-18T..."
}
```

**Validaciones:**
- [ ] Factura de otra empresa → 403
- [ ] PDF no generado aún → 404

---

## Flujo 5: Gestión de Usuarios

### Paso 12 — Crear Usuario (rol facturador)

**API:**
```
POST /api/v1/usuarios
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "nombre": "Maria Facturadora",
  "email": "maria@mipyme.com",
  "password": "Maria123!",
  "rol": "facturador"
}
```

**Validaciones:**
- [ ] Solo admin puede crear → 403
- [ ] Email duplicado → 409
- [ ] Rol inválido → 400

### Paso 13 — Desactivar Usuario

**API:**
```
PATCH /api/v1/usuarios/{usuario_id}
Authorization: Bearer {access_token}
Content-Type: application/json

{ "activo": false }
```

**Validaciones:**
- [ ] Desactivar último admin → 409 Conflict
- [ ] Tokens revocados tras desactivación

---

## Flujo 6: API Keys

### Paso 14 — Crear API Key

**API:**
```
POST /api/v1/api-keys
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "nombre": "produccion-erp",
  "scopes": ["facturas:write", "facturas:read", "pdf:read"]
}
```

**Respuesta:** `201 Created` — incluye `key` en texto plano (única vez).

### Paso 15 — Usar API Key

**API:**
```
POST /api/v1/facturas
X-API-Key: {api_key_en_texto_plano}
Content-Type: application/json

{ ... payload de factura ... }
```

**Validaciones:**
- [ ] Scope insuficiente → 403
- [ ] API Key revocada → 401
- [ ] Rate limit 1000/min → 429

---

## Flujo 7: Webhooks

### Paso 16 — Configurar Webhook

**API:**
```
POST /api/v1/webhooks
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "url": "https://mi-erp.com/webhooks/encf",
  "eventos": ["factura_aceptada", "factura_rechazada"],
  "secret": "mi-secreto-hmac-123"
}
```

**Validaciones:**
- [ ] URL debe ser HTTPS
- [ ] Eventos deben ser válidos
- [ ] Test webhook: `POST /api/v1/webhooks/{id}/test`
- [ ] Auto-desactivación tras 10 fallos consecutivos

---

## Flujo 8: Anulación de e-CF

### Paso 17 — Anular Factura

**API:**
```
POST /api/v1/facturas/{factura_id}/anular
Authorization: Bearer {access_token}
```

**Validaciones:**
- [ ] Solo admin puede anular → 403
- [ ] Solo facturas con estado "aprobado" → 400
- [ ] e-NCF no se libera (consumido permanentemente)
- [ ] Registro de auditoría creado

---

## Flujo 9: Auditoría

### Paso 18 — Consultar Auditoría

**API:**
```
GET /api/v1/auditoria?accion=factura_enviada&page=1&limit=20
Authorization: Bearer {access_token}
```

**Validaciones:**
- [ ] Solo admin puede consultar → 403
- [ ] Filtros por acción, fecha, usuario funcionan
- [ ] Registros no pueden ser modificados ni eliminados

---

## Flujo 10: Admin (Super Admin)

### Paso 19 — Login como Super Admin

**API:**
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "superadmin@encf.do",
  "password": "SuperAdmin123!"
}
```

> Nota: El Super Admin debe crearse directamente en la tabla `super_admins`.

### Paso 20 — Cambiar Plan de Empresa

**API:**
```
PATCH /api/v1/admin/empresas/{empresa_id}/plan
Authorization: Bearer {super_admin_token}
Content-Type: application/json

{ "plan_id": "uuid-del-plan-profesional" }
```

**Validaciones:**
- [ ] Solo Super Admin → 403 para usuarios normales
- [ ] Plan inexistente → 404

---

## Resumen de Códigos de Estado

| Código | Significado |
|--------|-------------|
| 200 | Operación exitosa |
| 201 | Recurso creado |
| 400 | Validación fallida (payload inválido) |
| 401 | No autenticado / credenciales inválidas |
| 402 | Límite de plan alcanzado |
| 403 | Sin permisos (rol insuficiente, otra empresa) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (duplicado, último admin) |
| 429 | Rate limit / bloqueo por intentos |
| 500 | Error interno del servidor |
| 502 | Respuesta DGII malformada |
| 503 | DGII no disponible / Circuit Breaker abierto |

---

## Orden de Ejecución Recomendado

```
1. Health Check (verificar infraestructura)
2. Registro de empresa + admin
3. Login
4. Subir certificado (.p12)
5. Crear ítems en catálogo
6. Crear secuencia NCF
7. Emitir factura
8. Consultar estado factura
9. Descargar PDF
10. Crear usuario adicional
11. Crear API Key
12. Emitir factura con API Key
13. Configurar webhook
14. Anular factura (si fue aprobada)
15. Consultar auditoría
```

---

## Variables de Entorno (Postman)

| Variable | Valor |
|----------|-------|
| `base_url` | `http://localhost:3000` |
| `access_token` | Se guarda automáticamente tras Login |
| `refresh_token` | Se guarda automáticamente tras Login |
| `empresa_id` | Se guarda automáticamente tras Registro |
| `usuario_id` | Se guarda automáticamente tras Registro |
