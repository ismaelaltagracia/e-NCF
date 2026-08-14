# Comparación Competitiva — e-NCF vs Mercado Dominicano

---

## Competidores Identificados

### 1. Alegra RD
- **Tipo:** ERP cloud con módulo e-CF integrado
- **Target:** PyMEs que quieren contabilidad + facturación + POS en uno
- **Precio:** ~US$15-50/mes por usuario (planes escalonados)
- **Fortaleza:** Ecosistema completo (contabilidad, nómina, POS, inventario)
- **Debilidad:** No tiene API independiente, no permite self-hosted, no tiene integración transparente para software existente

### 2. Alanube RD
- **Tipo:** API-first (solo API, sin portal de usuario)
- **Target:** Desarrolladores e integradores
- **Precio:** Cobro por factura emitida (~RD$5-15/factura)
- **Fortaleza:** API madura, presencia en LATAM
- **Debilidad:** No tiene UI para el usuario final, costo variable crece con volumen, no tiene plan para contadores

### 3. FiscaliaCore
- **Tipo:** API stateless (hosting puro)
- **Target:** Desarrolladores avanzados
- **Precio:** Por request API
- **Fortaleza:** "No guardamos nada" — el cliente controla su data, no requiere ser facturador autorizado
- **Debilidad:** Sin UI, sin soporte para usuarios no-técnicos, sin reportes

### 4. GuruSoft (EDOC)
- **Tipo:** Middleware enterprise (AddOn para SAP, integración vía archivos planos)
- **Target:** Empresas grandes con SAP/ERP
- **Precio:** Licencia + implementación (RD$50,000-200,000+ inicial)
- **Fortaleza:** Integración SAP nativa, presencia en 8 países LATAM
- **Debilidad:** Carísimo, no accesible para PyMEs, implementación de semanas

### 5. Odoo + módulo e-CF (Indexa)
- **Tipo:** Módulo de ERP open source
- **Target:** Empresas que ya usan Odoo
- **Precio:** Licencia Odoo + módulo (~US$25-50/mes/usuario + costo módulo)
- **Fortaleza:** ERP completo, open source
- **Debilidad:** Solo sirve si ya usas Odoo, curva de aprendizaje alta, no tiene app móvil dedicada

### 6. MSASoft (fe.msasoft.net)
- **Tipo:** Facturador local de escritorio con inventario
- **Target:** Comercios que quieren POS + e-CF
- **Precio:** No público (estimado RD$2,000-5,000/mes)
- **Fortaleza:** Control de inventario integrado
- **Debilidad:** Solo escritorio, sin app móvil, sin API, sin plan contador

---

## Tabla Comparativa de Funcionalidades

| Funcionalidad | e-NCF (nosotros) | Alegra | Alanube | FiscaliaCore | GuruSoft | Odoo |
|--------------|:-:|:-:|:-:|:-:|:-:|:-:|
| Portal web para facturar | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| App móvil nativa | ✅ | ✅ (limitada) | ❌ | ❌ | ❌ | ❌ |
| API REST documentada | ✅ | ❌ | ✅ | ✅ | Parcial | Parcial |
| Integración transparente (Print Bridge) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Plan Contador multi-empresa | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reportes 606/607/608 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Carga masiva (Excel/CSV) | ✅ | ❌ | ❌ | ❌ | ✅ | Parcial |
| Modo contingencia (DGII caída) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PDF con QR | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Email automático al receptor | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Self-hosted (Docker) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Scanner QR para compras | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Precio fijo mensual | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Recepción e-CF + aprobación | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Webhooks | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-moneda | ❌ (roadmap) | ✅ | ❌ | ❌ | ✅ | ✅ |
| Contabilidad integrada | ❌ (roadmap) | ✅ | ❌ | ❌ | ❌ | ✅ |
| POS/Inventario | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## Comparación de Precios (200 facturas/mes)

| Proveedor | Modelo | Costo mensual | Costo anual |
|-----------|--------|--------------|-------------|
| **e-NCF** | Plan fijo PyME | **RD$ 1,990** | **RD$ 23,880** |
| **Alegra** | Por usuario (~2 usuarios) | RD$ 3,000-5,000 | RD$ 36,000-60,000 |
| **Alanube** | Por factura (×200) | RD$ 2,000-3,000 | RD$ 24,000-36,000 |
| **FiscaliaCore** | Por request | ~RD$ 1,500-2,500 | ~RD$ 18,000-30,000 |
| **GuruSoft** | Licencia + mensual | RD$ 15,000+ | RD$ 180,000+ |
| **Odoo** | Licencia + módulo | RD$ 4,000-7,000 | RD$ 48,000-84,000 |

**A mayor volumen, nuestra ventaja crece:** con 1,000 facturas/mes, Alanube cobraría RD$10,000-15,000 y nosotros RD$3,490 (plan Profesional).

---

## Comparación de Precios para Contadores (10 empresas)

| Proveedor | Cómo lo resuelve | Costo mensual |
|-----------|-----------------|---------------|
| **e-NCF** | Plan Contador con 20% descuento desde 3ra empresa | ~RD$ 13,000 |
| **Alegra** | 10 cuentas separadas × RD$3,000 c/u | ~RD$ 30,000 |
| **Alanube** | No tiene plan contador, 10 API keys | Variable |
| **GuruSoft** | No aplica (enterprise) | RD$ 100,000+ |
| **Odoo** | 10 instancias Odoo | RD$ 50,000+ |

**Ahorro del contador con nosotros vs Alegra:** ~RD$ 17,000/mes (57% menos).

---

## Nuestra Ventaja Competitiva Única

### Lo que SOLO nosotros ofrecemos:

1. **Integración transparente (Print Bridge)** — Software viejo sigue funcionando + cumple con DGII. Nadie más lo tiene para PyMEs.

2. **Plan Contador multi-empresa** — Un login, N empresas, descuento progresivo, factura consolidada. No existe en el mercado.

3. **4 productos en 1** — Portal + App + API + Print Bridge. Todos los demás son 1 cosa.

4. **Precio fijo sin sorpresas** — No cobras más si facturas más dentro de tu plan.

5. **Self-hosted** — Para empresas que quieren su data en su servidor.

---

## Donde la Competencia nos Supera (hoy)

| Lo que tienen | Quién | Plan para igualarlo |
|---------------|-------|-------------------|
| Contabilidad completa | Alegra, Odoo | Roadmap Fase 3 (módulo contable básico) |
| POS con inventario | Alegra, MSASoft | No prioritario — nuestro target no es POS |
| Multi-moneda | Alegra, Odoo | Roadmap Fase 2 (1 semana de desarrollo) |
| Presencia en LATAM | Alanube, GuruSoft | No aplica — solo RD por ahora |
| Años en el mercado | Todos | Se compensa con mejor producto y precio |

---

## Posicionamiento Recomendado

**No competimos con Alegra** en contabilidad/ERP — competimos en la facturación electrónica simple, accesible, y flexible.

**Nuestro mensaje:** "Si solo necesitas facturar electrónicamente y cumplir con la DGII — sin un ERP pesado, sin costo por factura, sin cambiar tu software actual — somos la opción."

**Público donde ganamos siempre:**
- PyME que no tiene sistema y quiere algo simple → Portal + App (más fácil que Alegra)
- Empresa con software viejo que no puede cambiar → Print Bridge (solo nosotros)
- Contador con 10+ clientes → Plan Contador (más barato que cualquier alternativa)
- Integrador que quiere API con precio fijo → API (más predecible que Alanube)
