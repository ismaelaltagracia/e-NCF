# Productos, Planes y Pricing — e-NCF

> Estructura de productos según el tipo de implementación y modelo de cobro.

---

## Los 3 Productos

La plataforma ofrece 3 formas diferentes de facturar electrónicamente. Cada una resuelve un problema distinto:

| Producto | Para quién | Cómo funciona |
|----------|-----------|---------------|
| **Portal + App** | PyMEs sin sistema, negocios pequeños | Facturan desde la web o el celular directamente |
| **API REST** | Empresas con software propio (ERP, POS, web) | Su sistema llama a nuestra API para emitir |
| **Print Bridge** | Empresas con software viejo que no quieren cambiar | Imprimen como siempre, el puente envía a DGII |

---

## Producto 1: Portal + App Móvil

**Qué incluye:**
- Acceso al portal web (facturar, recibir, reportes, catálogo)
- App móvil iOS + Android
- PDF con QR + envío por email
- Reportes 606/607/608
- Modo contingencia
- Dashboard con métricas

**Quién lo usa:**
- Colmados, farmacias, salones, talleres
- Profesionales independientes (abogados, médicos, consultores)
- Pequeños comercios que hoy usan NCF físico

**Modelo de cobro:** Mensual por plan según volumen de facturas.

---

## Producto 2: API REST

**Qué incluye:**
- Todo lo del Portal + App
- API Keys con scopes personalizables
- Documentación Swagger interactiva
- Webhooks para eventos (aprobada, rechazada, anulada)
- Rate limit configurado por plan
- Soporte técnico de integración

**Quién lo usa:**
- Empresas con ERP (SAP, Odoo, sistemas propios)
- Desarrolladores que integran e-CF en su software
- POS modernos con capacidad de llamar APIs
- Plataformas SaaS que quieren ofrecer facturación a sus clientes

**Modelo de cobro:** Mensual por plan según volumen + acceso API.

---

## Producto 3: Print Bridge (Puente de Impresión)

**Qué incluye:**
- Software instalable en Windows (impresora virtual)
- Panel de configuración local (localhost:9876)
- Plantillas de extracción configurables
- Modo contingencia con cola local
- Soporte multi-impresora (térmica + láser)
- Re-impresión con NCF y QR
- Actualizaciones automáticas del software

**Quién lo usa:**
- Empresas con software contable viejo (Mónica, ContaPyme, Softland, sistemas DOS)
- Negocios que usan Excel para facturar
- POS antiguos sin capacidad de API
- Cualquiera que no quiera cambiar su sistema actual

**Modelo de cobro:** Mensual (incluye licencia del software + servicio cloud).

**Diferencia clave:** El Print Bridge tiene un componente de INSTALACIÓN que los otros no tienen. Puede cobrarse como servicio adicional.

---

## Tabla de Planes Unificada

### Planes Portal + App

| Plan | Precio/mes | Facturas/mes | Usuarios | Incluye |
|------|-----------|-------------|----------|---------|
| **Gratis** | RD$ 0 | 20 | 1 | Portal web, app, TesteCF |
| **Emprendedor** | RD$ 990 | 100 | 2 | + PDF, email, reportes |
| **PyME** | RD$ 1,990 | 300 | 3 | + Carga masiva, contingencia |
| **Profesional** | RD$ 3,490 | 1,000 | 10 | + Soporte prioritario |
| **Ilimitado** | RD$ 5,990 | Sin límite | Sin límite | Todo |

---

### Planes API (incluye todo lo del Portal)

| Plan | Precio/mes | Facturas/mes | API Keys | Rate Limit | Incluye |
|------|-----------|-------------|----------|-----------|---------|
| **API Básico** | RD$ 2,490 | 500 | 2 | 100 req/min | API + Docs + Webhook |
| **API Pro** | RD$ 4,990 | 2,000 | 5 | 500 req/min | + Soporte técnico |
| **API Enterprise** | RD$ 9,990 | 10,000 | Ilimitadas | 2000 req/min | + SLA + Soporte dedicado |

---

### Planes Print Bridge (incluye todo lo del Portal)

| Plan | Precio/mes | Facturas/mes | Licencias PC | Incluye |
|------|-----------|-------------|-------------|---------|
| **Bridge Básico** | RD$ 1,990 | 200 | 1 PC | Software + portal + soporte remoto |
| **Bridge Plus** | RD$ 3,490 | 500 | 3 PCs | + Múltiples impresoras, plantillas custom |
| **Bridge Enterprise** | RD$ 6,990 | 2,000 | 10 PCs | + Instalación presencial, SLA |

---

### Servicios adicionales (cobro único)

