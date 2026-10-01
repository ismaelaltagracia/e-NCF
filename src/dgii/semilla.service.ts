import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getCorrelationId } from '../common/interceptors/correlation-id.interceptor.js';

const TIMEOUT_MS = 10_000;

/**
 * Servicio de solicitud de la semilla de autenticación de la DGII.
 *
 * La semilla es un XML plano que se obtiene por GET al endpoint REST de
 * autenticación; luego se firma con el certificado de la empresa y se envía de
 * vuelta para obtener el token (ver DgiiTokenService). No usa SOAP.
 */
@Injectable()
export class SemillaService {
  private readonly logger = new Logger(SemillaService.name);
  private readonly semillaUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.semillaUrl = this.configService.get<string>(
      'DGII_SEMILLA_URL',
      'https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/Semilla',
    );
  }

  /**
   * Devuelve la URL de la semilla según el ambiente. En producción se usa el
   * segmento de ruta "eCF" en lugar de "CerteCF".
   */
  private getDgiiSemillaUrl(ambiente?: string): string {
    if (ambiente === 'produccion') {
      return this.semillaUrl.replace('/CerteCF/', '/eCF/');
    }
    return this.semillaUrl;
  }

  /**
   * Solicita la semilla XML al endpoint REST de la DGII mediante GET.
   * @param ambiente - Ambiente de la empresa ('certificacion' | 'produccion')
   * @returns El XML de la semilla.
   * @throws ServiceUnavailableException si el endpoint es inalcanzable, timeout o respuesta no-200.
   * @throws BadGatewayException si la respuesta no es XML bien formado.
   */
  async solicitarSemilla(ambiente?: string): Promise<string> {
    const correlationId = getCorrelationId() ?? 'no-correlation';

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      response = await fetch(this.getDgiiSemillaUrl(ambiente), {
        method: 'GET',
        headers: {
          Accept: 'application/xml',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error solicitando semilla DGII: ${message}`,
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new ServiceUnavailableException(
        `No se pudo contactar al servicio de semilla DGII: ${message}`,
      );
    }

    if (!response.ok) {
      this.logger.error(
        `DGII semilla respondió con HTTP ${response.status}`,
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new ServiceUnavailableException(
        `El servicio de semilla DGII respondió con estado HTTP ${response.status}`,
      );
    }

    const body = await response.text();

    this.validarXml(body, correlationId);

    return body;
  }

  /**
   * Valida que el cuerpo de la respuesta sea XML bien formado y contenga el
   * elemento raíz esperado de la semilla (<SemillaModel> o similar).
   */
  private validarXml(xml: string, correlationId: string): void {
    const trimmed = xml.trim();
    if (!trimmed.startsWith('<')) {
      this.logger.error(
        'Respuesta DGII no es XML: no inicia con "<"',
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new BadGatewayException(
        'La respuesta de la DGII no es un documento XML válido',
      );
    }

    if (!this.esXmlBienFormado(trimmed)) {
      this.logger.error(
        'Respuesta DGII no es XML bien formado',
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new BadGatewayException(
        'La respuesta de la DGII no es un documento XML bien formado',
      );
    }
  }

  /**
   * Verifica que el XML es bien formado (tags balanceados).
   */
  private esXmlBienFormado(xml: string): boolean {
    try {
      const tagStack: string[] = [];
      const tagRegex =
        /<\/?([a-zA-Z_][\w:.-]*)((?:\s+[a-zA-Z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[^?]*\?>/g;
      let match: RegExpExecArray | null;

      while ((match = tagRegex.exec(xml)) !== null) {
        const fullMatch = match[0];
        if (fullMatch.startsWith('<?')) {
          continue;
        }
        const tagName = match[1];
        const isSelfClosing = match[3] === '/';
        const isClosing = fullMatch.startsWith('</');

        if (isSelfClosing) {
          continue;
        } else if (isClosing) {
          if (tagStack.length === 0 || tagStack[tagStack.length - 1] !== tagName) {
            return false;
          }
          tagStack.pop();
        } else {
          tagStack.push(tagName);
        }
      }

      return tagStack.length === 0;
    } catch {
      return false;
    }
  }
}
