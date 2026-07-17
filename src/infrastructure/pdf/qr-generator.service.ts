import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { type IQrGeneratorService, type QrPayload } from './qr-generator.interface.js';

/**
 * Servicio para la generación de códigos QR de verificación DGII.
 *
 * Genera imágenes PNG con:
 * - Dimensión mínima: 150x150 px
 * - Nivel de corrección de errores: M (15%)
 * - Payload: URL de verificación DGII con parámetros del comprobante
 *
 * @see Requisito 14.1, 14.2, 14.3, 14.4
 */
@Injectable()
export class QrGeneratorService implements IQrGeneratorService {
  /**
   * Ancho mínimo del QR generado en píxeles.
   */
  private static readonly MIN_WIDTH = 150;

  /**
   * Nivel de corrección de errores del QR.
   * "M" permite recuperar ~15% de datos dañados.
   */
  private static readonly ERROR_CORRECTION_LEVEL = 'M';

  /**
   * Genera un código QR en formato PNG Buffer.
   *
   * El payload sigue el patrón de URL de verificación de la DGII:
   * `{url_dgii}?RncEmisor={rnc_emisor}&RncComprador={rnc_receptor}&ENCF={encf}&FechaEmision=&MontoTotal={monto_total}`
   *
   * @param data - Datos del comprobante electrónico
   * @returns Buffer con la imagen PNG del código QR
   */
  async generar(data: QrPayload): Promise<Buffer> {
    const payload = this.buildPayload(data);

    const pngBuffer = await QRCode.toBuffer(payload, {
      type: 'png',
      width: QrGeneratorService.MIN_WIDTH,
      errorCorrectionLevel: QrGeneratorService.ERROR_CORRECTION_LEVEL,
      margin: 1,
    });

    return pngBuffer;
  }

  /**
   * Construye la URL de verificación DGII con los parámetros del comprobante.
   */
  private buildPayload(data: QrPayload): string {
    return (
      `${data.url_dgii}?` +
      `RncEmisor=${data.rnc_emisor}&` +
      `RncComprador=${data.rnc_receptor}&` +
      `ENCF=${data.encf}&` +
      `FechaEmision=&` +
      `MontoTotal=${data.monto_total}`
    );
  }
}
