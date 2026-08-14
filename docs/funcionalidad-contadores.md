# Funcionalidad Contadores — Multi-Empresa

> Los contadores pueden gestionar múltiples empresas desde un solo perfil, con facturación consolidada y descuento del 20%.

---

## Modelo de negocio

- El contador tiene un solo login
- Puede crear y gestionar N empresas (sus clientes)
- Cada empresa tiene un plan individual
- **Las primeras 2 empresas pagan precio completo (sin descuento)**
- **A partir de la 3ra empresa, se aplica 20% de descuento** en cada plan
- La factura mensual se genera AL CONTADOR (consolidada: suma de todos los planes de sus empresas)
- Si una empresa estuvo activa al menos 1 día del mes, se cobra el mes completo
- El contador tiene control total sobre cada empresa (facturar, configurar, reportes, usuarios)

### Registro como contador
- Al registrarse, se le pide: nombre de la firma, RNC de la firma (opcional), número de exequátur (opcional)
- El RNC y exequátur son opcionales porque algunos contadores trabajan independientes sin firma formal
- Esto evita que cualquier persona se registre como contador solo por el descuento — el descuento no aplica hasta la 3ra empresa

### Lógica anti-abuso
- Las primeras 2 empresas no tienen descuento → no hay incentivo para registrarse como contador solo por una empresa
- El descuento solo rinde si realmente manejas 3+ clientes
- El sistema registra RNC y exequátur para auditoría (aunque sean opcionales)

---

## Modelo de datos

### Nueva entidad: `Contador`

```
contadores
├── id (uuid, PK)
├── usuario_id (FK → usuarios) — el usuario principal del contador
├── nombre_firma (varchar) — "Martínez & Asociados CPA"
├── rnc_firma (varchar, nullable) — RNC de la firma contable (opcional)
├── exequatur (varchar, nullable) — número de exequátur (opcional)
├── email_facturacion (varchar) — donde recibe su factura mensual
├── activo (boolean)
├── created_at (timestamp)
└── updated_at (timestamp)
```

### Relación Contador → Empresas

```
contador_empresas
├── id (uuid, PK)
├── contador_id (FK → contadores)
├── empresa_id (FK → empresas)
├── plan_id (FK → planes) — plan asignado a esta empresa
├── descuento_porcentaje (decimal, default 20)
├── activo (boolean)
├── fecha_alta (date) — cuándo se vinculó
├── fecha_baja (date, nullable) — cuándo se desvinculó
└── created_at (timestamp)
```

### Facturación mensual: `factura_contador`

```
facturas_contador
├── id (uuid, PK)
├── contador_id (FK → contadores)
├── periodo (varchar) — "2026-08"
├── subtotal (decimal) — suma de planes sin descuento
├── descuento (decimal) — monto descontado (20%)
├── total (decimal) — lo que paga
├── estado (enum: pendiente | pagada | vencida)
├── detalle (jsonb) — array con cada empresa y su monto
├── created_at (timestamp)
└── pagada_en (timestamp, nullable)
```

---

## Flujo del contador

### Registro como contador
1. Se registra como usuario normal
2. Aplica para ser "contador" (desde el portal: "Soy contador")
3. Llena: nombre de firma, RNC de firma (opcional), exequátur (opcional), email de facturación
4. Se crea su registro en `contadores`
5. Accede al panel de contador inmediatamente (no requiere aprobación)

### Crear empresa
1. Contador va a "Mis Empresas" → "Agregar empresa"
2. Llena: nombre, RNC, selecciona plan
3. El sistema crea la empresa con estado activo
4. El contador es admin automático de esa empresa
5. Puede cargar certificado, configurar secuencias, etc.

### Cambiar entre empresas
1. En el header/sidebar aparece selector de empresa activa
2. Al cambiar, todo el contexto cambia (facturas, catálogo, reportes son de esa empresa)
3. El JWT incluye `empresa_id` del contexto actual
4. Se puede cambiar sin cerrar sesión

### Facturación mensual
1. El día 1 de cada mes, un cron genera la factura del contador
2. Para cada empresa vinculada ese mes:
   - Si `fecha_alta` fue en algún momento del mes anterior → se cobra
   - Precio = plan.precio * (1 - descuento_porcentaje/100)
3. Se envía email al contador con el detalle
4. Si no paga en 5 días → estado "vencida" → se suspenden las empresas

---

## Endpoints nuevos

### Gestión de contador
| Método | Endpoint | Función |
|--------|----------|---------|
| POST | `/api/v1/contador/registro` | Registrarse como contador |
| GET | `/api/v1/contador/me` | Datos de mi perfil de contador |
| PATCH | `/api/v1/contador/me` | Actualizar datos de la firma |

### Empresas del contador
| Método | Endpoint | Función |
|--------|----------|---------|
| GET | `/api/v1/contador/empresas` | Listar mis empresas |
| POST | `/api/v1/contador/empresas` | Crear nueva empresa |
| GET | `/api/v1/contador/empresas/:id` | Detalle de una empresa |
| PATCH | `/api/v1/contador/empresas/:id` | Actualizar empresa |
| DELETE | `/api/v1/contador/empresas/:id` | Desvincular/desactivar empresa |
| POST | `/api/v1/contador/empresas/:id/cambiar-plan` | Cambiar plan de una empresa |

