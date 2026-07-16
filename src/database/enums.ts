/**
 * Enums compartidos para las entidades de la base de datos.
 * Reflejan los tipos de dominio del sistema e-NCF.
 */

export enum EstadoEmpresa {
  ACTIVO = 'activo',
  CERTIFICACION = 'certificacion',
  INACTIVO = 'inactivo',
}

export enum RolUsuario {
  ADMIN = 'admin',
  FACTURADOR = 'facturador',
  LECTOR = 'lector',
}

export enum ModoNcf {
  AUTOMATICO = 'automatico',
  MANUAL = 'manual',
}

export enum EstadoDgii {
  ENVIADO = 'enviado',
  ACEPTADO = 'aceptado',
  RECHAZADO = 'rechazado',
  REINTENTANDO = 'reintentando',
  FALLIDO = 'fallido',
  APROBADO = 'aprobado',
  RECHAZADO_DEFINITIVO = 'rechazado_definitivo',
  ANULADO = 'anulado',
}

export enum TipoComprobante {
  E31 = 'E31',
  E32 = 'E32',
  E33 = 'E33',
  E34 = 'E34',
  E41 = 'E41',
  E43 = 'E43',
  E44 = 'E44',
  E45 = 'E45',
}

export enum TipoCatalogo {
  PRODUCTO = 'producto',
  SERVICIO = 'servicio',
}

export enum EstadoToken {
  ACTIVO = 'activo',
  REVOCADO = 'revocado',
  EXPIRADO = 'expirado',
}
