# Guía de Integración API — e-NCF Gateway

## Resumen

Esta guía describe el proceso completo para integrar un sistema externo (ERP, POS, sistema contable) con el API Gateway de facturación electrónica e-NCF, desde el registro inicial hasta la emisión de facturas en producción.

---

## Fase 1: Registro y Configuración Inicial

### Paso 1.1 — Registrar la empresa en la plataforma web

Accede a la aplicación web y completa el formulario de registro:

**URL:** `https://tu-dominio.com/app/registro`

Datos requeridos:
- Nombre de empresa (máx 150 caracteres)
- RNC (9 u 11 dígitos)
- Nombre del administrador
- Email
- Contraseña (mín 8 chars, mayúscula, minúscula, dígito)

### Paso 1.2 — Seleccionar un plan con integración API

Desde el panel de administración o contactando soporte, asegúrate de tener un plan que incluya "Integración API":
- Básico API (50 facturas/mes)
- Profesional API (200 facturas/mes)
- Empresarial API (ilimitado)

### Paso 1.3 — Obtener el certificado digital de la DGII

1. Ingresa al portal de la DGII: [dgii.gov.do/ofv](https://dgii.gov.do/ofv)
2. Solicita ser "Emisor Electrónico"
3. La DGII emite un certificado .p12 para tu RNC
4. Descarga el archivo .p12 y guarda la contraseña

### Paso 1.4 — Subir el certificado en la plataforma

Inicia sesión en la web y ve a **Configuración** → sube el archivo .p12 con su contraseña.

O vía API tras obtener un token JWT:
```
POST /api/v1/empresas/me/certificado
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data

certificado: [archivo .p12]
password: contraseña_del_certificado
```

### Paso 1.5 — Crear un API Key

Desde la web: **API Keys** → **+ Crear API Key**

Selecciona los scopes necesarios:
- `facturas:write` — crear y anular facturas
- `facturas:read` — consultar facturas
- `pdf:read` — descargar PDFs
- `estado:read` — consultar estados

**Guarda la key** — solo se muestra una vez (aunque puedes revelarla después desde la web).

---

## Fase 2: Certificación DGII (Ambiente de Pruebas)

### Paso 2.1 — Registrar las secuencias NCF de prueba

La DGII asigna rangos de números NCF para pruebas. Regístralos en la web:
**NCF** → **+ Nueva Secuencia** para cada tipo que necesites (E31, E32, E33, E34, etc.)

### Paso 2.2 — Ejecutar el set de 15 pruebas

Debes enviar facturas de prueba que cubran los 15 pasos requeridos por la DGII:

| # | Tipo | Qué enviar |
|---|------|------------|
| 1 | E31 | Factura crédito fiscal (1 ítem) |
| 2 | E31 | Factura crédito fiscal (3+ ítems) |
| 3 | E31 | Factura con descuento |
| 4 | E32 | Factura de consumo |
| 5 | E32 | Factura de consumo con ITBIS |
| 6 | E33 | Nota de débito (referencia paso 1) |
| 7 | E34 | Nota de crédito (referencia paso 1) |
| 8 | E41 | Comprobante de compras |
| 9 | E43 | Gastos menores |
| 10 | E44 | Regímenes especiales |
| 11 | E45 | Gubernamental |
| 12 | — | Anular una factura aprobada |
| 13 | — | Consultar estado por Track ID |
| 14 | — | Aprobación comercial (aceptar/rechazar recibida) |
| 15 | — | Consultar rangos NCF |

### Paso 2.3 — Verificar progreso

Consulta tu progreso:
```
GET /api/v1/certificacion/progreso-integrador
X-API-Key: {tu_api_key}
```

O visualmente en la web: **Certificación** → pestaña "Modo Integrador"

### Paso 2.4 — Solicitar promoción a producción

Cuando completes 15/15, el Super Admin de la plataforma promueve tu empresa a producción. A partir de ese momento, tus facturas se envían al ambiente real de la DGII.

---

## Fase 3: Integración API (Referencia Técnica)

### Autenticación

Todas las requests usan el header:
```
X-API-Key: {tu_api_key}
```

### Base URL

- Swagger UI: `https://tu-dominio.com/api/docs`
- Base: `https://tu-dominio.com/api/v1`

---

### Endpoint 1: Crear Factura

```
POST /api/v1/facturas
X-API-Key: {tu_api_key}
Content-Type: application/json
```

**Factura de Crédito Fiscal (E31):**
```json
{
  "rnc_receptor": "101234567",
  "nombre_receptor": "Cliente SRL",
  "tipo_comprobante": "E31",
  "items": [
    {
      "descripcion": "Servicio de consultoría",
      "cantidad": 2,
      "precio_unitario": 5000.00,
      "tasa_itbis": 18
    },
    {
      "descripcion": "Licencia de software",
      "cantidad": 1,
      "precio_unitario": 3000.00,
      "tasa_itbis": 18
    }
  ]
}
```

**Factura de Consumo (E32):**
```json
{
  "rnc_receptor": "40212345678",
  "nombre_receptor": "Consumidor Final",
  "tipo_comprobante": "E32",
  "items": [
    {
      "descripcion": "Venta al detalle",
      "cantidad": 3,
      "precio_unitario": 750.00,
      "tasa_itbis": 18
    }
  ]
}
```

**Nota de Crédito (E34) — referencia a factura anterior:**
```json
{
  "rnc_receptor": "101234567",
  "nombre_receptor": "Cliente SRL",
  "tipo_comprobante": "E34",
  "items": [
    {
      "descripcion": "Devolución parcial",
      "cantidad": 1,
      "precio_unitario": 2000.00,
      "tasa_itbis": 18
    }
  ],
  "informacion_referencia": {
    "ncf_modificado": "E310000000001",
    "fecha_ncf_modificado": "2026-07-15",
    "codigo_modificacion": 3
  }
}
```

**Nota de Débito (E33):**
```json
{
  "rnc_receptor": "101234567",
  "nombre_receptor": "Cliente SRL",
  "tipo_comprobante": "E33",
  "items": [
    {
      "descripcion": "Ajuste por diferencia de precio",
      "cantidad": 1,
      "precio_unitario": 500.00,
      "tasa_itbis": 18
    }
  ],
  "informacion_referencia": {
    "ncf_modificado": "E310000000001",
    "fecha_ncf_modificado": "2026-07-15",
    "codigo_modificacion": 1
  }
}
```

**Con descuento global:**
```json
{
  "rnc_receptor": "101234567",
  "tipo_comprobante": "E31",
  "descuento_global": 10,
  "items": [
    {
      "descripcion": "Equipos",
      "cantidad": 5,
      "precio_unitario": 3000.00,
      "tasa_itbis": 18
    }
  ]
}
```

**Respuesta exitosa (201):**
```json
{
  "id": "f0d85355-e5ec-4c6e-a2d8-10984eaf3962",
  "e_ncf": "E310000000001",
  "track_id": "TRACK-ABC123",
  "estado_dgii": "aceptado",
  "created_at": "2026-07-20T14:30:00.000Z"
}
```

**Posibles estados:**
- `aceptado` — la DGII aceptó el documento
- `reintentando` — fallo temporal, se reintentará automáticamente
- `rechazado` — la DGII rechazó el documento (ver error)

---

### Endpoint 2: Consultar Estado

```
GET /api/v1/facturas/{id}/estado
X-API-Key: {tu_api_key}
```

**Respuesta:**
```json
{
  "id": "f0d85355-...",
  "e_ncf": "E310000000001",
  "estado_dgii": "aprobado",
  "track_id": "TRACK-ABC123",
  "updated_at": "2026-07-20T14:35:00.000Z"
}
```

**Estados terminales:** `aprobado`, `rechazado_definitivo`, `anulado`

---

### Endpoint 3: Descargar PDF

```
GET /api/v1/facturas/{id}/pdf
X-API-Key: {tu_api_key}
```

**Respuesta:**
```json
{
  "url": "https://storage.example.com/facturas-pdf/...",
  "expires_at": "2026-07-20T15:00:00.000Z"
}
```

La URL es pre-firmada y válida por 15 minutos. El PDF incluye código QR según normativa DGII.

---

### Endpoint 4: Anular Factura

Solo facturas con estado `aprobado`.

```
POST /api/v1/facturas/{id}/anular
X-API-Key: {tu_api_key}
Content-Type: application/json

{
  "motivo": "Error en datos del receptor"
}
```

**Respuesta:**
```json
{
  "id": "f0d85355-...",
  "e_ncf": "E310000000001",
  "estado_dgii": "anulado",
  "mensaje": "Factura anulada exitosamente"
}
```

> El e-NCF NO se libera — queda consumido permanentemente.

---

### Endpoint 5: Validar RNC

```
GET /api/v1/rnc/{rnc}/validar
X-API-Key: {tu_api_key}
```

**Respuesta exitosa:**
```json
{
  "rnc": "101234567",
  "nombre_contribuyente": "EMPRESA EJEMPLO SRL",
  "estado": "activo",
  "tipo_contribuyente": "persona_juridica",
  "validado": true
}
```

**RNC no encontrado (422):**
```json
{
  "statusCode": 422,
  "message": "RNC 999999999 no existe en el registro de contribuyentes."
}
```

---

## Fase 4: Producción

### Qué cambia al pasar a producción:

| Aspecto | Certificación | Producción |
|---------|--------------|------------|
| DGII URL | ecf.dgii.gov.do/CerteCF/ | ecf.dgii.gov.do/ECF/ |
| Facturas | Son de prueba | Son fiscales reales |
| Secuencias NCF | Rangos de prueba | Rangos de producción |
| Base URL API | La misma | La misma |
| API Key | La misma | La misma |

El cambio es transparente para tu sistema — **no necesitas cambiar nada en tu código**. La plataforma redirige automáticamente según el ambiente de tu empresa.

### Pasos tras la promoción:

1. La plataforma desactiva las secuencias NCF de prueba
2. Registra los nuevos rangos NCF de producción (asignados por la DGII al certificarte)
3. Tu sistema sigue llamando al mismo endpoint con la misma API Key
4. Las facturas ahora van a la DGII real y tienen validez fiscal

---

## Códigos de Error

| Código | Significado | Qué hacer |
|--------|-------------|-----------|
| 400 | Payload inválido | Revisar campos requeridos y formatos |
| 401 | API Key inválida o plan sin API | Verificar key y plan |
| 402 | Límite mensual alcanzado | Contactar admin para upgrade de plan |
| 403 | Sin permisos (scope insuficiente) | Verificar scopes del API Key |
| 404 | Factura no encontrada | Verificar ID |
| 409 | Secuencia agotada / duplicado | Crear nueva secuencia NCF |
| 422 | RNC inválido / XML rechazado | Corregir datos del receptor |
| 429 | Rate limit excedido | Esperar (header Retry-After) |
| 500 | Error interno | Reintentar en unos segundos |
| 503 | DGII no disponible | Sistema reintentará automáticamente |

---

## Códigos de Modificación (Notas Débito/Crédito)

| Código | Significado |
|--------|-------------|
| 1 | Disminución de precio |
| 2 | Corrección |
| 3 | Devolución |
| 4 | Bonificación |
| 5 | Descuento |

---

## Tipos de Comprobante

| Tipo | Descripción |
|------|-------------|
| E31 | Factura de Crédito Fiscal |
| E32 | Factura de Consumo |
| E33 | Nota de Débito |
| E34 | Nota de Crédito |
| E41 | Comprobante de Compras |
| E43 | Gastos Menores |
| E44 | Regímenes Especiales |
| E45 | Gubernamental |
| E46 | Exportaciones |

---

## Rate Limits

- API Key: **1000 requests/minuto**
- Header `Retry-After` en respuestas 429

---

## Soporte

- Swagger UI: `/api/docs`
- Health check: `GET /health`
- Progreso certificación: `GET /api/v1/certificacion/progreso-integrador`
