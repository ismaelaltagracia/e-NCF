# Estudio de Factibilidad Financiera — e-NCF

> Análisis actualizado con todos los productos implementados: Portal + App, API REST, Print Bridge, y Plan Contador.

---

## 1. El Mercado

### Datos duros

| Indicador | Cifra | Fuente |
|-----------|-------|--------|
| Contribuyentes en DGII | 771,000+ | Padrón RNC 2026 |
| MiPyMEs (% del tejido empresarial) | 98% | MAPFRE/Banco Central RD |
| Empresas en 3er grupo obligatorio e-CF | ~100,000 | DGII Ley 32-23 |
| Fecha límite de cumplimiento | 15 nov 2026 | DGII (extendida) |
| Empresas que aún no tienen solución | ~80,000+ | Estimación (80%) |
| Contadores activos en RD (ICPARD) | ~12,000 | Colegio de Contadores |
| Empresas promedio por contador | 15-40 | Estimación de mercado |

### Mercado objetivo realista (Año 1)

| Segmento | Meta año 1 | ARPU mensual |
|----------|-----------|-------------|
| PyMEs directas (Portal + App) | 200 clientes | RD$ 1,700 |
| Integradores (API) | 30 clientes | RD$ 4,500 |
| Print Bridge | 80 clientes | RD$ 2,500 |
| Contadores (multi-empresa) | 40 contadores (×8 empresas c/u = 320 empresas) | RD$ 7,500 |
| **Total** | **350 cuentas** | **RD$ 2,890 ARPU** |

---

## 2. Inversión Requerida

### Inversión inicial (ya realizada — costo de desarrollo)

| Concepto | Valor estimado |
|----------|---------------|
| Backend NestJS (completo) | RD$ 800,000 |
| Frontend React (portal web) | RD$ 300,000 |
| App móvil Flutter | RD$ 400,000 |
| Print Bridge (.NET) | RD$ 250,000 |
| Documentación, specs, testing | RD$ 100,000 |
| **Total desarrollo (valor de mercado)** | **RD$ 1,850,000 (~US$ 31,000)** |

> Nota: Este es el valor de mercado si hubieras contratado el desarrollo. El costo real fue tu tiempo + herramientas.

### Inversión para lanzamiento (lo que falta gastar)

| Concepto | Costo | Tipo |
|----------|-------|------|
| Servidor VPS (primer año) | RD$ 5,000/mes = RD$ 60,000 | Recurrente |
| Dominio .do | RD$ 2,500/año | Una vez |
| Apple Developer (iOS) | RD$ 6,000/año | Una vez |
| Google Play Console | RD$ 1,500 | Una vez |
| Google Ads (primeros 3 meses) | RD$ 60,000 | Marketing |
| Diseño de logo/branding | RD$ 15,000 | Una vez |
| Asesoría legal (términos) | RD$ 20,000 | Una vez |
| **Total inversión lanzamiento** | **~RD$ 165,000 (~US$ 2,750)** |

---

## 3. Costos Operativos Mensuales

| Concepto | Mes 1-3 | Mes 4-12 |
|----------|---------|----------|
| Servidor VPS | RD$ 5,000 | RD$ 8,000 (upgrade) |
| SMTP (email transaccional) | RD$ 0 (free tier) | RD$ 1,500 |
| Google Ads | RD$ 20,000 | RD$ 15,000 |
| Contenido/redes sociales | RD$ 5,000 | RD$ 5,000 |
| Sentry + UptimeRobot | RD$ 0 | RD$ 0 (free tiers) |
| Soporte (tu tiempo) | RD$ 0 | RD$ 0 |
| **Total costos mensuales** | **RD$ 30,000** | **RD$ 29,500** |
| **En USD** | **~US$ 500** | **~US$ 490** |

---

## 4. Proyección de Ingresos (12 meses)

### Escenario conservador

| Mes | Clientes pagos | MRR (RD$) | MRR (US$) | Utilidad neta |
|-----|---------------|-----------|-----------|---------------|
| 1 (sep 2026) | 15 | 40,000 | 667 | +10,000 |
| 2 (oct) | 40 | 108,000 | 1,800 | +78,000 |
| 3 (nov) | 100 | 270,000 | 4,500 | +240,000 |
| 4 (dic) | 140 | 378,000 | 6,300 | +348,000 |
| 5 (ene 2027) | 170 | 459,000 | 7,650 | +429,000 |
| 6 (feb) | 200 | 540,000 | 9,000 | +510,000 |
| 7 (mar) | 225 | 608,000 | 10,130 | +578,000 |
| 8 (abr) | 250 | 675,000 | 11,250 | +645,000 |
| 9 (may) | 275 | 743,000 | 12,380 | +713,000 |
| 10 (jun) | 300 | 810,000 | 13,500 | +780,000 |
| 11 (jul) | 325 | 878,000 | 14,630 | +848,000 |
| 12 (ago) | 350 | 945,000 | 15,750 | +915,000 |

**Ingreso total Año 1: ~RD$ 6,450,000 (US$ 107,500)**
**Utilidad neta Año 1: ~RD$ 6,100,000 (US$ 101,700)** (margen ~94%)

### Escenario optimista (marketing fuerte + 30 contadores activos)

