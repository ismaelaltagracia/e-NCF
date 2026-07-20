import './Documentacion.css';

function Documentacion() {
  return (
    <div className="doc-page">
      {/* Header */}
      <header className="doc-header">
        <h1>Guía de Integración API</h1>
        <p className="doc-subtitle">Conecte su sistema de facturación en minutos</p>
        <div className="doc-callout">
          <span className="callout-icon">🆓</span>
          Durante el proceso de certificación <strong>NO paga mensualidad</strong> y las facturas de prueba{' '}
          <strong>NO tienen validez fiscal ante la DGII</strong>. Solo se cobra a partir de que pase a producción.
        </div>
      </header>

      {/* Section 1: Flujo General */}
      <section className="doc-section">
        <h2>1. Flujo General</h2>
        <div className="doc-timeline">
          <div className="doc-step">
            <span className="doc-step-number">1</span>
            Registro
          </div>
          <span className="doc-step-arrow">→</span>
          <div className="doc-step">
            <span className="doc-step-number">2</span>
            Certificado
          </div>
          <span className="doc-step-arrow">→</span>
          <div className="doc-step">
            <span className="doc-step-number">3</span>
            Pruebas DGII
          </div>
          <span className="doc-step-arrow">→</span>
          <div className="doc-step">
            <span className="doc-step-number">4</span>
            Producción
          </div>
        </div>
      </section>

      {/* Section 2: Primeros Pasos */}
      <section className="doc-section">
        <h2>2. Primeros Pasos</h2>
        <ul className="doc-list">
          <li>Registrarse en la plataforma web</li>
          <li>Seleccionar plan con integración API</li>
          <li>Subir certificado digital (.p12)</li>
          <li>Crear API Key desde el panel de configuración</li>
        </ul>
        <div className="doc-note">
          <strong>Nota:</strong> La API Key se muestra una sola vez al momento de crearla. Guárdela en un lugar seguro.
        </div>
      </section>

      {/* Section 3: Endpoints */}
      <section className="doc-section">
        <h2>3. Endpoints de la API</h2>
        <p>Todos los endpoints requieren el header <code>X-API-Key</code> con su clave.</p>

        {/* Endpoint 1 */}
        <div className="doc-endpoint">
          <div className="doc-endpoint-header">
            <span className="doc-endpoint-method post">POST</span>
            <span className="doc-endpoint-path">/api/v1/facturas</span>
            <span className="doc-endpoint-desc">Crear factura</span>
          </div>
          <pre className="doc-code">{`{
  "tipo_comprobante": "E31",
  "comprador": {
    "rnc": "130000001",
    "razon_social": "Empresa Cliente SRL",
    "direccion": "Av. Principal #100, Santo Domingo"
  },
  "items": [
    {
      "descripcion": "Servicio de consultoría",
      "cantidad": 1,
      "precio_unitario": 5000.00,
      "itbis": 18
    }
  ]
}`}</pre>
        </div>

        {/* Endpoint 2 */}
        <div className="doc-endpoint">
          <div className="doc-endpoint-header">
            <span className="doc-endpoint-method get">GET</span>
            <span className="doc-endpoint-path">/api/v1/facturas/:id/estado</span>
            <span className="doc-endpoint-desc">Consultar estado</span>
          </div>
          <pre className="doc-code">{`{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "estado": "aceptada",
  "track_id": "DGII-2024-00001234",
  "fecha_respuesta": "2024-01-15T10:30:00Z"
}`}</pre>
        </div>

        {/* Endpoint 3 */}
        <div className="doc-endpoint">
          <div className="doc-endpoint-header">
            <span className="doc-endpoint-method get">GET</span>
            <span className="doc-endpoint-path">/api/v1/facturas/:id/pdf</span>
            <span className="doc-endpoint-desc">Descargar PDF</span>
          </div>
          <pre className="doc-code">{`// Respuesta: archivo PDF (application/pdf)
// Headers de respuesta:
// Content-Type: application/pdf
// Content-Disposition: attachment; filename="E310010100000001.pdf"`}</pre>
        </div>

        {/* Endpoint 4 */}
        <div className="doc-endpoint">
          <div className="doc-endpoint-header">
            <span className="doc-endpoint-method post">POST</span>
            <span className="doc-endpoint-path">/api/v1/facturas/:id/anular</span>
            <span className="doc-endpoint-desc">Anular factura</span>
          </div>
          <pre className="doc-code">{`{
  "motivo": "Error en datos del comprador"
}

// Respuesta:
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "estado": "anulada",
  "fecha_anulacion": "2024-01-15T14:00:00Z"
}`}</pre>
        </div>

        {/* Endpoint 5 */}
        <div className="doc-endpoint">
          <div className="doc-endpoint-header">
            <span className="doc-endpoint-method get">GET</span>
            <span className="doc-endpoint-path">/api/v1/rnc/:rnc/validar</span>
            <span className="doc-endpoint-desc">Validar RNC</span>
          </div>
          <pre className="doc-code">{`// GET /api/v1/rnc/130000001/validar

{
  "rnc": "130000001",
  "valido": true,
  "razon_social": "Empresa Ejemplo SRL",
  "nombre_comercial": "Empresa Ejemplo",
  "estado": "ACTIVO"
}`}</pre>
        </div>
      </section>

      {/* Section 4: Ejemplo Completo */}
      <section className="doc-section">
        <h2>4. Ejemplo Completo</h2>
        <p>Factura de Crédito Fiscal (E31) con múltiples ítems:</p>

        <h3>Request</h3>
        <pre className="doc-code">{`POST /api/v1/facturas
X-API-Key: sk_live_abc123...
Content-Type: application/json

{
  "tipo_comprobante": "E31",
  "fecha_emision": "2024-01-15",
  "fecha_vencimiento": "2024-02-15",
  "comprador": {
    "rnc": "131234567",
    "razon_social": "Distribuidora Nacional SRL",
    "direccion": "Calle El Conde #45, Zona Colonial, Santo Domingo",
    "contacto": "Juan Pérez",
    "email": "juan@distribuidora.com.do"
  },
  "items": [
    {
      "descripcion": "Laptop HP ProBook 450",
      "cantidad": 5,
      "precio_unitario": 45000.00,
      "itbis": 18
    },
    {
      "descripcion": "Mouse inalámbrico",
      "cantidad": 5,
      "precio_unitario": 800.00,
      "itbis": 18
    },
    {
      "descripcion": "Instalación y configuración",
      "cantidad": 1,
      "precio_unitario": 15000.00,
      "itbis": 18
    }
  ],
  "forma_pago": "credito",
  "plazo_credito": 30
}`}</pre>

        <h3>Response (201 Created)</h3>
        <pre className="doc-code">{`{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "ncf": "E310010100000001",
  "tipo_comprobante": "E31",
  "estado": "enviada",
  "fecha_emision": "2024-01-15",
  "comprador": {
    "rnc": "131234567",
    "razon_social": "Distribuidora Nacional SRL"
  },
  "totales": {
    "subtotal": 244000.00,
    "itbis": 43920.00,
    "total": 287920.00
  },
  "track_id": "DGII-2024-00001234",
  "created_at": "2024-01-15T08:30:00Z"
}`}</pre>
      </section>

      {/* Section 5: Notas de Crédito/Débito */}
      <section className="doc-section">
        <h2>5. Notas de Crédito y Débito</h2>
        <p>
          Las notas de crédito (E33) y débito (E34) requieren hacer referencia a la factura original.
          Utilice el campo <code>informacion_referencia</code> para indicar el NCF que se está afectando.
        </p>

        <h3>Ejemplo: Nota de Crédito</h3>
        <pre className="doc-code">{`POST /api/v1/facturas
X-API-Key: sk_live_abc123...

{
  "tipo_comprobante": "E33",
  "comprador": {
    "rnc": "131234567",
    "razon_social": "Distribuidora Nacional SRL",
    "direccion": "Calle El Conde #45, Santo Domingo"
  },
  "informacion_referencia": {
    "ncf_referencia": "E310010100000001",
    "fecha_ncf_referencia": "2024-01-15",
    "motivo": "Devolución parcial de mercancía"
  },
  "items": [
    {
      "descripcion": "Mouse inalámbrico (devolución)",
      "cantidad": 3,
      "precio_unitario": 800.00,
      "itbis": 18
    }
  ]
}`}</pre>
        <div className="doc-note">
          <strong>Importante:</strong> El NCF de referencia debe corresponder a una factura válida y aceptada por la DGII.
        </div>
      </section>

      {/* Section 6: Ciclo de Certificación */}
      <section className="doc-section">
        <h2>6. Ciclo de Certificación DGII</h2>
        <p>
          La DGII requiere completar 15 pruebas para obtener la autorización de facturación electrónica.
          La plataforma rastrea su progreso automáticamente.
        </p>

        <div className="doc-table-wrapper">
          <table className="doc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Prueba</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Factura de Crédito Fiscal</td><td>e-CF tipo E31 básico</td></tr>
              <tr><td>2</td><td>Factura de Crédito Fiscal</td><td>e-CF tipo E31 con múltiples ítems</td></tr>
              <tr><td>3</td><td>Factura de Crédito Fiscal</td><td>e-CF tipo E31 con descuentos</td></tr>
              <tr><td>4</td><td>Factura de Consumo</td><td>e-CF tipo E32 (consumidor final)</td></tr>
              <tr><td>5</td><td>Factura de Consumo</td><td>e-CF tipo E32 con múltiples ítems</td></tr>
              <tr><td>6</td><td>Nota de Crédito</td><td>e-CF tipo E33 referenciando prueba 1</td></tr>
              <tr><td>7</td><td>Nota de Débito</td><td>e-CF tipo E34 referenciando prueba 1</td></tr>
              <tr><td>8</td><td>Compras</td><td>e-CF tipo E41</td></tr>
              <tr><td>9</td><td>Gastos Menores</td><td>e-CF tipo E43</td></tr>
              <tr><td>10</td><td>Régimen Especial</td><td>e-CF tipo E44</td></tr>
              <tr><td>11</td><td>Gubernamental</td><td>e-CF tipo E45</td></tr>
              <tr><td>12</td><td>Exportaciones</td><td>e-CF tipo E46</td></tr>
              <tr><td>13</td><td>Anulación</td><td>Anular un e-CF previamente emitido</td></tr>
              <tr><td>14</td><td>Consulta de Estado</td><td>Verificar estado de un e-CF</td></tr>
              <tr><td>15</td><td>Aprobación Comercial</td><td>Aprobar/rechazar un e-CF recibido</td></tr>
            </tbody>
          </table>
        </div>

        <div className="doc-note">
          <strong>Progreso automático:</strong> La plataforma detecta y marca cada prueba completada.
          Puede ver su avance en <a href="/app/certificacion">/app/certificacion</a> (requiere iniciar sesión).
        </div>
      </section>

      {/* Section 7: De Certificación a Producción */}
      <section className="doc-section">
        <h2>7. De Certificación a Producción</h2>
        <p>Una vez completadas las 15 pruebas y aprobado por la DGII:</p>
        <ul className="doc-list">
          <li><strong>No cambia nada en su código.</strong> Los mismos endpoints funcionan igual.</li>
          <li>La plataforma cambia automáticamente los endpoints internos hacia la DGII.</li>
          <li>Comienza a pagar la suscripción de su plan seleccionado.</li>
          <li>Las facturas ahora tienen validez fiscal real ante la DGII.</li>
        </ul>
        <div className="doc-note">
          <strong>Transición transparente:</strong> Su integración no requiere cambios. Solo la plataforma
          redirige internamente de los servidores de prueba a los de producción de la DGII.
        </div>
      </section>

      {/* Section 8: Tipos de Comprobante */}
      <section className="doc-section">
        <h2>8. Tipos de Comprobante</h2>
        <div className="doc-table-wrapper">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Uso</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code>E31</code></td><td>Factura de Crédito Fiscal</td><td>Ventas a contribuyentes (con RNC)</td></tr>
              <tr><td><code>E32</code></td><td>Factura de Consumo</td><td>Ventas a consumidores finales</td></tr>
              <tr><td><code>E33</code></td><td>Nota de Crédito</td><td>Corrección o devolución (reduce monto)</td></tr>
              <tr><td><code>E34</code></td><td>Nota de Débito</td><td>Cargos adicionales (aumenta monto)</td></tr>
              <tr><td><code>E41</code></td><td>Compras</td><td>Registrar compras realizadas</td></tr>
              <tr><td><code>E43</code></td><td>Gastos Menores</td><td>Gastos sin comprobante formal</td></tr>
              <tr><td><code>E44</code></td><td>Régimen Especial de Tributación</td><td>Zonas francas, incentivos fiscales</td></tr>
              <tr><td><code>E45</code></td><td>Gubernamental</td><td>Ventas al gobierno</td></tr>
              <tr><td><code>E46</code></td><td>Exportaciones</td><td>Ventas al exterior</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 9: Códigos de Error */}
      <section className="doc-section">
        <h2>9. Códigos de Error</h2>
        <div className="doc-table-wrapper">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Mensaje</th>
                <th>Solución</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code>400</code></td><td>Datos de factura inválidos</td><td>Revise el formato del JSON y campos requeridos</td></tr>
              <tr><td><code>401</code></td><td>API Key inválida o expirada</td><td>Verifique su X-API-Key o genere una nueva</td></tr>
              <tr><td><code>403</code></td><td>Plan no permite API</td><td>Actualice su plan a uno con integración API</td></tr>
              <tr><td><code>404</code></td><td>Factura no encontrada</td><td>Verifique el ID de la factura</td></tr>
              <tr><td><code>409</code></td><td>Factura ya fue anulada</td><td>No se puede anular una factura ya anulada</td></tr>
              <tr><td><code>422</code></td><td>RNC inválido</td><td>Verifique que el RNC sea válido y esté activo</td></tr>
              <tr><td><code>422</code></td><td>Certificado digital vencido</td><td>Suba un nuevo certificado .p12 vigente</td></tr>
              <tr><td><code>429</code></td><td>Demasiadas solicitudes</td><td>Espere un momento, está excediendo el rate limit</td></tr>
              <tr><td><code>500</code></td><td>Error interno</td><td>Reintente en unos segundos. Si persiste, contacte soporte</td></tr>
              <tr><td><code>502</code></td><td>DGII no disponible</td><td>Los servidores de la DGII no responden. Reintente más tarde</td></tr>
            </tbody>
          </table>
        </div>
        <div className="doc-note">
          <strong>Tip:</strong> Todos los errores retornan un JSON con la estructura:{' '}
          <code>{`{ "statusCode": 400, "message": "detalle", "error": "Bad Request" }`}</code>
        </div>
      </section>
    </div>
  );
}

export default Documentacion;
