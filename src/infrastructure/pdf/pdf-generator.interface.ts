import { type FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';

/**
 * Token de inyección de dependencias para el servicio de generación de PDF.
 */
export const PDF_GENERATOR = Symbol('PDF_GENERATOR');

/**
 * Interfaz para el servicio de generación de PDFs de facturas electrónicas.
 *
 * @see Requisito 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */
export interface IPdfGeneratorService {
  /**
   * Genera un PDF de factura electrónica en el formato especificado.
   *
   * @param factura - Entidad de factura electrónica con relación empresa cargada
   * @param formato - Formato del PDF: 'ticket' (80mm) o 'carta' (letter)
   * @returns Buffer con el contenido del PDF generado
   */
  generarFacturaPdf(factura: FacturaElectronica, formato: 'ticket' | 'carta'): Promise<Buffer>;

  /**
   * Genera el PDF y lo sube al almacenamiento de objetos (MinIO/S3).
   * Actualiza el campo pdf_s3_url en el registro de la factura.
   *
   * - Reintenta la subida hasta 3 veces si falla.
   * - Timeout de 30 segundos por intento de subida.
   *
   * @param facturaId - UUID de la factura electrónica
   */
  generarYSubirPdf(facturaId: string): Promise<void>;
}
