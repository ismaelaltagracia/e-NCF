# Esquemas XSD de la DGII

Coloca aquí los esquemas XSD oficiales del formato e-CF de la DGII de República Dominicana.

## Archivo esperado

- `ecf.xsd` — esquema del e-CF (ruta configurable con `XSD_PATH`, por defecto `./xsd/ecf.xsd`).

## De dónde obtenerlo

Los XSD oficiales se descargan del portal de la DGII (sección de Facturación Electrónica / e-CF).
Descarga el paquete de esquemas correspondiente a la versión vigente del formato (p. ej. 1.0) y
copia el XSD principal del e-CF como `ecf.xsd` en este directorio.

## Comportamiento del sistema

- Si `ecf.xsd` está presente, `ConversorXmlService` lo carga al arrancar, lo versiona y verifica
  cambios periódicamente (polling). Se usa para validar el `targetNamespace` del XML generado.
- Si no está presente, el servicio arranca igualmente y aplica la validación estructural por reglas
  (elementos obligatorios, formato de e-NCF, formato numérico N.NN de montos y coherencia de totales),
  que es **bloqueante** antes de transmitir a la DGII.

> Importante: para producción, coloca el XSD oficial aquí y reconstruye la imagen Docker para que
> quede incluido en `/app/xsd/ecf.xsd`.
