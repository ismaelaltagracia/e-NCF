# Integración Stripe — Cobro Automático por Factura

> Guía completa: cómo contratar, configurar, e implementar Stripe para cobrar automáticamente las facturas mensuales generadas por el sistema.

---

## Parte 1: Contratar Stripe

### Paso 1: Crear cuenta

1. Ve a **https://dashboard.stripe.com/register**
2. Llena: email, nombre completo, contraseña
3. Confirma email
4. Ya tienes acceso al dashboard en modo test (puedes desarrollar sin activar pagos reales)

### Paso 2: Activar pagos reales

1. En el dashboard → **"Activate your account"** (banner superior)
2. Llena el formulario de activación:
   - **Tipo de negocio:** Empresa / Individual
   - **País:** República Dominicana (si no aparece, usa Estados Unidos con cuenta bancaria US o elige un país LATAM soportado)
   - **Industria:** Software / SaaS
   - **Descripción:** Plataforma de facturación electrónica
   - **URL del sitio:** https://tudominio.com
   - **Datos bancarios:** cuenta donde recibirás los pagos

> **Nota sobre RD:** Stripe no tiene entidad legal en RD pero acepta tarjetas dominicanas. Para recibir desembolsos puedes usar:
> - Una cuenta bancaria en USD (Banreservas International, BHD USD)
> - Una cuenta en un país soportado (US, Puerto Rico)
> - Servicios como Payoneer o Mercury como intermediario

### Paso 3: Obtener API Keys

1. Dashboard → **Developers** → **API Keys**
2. Copia:
   - `Publishable key` (pk_live_...) → para el frontend
   - `Secret key` (sk_live_...) → para el backend
3. En modo desarrollo usa las keys de test (pk_test_... / sk_test_...)

---

## Parte 2: Configurar en tu proyecto

### Variables de entorno

Agrega a tu `.env`:
```env
# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Instalar dependencia

```bash
cd /path/to/e-NCF
npm install stripe
```

---

## Parte 3: Modelo de datos

### Nuevos campos en la tabla `empresas`:

```sql
ALTER TABLE empresas ADD COLUMN stripe_customer_id VARCHAR(255) NULL;
ALTER TABLE empresas ADD COLUMN stripe_payment_method_id VARCHAR(255) NULL;
ALTER TABLE empresas ADD COLUMN pago_automatico BOOLEAN DEFAULT false;
```

### Nuevos campos en la tabla `contadores`:

```sql
ALTER TABLE contadores ADD COLUMN stripe_customer_id VARCHAR(255) NULL;
ALTER TABLE contadores ADD COLUMN stripe_payment_method_id VARCHAR(255) NULL;
```

### Nuevo campo en `facturas_contador` (y equivalente para empresas directas):

```sql
ALTER TABLE facturas_contador ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL;
ALTER TABLE facturas_contador ADD COLUMN stripe_invoice_id VARCHAR(255) NULL;
```

---

## Parte 4: Flujo de implementación

### A. Registrar tarjeta del cliente (una vez)

```
Frontend                          Backend                         Stripe
   │                                │                               │
   │─ Usuario click "Agregar       │                               │
   │  método de pago"              │                               │
   │                                │                               │
   │─ POST /api/v1/pagos/setup ───►│                               │
   │                                │─ stripe.setupIntents.create──►│
   │                                │◄─ client_secret ─────────────│
   │◄─ { client_secret } ──────────│                               │
   │                                │                               │
   │─ Stripe.js confirmSetup ──────────────────────────────────────►│
   │  (el usuario ingresa tarjeta)  │                               │
   │◄──────────────────────────────────────── setup_intent.succeeded│
   │                                │                               │
   │─ POST /api/v1/pagos/confirmar─►│                               │
   │                                │─ Guarda payment_method_id ───►│
   │                                │  en empresa/contador           │
   │◄─ { ok: true } ───────────────│                               │