### Cambio de contexto
| Método | Endpoint | Función |
|--------|----------|---------|
| POST | `/api/v1/contador/cambiar-empresa` | Cambia empresa activa, retorna nuevo JWT |

### Facturación del contador
| Método | Endpoint | Función |
|--------|----------|---------|
| GET | `/api/v1/contador/facturas` | Historial de facturas mensuales |
| GET | `/api/v1/contador/facturas/:id` | Detalle de una factura |
| GET | `/api/v1/contador/factura-actual` | Preview de lo que se cobrará este mes |

---

## UI del Contador

### Selector de empresa (header)
```
┌─────────────────────────────────┐
│ 🏢 Farmacia San José ▼         │
│    ├── Farmacia San José ✓      │
│    ├── Ferretería El Constructor│
│    ├── Consultores Tech         │
│    └── + Agregar empresa        │
└─────────────────────────────────┘
```

### Dashboard del contador (vista consolidada)
- Total empresas activas
- Total facturas emitidas (todas las empresas)
- Monto a pagar este mes (preview factura)
- Empresas con certificado por vencer
- Acceso rápido a cada empresa

### Pantalla "Mis Empresas"
- Lista de empresas con: nombre, RNC, plan, facturas/mes, estado
- Botón "Agregar empresa"
- Click → entra al contexto de esa empresa

### Pantalla "Mi Facturación"
- Factura actual (preview)
- Historial de facturas pasadas
- Estado de pago

---

## Cambio de contexto técnico

### Opción A: JWT con empresa_id dinámico
El endpoint `POST /api/v1/contador/cambiar-empresa` verifica que la empresa pertenece al contador y emite un nuevo JWT con el `empresa_id` seleccionado. Todo el resto del sistema funciona igual (ya filtra por empresa_id del JWT).

### Opción B: Header X-Empresa-Id
El contador siempre envía un header extra `X-Empresa-Id` que overridea el empresa_id del JWT. Un middleware valida que esa empresa le pertenece.

**Recomendación: Opción A** — más simple, no modifica la lógica existente. Solo agrega un endpoint de cambio.

---

## Cálculo de factura mensual

```
Empresas del contador activas durante el mes, ordenadas por fecha_alta:

  Para empresa #1 y #2 (las más antiguas):
    precio_final = plan.precio (sin descuento)

  Para empresa #3 en adelante:
    precio_base = plan.precio
    descuento = precio_base * 0.20
    precio_final = precio_base - descuento

  Condición de cobro:
  Si fecha_alta <= último_dia_del_mes Y (fecha_baja IS NULL OR fecha_baja >= primer_dia_del_mes):
    → Se cobra precio_final completo (no se prorratea, con 1 día basta)

Factura total = SUM(precio_final de cada empresa activa)
```

**Ejemplo con 4 empresas:**
- Empresa 1 — Farmacia (Plan PyME RD$1,990): **RD$1,990** (sin descuento)
- Empresa 2 — Ferretería (Plan Profesional RD$3,490): **RD$3,490** (sin descuento)
- Empresa 3 — Consultores (Plan Emprendedor RD$990): RD$990 × 0.80 = **RD$792** (con 20%)
- Empresa 4 — Clínica (Plan PyME RD$1,990): RD$1,990 × 0.80 = **RD$1,592** (con 20%)
- **Total factura mensual: RD$7,864**
- **Ahorro vs precio normal: RD$596/mes**

---

## Fases de implementación

### Fase 1 — Core (1-2 semanas)
- [ ] Entidades: Contador, ContadorEmpresa, FacturaContador
- [ ] Endpoints CRUD de empresas del contador
- [ ] Endpoint de cambio de contexto (nuevo JWT)
- [ ] Cron de generación de factura mensual
- [ ] Validación: empresa pertenece al contador

### Fase 2 — UI (1 semana)
- [ ] Selector de empresa en el sidebar/header
- [ ] Pantalla "Mis Empresas" (listar, crear, cambiar plan)
- [ ] Dashboard consolidado del contador
- [ ] Pantalla "Mi Facturación" (historial, preview)

### Fase 3 — Facturación (3-5 días)
- [ ] Cron primer día del mes: generar factura
- [ ] Email con detalle al contador
- [ ] Lógica de suspensión por impago (5 días de gracia)
- [ ] Preview de factura del mes actual

**Total estimado: 2-3 semanas**

---

## Impacto en el sistema existente

| Componente | Cambio necesario |
|------------|-----------------|
| JWT | Agregar campo `es_contador` y `contador_id` |
| Login | Si es contador, redirigir a dashboard de contador |
| Sidebar | Mostrar selector de empresa si es contador |
| Guards | Validar que empresa pertenece al contador en cambio de contexto |
| Planes | Aplicar descuento 20% en la factura, no en el plan visible |
| API Keys | Una por empresa (no por contador) |
| Print Bridge | Se registra por empresa, no por contador |