| Mes | Clientes pagos | MRR (RD$) | MRR (US$) |
|-----|---------------|-----------|-----------|
| 3 | 180 | 486,000 | 8,100 |
| 6 | 400 | 1,080,000 | 18,000 |
| 9 | 600 | 1,620,000 | 27,000 |
| 12 | 800 | 2,160,000 | 36,000 |

**Ingreso total Año 1 optimista: ~RD$ 13,000,000 (US$ 217,000)**

---

## 5. Desglose de Ingresos por Producto (Mes 12)

| Producto | Clientes | ARPU | MRR | % del total |
|----------|---------|------|-----|-------------|
| Portal + App (PyMEs) | 175 | RD$ 1,700 | RD$ 297,500 | 31% |
| Print Bridge | 80 | RD$ 2,500 | RD$ 200,000 | 21% |
| API (integradores) | 30 | RD$ 4,500 | RD$ 135,000 | 14% |
| Contadores (×8 emp c/u) | 40 | RD$ 7,500 | RD$ 300,000 | 32% |
| Servicios (instalaciones) | — | — | RD$ 50,000 | 5% |
| **Total** | **350** | **RD$ 2,890** | **RD$ 982,500** | **100%** |

**Los contadores son el producto más rentable** (32% de ingresos con solo 11% de las cuentas).

---

## 6. Métricas de Factibilidad

| Métrica | Valor |
|---------|-------|
| Inversión total para lanzar | RD$ 165,000 (US$ 2,750) |
| Costo mensual operativo | RD$ 30,000 (US$ 500) |
| Break-even | Mes 2 (12 clientes pagos) |
| ROI primer año | 3,700% (inversión vs utilidad) |
| Payback period | 1-2 meses |
| MRR mes 12 (conservador) | RD$ 945,000 (US$ 15,750) |
| Margen neto | ~94% (SaaS puro, costos mínimos) |
| LTV promedio (24 meses vida) | RD$ 69,360 |
| CAC esperado | RD$ 3,000 |
| LTV/CAC ratio | 23x (excelente) |

---

## 7. Análisis de Riesgos

| Riesgo | Prob. | Impacto | Mitigación | Efecto en ingresos |
|--------|-------|---------|------------|-------------------|
| DGII extiende plazo de nuevo | 30% | Medio | La ley sigue vigente, solo baja urgencia | -20% mes 3 |
| Churn alto (>10%/mes) | 20% | Alto | Onboarding excepcional, soporte proactivo | -15% MRR |
| Competidor baja precios | 15% | Medio | Diferenciarnos en UX + Print Bridge (único) | -10% crecimiento |
| Certificación DGII tarda | 25% | Alto | Iniciar proceso hoy | Retrasa lanzamiento 1-2 meses |
| Problemas técnicos en producción | 20% | Medio | Sentry + backups + contingencia ya implementada | Bajo |

**Riesgo neto:** Bajo-Medio. Incluso en el peor escenario (50% menos clientes de lo proyectado), el negocio es rentable desde el mes 3.

---

## 8. Ventaja Competitiva Sostenible

| Factor | Nosotros | Alanube | FiscaliaCore | GuruSoft |
|--------|----------|---------|-------------|----------|
| Portal + API + Print Bridge | ✅ Los 3 | Solo API | Solo API | Solo middleware |
| Precio fijo (no por factura) | ✅ | ❌ Por factura | ❌ Por request | ❌ Licencia cara |
| Plan Contador multi-empresa | ✅ | ❌ | ❌ | ❌ |
| Self-hosted opción | ✅ | ❌ | ❌ | ❌ |
| App móvil nativa | ✅ | ❌ | ❌ | ❌ |
| Integración transparente (Print Bridge) | ✅ | ❌ | ❌ | Parcial |
| Modo contingencia real | ✅ | ❌ | ❌ | ❌ |

**Nadie en RD ofrece los 4 productos juntos.** Esa es la barrera de entrada para la competencia.

---

## 9. Proyección a 3 Años

| Año | Clientes | MRR | ARR | Utilidad anual |
|-----|----------|-----|-----|---------------|
| Año 1 | 350 | RD$ 945,000 | RD$ 11.3M | ~RD$ 6.1M (US$ 102K) |
| Año 2 | 800 | RD$ 2,160,000 | RD$ 25.9M | ~RD$ 22M (US$ 367K) |
| Año 3 | 1,500 | RD$ 4,050,000 | RD$ 48.6M | ~RD$ 44M (US$ 733K) |

Con 1,500 clientes del universo de 100,000 = solo 1.5% de penetración. Espacio masivo de crecimiento.

---

## 10. Conclusión

| Pregunta | Respuesta |
|----------|-----------|
| ¿Es factible? | **Sí.** Inversión mínima (US$ 2,750), break-even en 2 meses, demanda obligatoria por ley. |
| ¿Es rentable? | **Altamente.** Margen 94%, SaaS con costos marginales casi cero por cliente adicional. |
| ¿Cuándo recupero la inversión? | **Mes 2.** Con 12 clientes pagos ya cubres costos. |
| ¿Cuál es el mayor riesgo? | Que la certificación DGII se retrase. Solución: iniciar hoy. |
| ¿Cuál es la mayor oportunidad? | Los contadores. 40 contadores = 320 empresas sin vender una por una. |
| ¿Escala? | Sí. Cero costo marginal por cliente. Solo infraestructura ($7/mes por cada 200 clientes). |
