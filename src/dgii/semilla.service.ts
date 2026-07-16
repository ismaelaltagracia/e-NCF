import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getCorrelationId } from '../common/interceptors/correlation-id.interceptor.js';

const SOAP_ENVELOPE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SemillaInput xmlns="urn:dgii.gov.do:ecf:remision:2019" />
  </soap:Body>
</soap:Envelope>`;

const TIMEOUT_MS = 10_000;

@Injectable()
export class SemillaService {
  private readonly logger = new Logger(SemillaService.name);
  private readonly semillaUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.semillaUrl = this.configService.get<string>(
      'DGII_SEMILLA_URL',
      'https://ecf.dgii.gov.do/CerteCF/WSCertificacion.asmx',
    );
  }

  /**
   * Solicita una semilla XML al endpoint SOAP de la DGII.
   * @returns El contenido XML completo de la respuesta SOAP con la semilla.
   * @throws ServiceUnavailableException si el endpoint es inalcanzable, timeout o respuesta no-200.
   * @throws BadGatewayException si la respuesta no es XML bien formado o falta el elemento raíz esperado.
   */
  async solicitarSemilla(): Promise<string> {
    const correlationId = getCorrelationId() ?? 'no-correlation';

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      response = await fetch(this.semillaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"urn:dgii.gov.do:ecf:remision:2019/GetSemilla"',
        },
        body: SOAP_ENVELOPE,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
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
   * Valida que el cuerpo de la respuesta sea XML bien formado y contenga
   * el elemento raíz esperado (soap:Envelope con contenido de semilla).
   */
  private validarXml(xml: string, correlationId: string): void {
    // Verificar que es XML bien formado: debe tener declaración XML o iniciar con '<'
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

    // Verificar estructura XML básica: tags balanceados y bien formados
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

    // Verificar elemento raíz esperado: soap:Envelope o Envelope
    if (!this.contieneElementoRaizEsperado(trimmed)) {
      this.logger.error(
        'Respuesta DGII no contiene el elemento raíz esperado (soap:Envelope)',
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new BadGatewayException(
        'La respuesta de la DGII no contiene el elemento raíz esperado',
      );
    }
  }

  /**
   * Verifica que el XML es bien formado usando validación básica de estructura.
   * Comprueba que los tags están correctamente anidados y cerrados.
   */
  private esXmlBienFormado(xml: string): boolean {
    try {
      // Check for basic XML structural validity
      const tagStack: string[] = [];
      // Match opening tags, closing tags, and self-closing tags
      const tagRegex =
        /<\/?([a-zA-Z_][\w:.-]*)((?:\s+[a-zA-Z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[^?]*\?>/g;
      let match: RegExpExecArray | null;

      while ((match = tagRegex.exec(xml)) !== null) {
        const fullMatch = match[0];

        // Skip processing instructions like <?xml ... ?>
        if (fullMatch.startsWith('<?')) {
          continue;
        }

        const tagName = match[1];
        const isSelfClosing = match[3] === '/';
        const isClosing = fullMatch.startsWith('</');

        if (isSelfClosing) {
          // Self-closing tags are fine, no stack change
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

  /**
   * Verifica que el XML contiene el elemento raíz esperado para una respuesta SOAP de semilla.
   * El elemento raíz debe ser soap:Envelope (o variante de namespace).
   */
  private contieneElementoRaizEsperado(xml: string): boolean {
    // Match soap:Envelope or variants like s:Envelope, soapenv:Envelope, or just Envelope with soap namespace
    const envelopePattern =
      /<(?:[a-zA-Z_][\w.-]*:)?Envelope[\s>]/i;
    return envelopePattern.test(xml);
  }
}