| Servicio | Precio | Descripción |
|----------|--------|-------------|
| Instalación remota Print Bridge | RD$ 2,000 / PC | Configurar por TeamViewer/AnyDesk |
| Instalación presencial | RD$ 5,000 / visita | Técnico en sitio (Santo Domingo) |
| Plantilla personalizada | RD$ 3,000 | Crear plantilla para software específico |
| Migración de datos | RD$ 5,000 - 15,000 | Importar catálogo/clientes de otro sistema |
| Capacitación grupal | RD$ 8,000 / sesión | Hasta 10 personas, 2 horas |

---

## Plan Contador (especial)

Para contadores que manejan múltiples clientes:

| Plan | Precio/mes | Empresas | Facturas total | Incluye |
|------|-----------|----------|---------------|---------|
| **Contador 10** | RD$ 4,990 | Hasta 10 | 1,000 | Portal, reportes, 606/607/608 |
| **Contador 25** | RD$ 9,990 | Hasta 25 | 3,000 | + API, soporte prioritario |
| **Contador 50** | RD$ 14,990 | Hasta 50 | 6,000 | + Instalaciones Print Bridge incluidas |

**Beneficio adicional:** 15% comisión recurrente por cada cliente referido que pague directamente.

---

## Comparación: Qué plan recomendar según el cliente

| Tipo de cliente | Producto | Plan sugerido | Precio |
|----------------|----------|--------------|--------|
| Colmado / tienda pequeña | Portal + App | Emprendedor | RD$ 990 |
| Restaurante / salón | Portal + App | PyME | RD$ 1,990 |
| Empresa mediana (30+ facturas/mes) | Portal + App | Profesional | RD$ 3,490 |
| Empresa con sistema propio | API | API Pro | RD$ 4,990 |
| POS antiguo / software viejo | Print Bridge | Bridge Básico | RD$ 1,990 |
| Cadena de tiendas (5+ puntos) | Print Bridge | Bridge Enterprise | RD$ 6,990 |
| Contador independiente | Contador | Contador 10 | RD$ 4,990 |
| Firma contable grande | Contador | Contador 50 | RD$ 14,990 |
| Desarrollador integrando para clientes | API | API Enterprise | RD$ 9,990 |

---

## Flujo de decisión para el cliente

```
¿Tienes software de facturación?
├── NO → Portal + App (plan según volumen)
├── SÍ → ¿Tu software tiene API o puede integrar?
│         ├── SÍ → API REST (plan según volumen)
│         └── NO → ¿Puedes imprimir desde tu software?
│                   ├── SÍ → Print Bridge
│                   └── NO → Portal + App (usa nuestro sistema directo)
```

---

## Modelo de ingresos proyectado (mix de productos)

Suponiendo 350 clientes al mes 12:

| Producto | % clientes | Clientes | ARPU | MRR |
|----------|-----------|----------|------|-----|
| Portal + App | 50% | 175 | RD$ 1,800 | RD$ 315,000 |
| Print Bridge | 30% | 105 | RD$ 2,800 | RD$ 294,000 |
| API | 10% | 35 | RD$ 4,500 | RD$ 157,500 |
| Contador | 10% | 35 | RD$ 7,000 | RD$ 245,000 |
| **Total** | | **350** | **RD$ 2,890** | **RD$ 1,011,500** |

**+Servicios adicionales:** ~RD$ 50,000-100,000/mes (instalaciones, plantillas, capacitaciones)

**MRR total estimado mes 12:** ~RD$ 1,100,000 (~US$ 18,300/mes)

---

## Lo que debes implementar en la plataforma para soportar esto

### Ya implementado:
- [x] Planes con límites de facturas
- [x] API Keys con control por empresa
- [x] Multi-tenant (múltiples empresas)
- [x] Roles (admin, facturador, lector)
- [x] Portal web + App + Print Bridge

### Falta implementar:

| Feature | Para qué producto | Esfuerzo |
|---------|-------------------|----------|
| Control de licencias Print Bridge (máx PCs por plan) | Print Bridge | 1 semana |
| Rate limiting por plan en API | API | 3 días |
| Dashboard super admin: métricas de uso por empresa | Todos | 1 semana |
| Cobro automático (Stripe) | Todos | 3-5 días |
| Auto-bloqueo al vencer factura (gracia de 5 días) | Todos | 2 días |
| Conteo de API Keys por plan | API | 1 día |
| Página de upgrade in-app | Portal + App | 2 días |
| Facturación del servicio (emitir factura al cliente) | Todos | 3 días |

---

## Resumen

3 productos, cada uno con 3 planes, más planes especiales para contadores y servicios adicionales de instalación/personalización. El Print Bridge es el que más ingresos por servicios genera (instalación, plantillas custom), mientras que API y Contador son los de mayor ticket mensual.
