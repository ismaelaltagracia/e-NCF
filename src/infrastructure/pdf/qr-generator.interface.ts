/**
 * Interfaz y tipos para la generación de códigos QR de e-NCF.
 *
 * @see Requisito 14.1, 14.2, 14.3, 14.4
 */

/**
 * Token de inyección de dependencias para el servicio de generación QR.
 */
export const QR_GENERATOR = Symbol('QR_GENERATOR');

/**
 * Payload con los datos necesarios para generar el QR de verificación DGII.
 */
export interface QrPayload {
  /** URL base de verificación DGII */
  url_dgii: string;
  /** RNC del emisor */
  rnc_emisor: string;
  /** RNC del receptor/comprador */
  rnc_receptor: string;
  /** Código e-NCF del comprobante */
  encf: string;
  /** Monto total formateado a 2 decimales, sin símbolo de moneda (ej: "1500.00") */
  monto_total: string;
}

/**
 * Interfaz para el servicio de generación de códigos QR.
 */
export interface IQrGeneratorService {
  /**
   * Genera un código QR en formato PNG a partir del payload de verificación DGII.
   *
   * @param data - Datos del comprobante para generar el QR
   * @returns Buffer PNG del código QR (mínimo 150x150 px, corrección nivel "M")
   */
  generar(data: QrPayload): Promise<Buffer>;
}