```

### B. Cobro automático mensual (cron)

```
Cron (día 1)                    Backend                          Stripe
   │                               │                               │
   │─ Genera factura ────────────►│                               │
   │                               │─ stripe.paymentIntents.create─►│
   │                               │  (amount, customer,            │
   │                               │   payment_method, confirm:true)│
   │                               │◄─ payment_intent (succeeded)──│
   │                               │                               │
   │                               │─ Actualiza factura:           │
   │                               │  estado = "pagada"            │
   │                               │  stripe_payment_intent_id = x │
   │                               │                               │
   │                               │─ Envía email: "Cobro realizado"│
```

### C. Si el cobro falla

```
   │                               │─ stripe.paymentIntents.create─►│
   │                               │◄─ payment_intent (failed) ────│
   │                               │                               │
   │                               │─ Marca factura: "pendiente"   │
   │                               │─ Envía email: "No pudimos     │
   │                               │  cobrar. Actualice su tarjeta"│
   │                               │                               │
   │  (Día 3) Reintento ──────────│─ stripe.paymentIntents.create─►│
   │                               │  (segundo intento)             │
   │                               │                               │
   │  (Día 5) Si sigue fallando ──│─ Suspende servicio            │
```

---

## Parte 5: Código de implementación

### Servicio Stripe (backend)

```typescript
// src/modules/pagos/stripe.service.ts
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private config: ConfigService) {
    this.stripe = new Stripe(config.get('STRIPE_SECRET_KEY')!);
  }

  // Crear customer en Stripe (una vez por empresa/contador)
  async crearCustomer(email: string, nombre: string): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      name: nombre,
      metadata: { source: 'e-ncf' },
    });
    return customer.id;
  }

  // Crear SetupIntent para guardar tarjeta
  async crearSetupIntent(customerId: string): Promise<string> {
    const setup = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    return setup.client_secret!;
  }

  // Cobrar monto a tarjeta guardada
  async cobrar(params: {
    customerId: string;
    paymentMethodId: string;
    monto: number; // en centavos (RD$ 1,990 = 199000)
    descripcion: string;
    facturaId: string;
  }): Promise<{ exitoso: boolean; paymentIntentId?: string; error?: string }> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: params.monto,
        currency: 'dop', // Pesos dominicanos
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        confirm: true, // Cobra inmediatamente
        off_session: true, // Sin intervención del usuario
        description: params.descripcion,
        metadata: { factura_id: params.facturaId },
      });

      if (intent.status === 'succeeded') {
        return { exitoso: true, paymentIntentId: intent.id };
      }

      return { exitoso: false, error: `Estado: ${intent.status}` };
    } catch (err: any) {
      return { exitoso: false, error: err.message };
    }
  }
}
```

### Endpoints

```typescript
// src/modules/pagos/pagos.controller.ts

// POST /api/v1/pagos/setup - Obtener client_secret para guardar tarjeta
@Post('setup')
async setup(@CurrentUser() user) {
  // Crear customer en Stripe si no existe
  // Crear SetupIntent
  // Retornar client_secret
}

// POST /api/v1/pagos/confirmar - Confirmar que la tarjeta se guardó
@Post('confirmar')
async confirmar(@Body() body: { payment_method_id: string }) {
  // Guardar payment_method_id en la empresa/contador
  // Activar pago_automatico = true
}

// GET /api/v1/pagos/metodo - Ver método de pago actual
@Get('metodo')
async metodo(@CurrentUser() user) {
  // Retornar últimos 4 dígitos, marca, vencimiento
}

// DELETE /api/v1/pagos/metodo - Eliminar método de pago
@Delete('metodo')
async eliminar(@CurrentUser() user) {
  // Desactivar pago automático
}
```

### Cron actualizado

```typescript
// En el cron de facturación mensual, después de generar la factura:

if (empresa.pago_automatico && empresa.stripe_payment_method_id) {
  const resultado = await stripeService.cobrar({
    customerId: empresa.stripe_customer_id,
    paymentMethodId: empresa.stripe_payment_method_id,
    monto: Math.round(factura.total * 100), // Centavos
    descripcion: `e-NCF Plan ${periodo}`,
    facturaId: factura.id,
  });

  if (resultado.exitoso) {
    factura.estado = 'pagada';
    factura.stripe_payment_intent_id = resultado.paymentIntentId;
    factura.pagada_en = new Date();
  }
  // Si falla, queda pendiente → reintento día 3 → suspensión día 5
}
```

### Frontend (formulario de tarjeta)

```tsx
// Componente React usando Stripe Elements
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe('pk_test_...');

function PagoForm() {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async () => {
    // 1. Obtener client_secret del backend
    const res = await fetch('/api/v1/pagos/setup', { method: 'POST', headers });
    const { client_secret } = await res.json();

    // 2. Confirmar setup con Stripe.js
    const { setupIntent, error } = await stripe.confirmCardSetup(client_secret, {
      payment_method: { card: elements.getElement(CardElement) },
    });

    if (setupIntent) {
      // 3. Guardar en backend
      await fetch('/api/v1/pagos/confirmar', {
        method: 'POST',
        headers,
        body: JSON.stringify({ payment_method_id: setupIntent.payment_method }),
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardElement />
      <button>Guardar tarjeta</button>
    </form>
  );
}
```

---

## Parte 6: Webhook de Stripe

Stripe envía eventos a tu servidor cuando algo pasa:

```typescript
// POST /api/v1/webhooks/stripe
@Post('stripe')
async webhook(@Req() req) {
  const event = stripe.webhooks.constructEvent(
    req.rawBody, req.headers['stripe-signature'], WEBHOOK_SECRET
  );

  switch (event.type) {
    case 'payment_intent.succeeded':
      // Marcar factura como pagada
      break;
    case 'payment_intent.payment_failed':
      // Enviar email: "No pudimos cobrar"
      break;
    case 'customer.subscription.deleted':
      // Cliente canceló (si usas suscripciones)
      break;
  }
}
```

Configurar en Stripe Dashboard → **Developers** → **Webhooks** → Add endpoint:
- URL: `https://tudominio.com/api/v1/webhooks/stripe`
- Eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`

---

## Parte 7: Testing

### Tarjetas de prueba de Stripe:

| Número | Resultado |
|--------|-----------|
| 4242 4242 4242 4242 | Pago exitoso |
| 4000 0000 0000 0002 | Tarjeta rechazada |
| 4000 0000 0000 3220 | Requiere autenticación 3D Secure |

Usa cualquier fecha futura y CVC de 3 dígitos.

---

## Parte 8: Costos

| Concepto | Costo |
|----------|-------|
| Cuenta Stripe | Gratis |
| Comisión por cobro exitoso | 2.9% + US$0.30 (tarjetas US), ~4.5% (tarjetas LATAM) |
| Cobros fallidos | $0 (no cobran si no se procesa) |
| Suscripciones (Stripe Billing) | +0.5% si usas invoices de Stripe |
| Disputas (chargeback) | US$15 por disputa |

**Ejemplo:** Cobras RD$ 1,990/mes (~US$33)
- Comisión Stripe: ~US$1.25 (3.8% promedio LATAM)
- Te queda: ~US$31.75

---

## Resumen de pasos

1. ✅ Crear cuenta en stripe.com (5 min)
2. ✅ Obtener API keys (1 min)
3. ✅ Instalar `npm install stripe @stripe/stripe-js @stripe/react-stripe-js`
4. ✅ Crear StripeService en backend
5. ✅ Crear endpoints de pagos (setup, confirmar, método)
6. ✅ Crear formulario de tarjeta en frontend
7. ✅ Actualizar cron para cobrar automáticamente
8. ✅ Configurar webhook
9. ✅ Probar con tarjetas de test
10. ✅ Activar cuenta real y cambiar a keys live
