import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, BadGatewayException } from '@nestjs/common';
import { SemillaService } from './semilla.service.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SemillaService', () => {
  let service: SemillaService;
  let module: TestingModule;

  const VALID_SOAP_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SemillaOutput xmlns="urn:dgii.gov.do:ecf:remision:2019">
      <valor>abc123semilla</valor>
    </SemillaOutput>
  </soap:Body>
</soap:Envelope>`;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        SemillaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'DGII_SEMILLA_URL') {
                return 'https://ecf.dgii.gov.do/CerteCF/WSCertificacion.asmx';
              }
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SemillaService>(SemillaService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('solicitarSemilla', () => {
    it('should return XML content on successful SOAP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(VALID_SOAP_RESPONSE),
      });

      const result = await service.solicitarSemilla();

      expect(result).toBe(VALID_SOAP_RESPONSE);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ecf.dgii.gov.do/CerteCF/WSCertificacion.asmx',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'text/xml; charset=utf-8',
          }),
        }),
      );
    });

    it('should send correct SOAP envelope in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(VALID_SOAP_RESPONSE),
      });

      await service.solicitarSemilla();

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.body).toContain('soap:Envelope');
      expect(callArgs.body).toContain('SemillaInput');
      expect(callArgs.body).toContain('urn:dgii.gov.do:ecf:remision:2019');
    });

    it('should include SOAPAction header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(VALID_SOAP_RESPONSE),
      });

      await service.solicitarSemilla();

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers.SOAPAction).toBe(
        '"urn:dgii.gov.do:ecf:remision:2019/GetSemilla"',
      );
    });

    it('should use AbortController with 10s timeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(VALID_SOAP_RESPONSE),
      });

      await service.solicitarSemilla();

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.signal).toBeDefined();
      expect(callArgs.signal).toBeInstanceOf(AbortSignal);
    });

    describe('503 ServiceUnavailableException - network/timeout errors', () => {
      it('should throw 503 when fetch throws network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await expect(service.solicitarSemilla()).rejects.toThrow(
          ServiceUnavailableException,
        );
      });

      it('should throw 503 when request times out (AbortError)', async () => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        mockFetch.mockRejectedValueOnce(abortError);

        await expect(service.solicitarSemilla()).rejects.toThrow(
          ServiceUnavailableException,
        );
      });

      it('should throw 503 when DGII returns non-200 status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        });

        await expect(service.solicitarSemilla()).rejects.toThrow(
          ServiceUnavailableException,
        );
      });

      it('should throw 503 when DGII returns 404', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not Found'),
        });

        await expect(service.solicitarSemilla()).rejects.toThrow(
          ServiceUnavailableException,
        );
      });

      it('should include error message in 503 exception', async () => {
        mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

        await expect(service.solicitarSemilla()).rejects.toThrow(
          /No se pudo contactar al servicio de semilla DGII/,
        );
      });
    });

    describe('502 BadGatewayException - malformed response', () => {
      it('should throw 502 when response is not XML (plain text)', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('This is not XML at all'),
        });

        await expect(service.solicitarSemilla()).rejects.toThrow(
          BadGatewayException,
        );
      });

      it('should throw 502 when response is empty', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
        });

        await expect(service.solicitarSemilla()).rejects.toThrow(
          BadGatewayException,
        );
      });

      it('should throw 502 when XML is malformed (unclosed tags)', async () => {
        const malformedXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Unclosed>`;

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(malformedXml),
        });

        await expect(service.solicitarSemilla()).rejects.toThrow(
          BadGatewayException,
        );
      });

      it('should throw 502 when XML lacks expected root element (no Envelope)', async () => {
        const noEnvelopeXml = `<?xml version="1.0" encoding="utf-8"?>
<html>
  <body>
    <p>Service unavailable</p>
  </body>
</html>`;

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(noEnvelopeXml),
        });

        await expect(service.solicitarSemilla()).rejects.toThrow(
          BadGatewayException,
        );
      });

      it('should throw 502 when response is JSON instead of XML', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"error": "something went wrong"}'),
        });

        await expect(service.solicitarSemilla()).rejects.toThrow(
          BadGatewayException,
        );
      });

      it('should accept response with namespace variant (s:Envelope)', async () => {
        const variantXml = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <SemillaOutput xmlns="urn:dgii.gov.do:ecf:remision:2019">
      <valor>xyz789</valor>
    </SemillaOutput>
  </s:Body>
</s:Envelope>`;

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(variantXml),
        });

        const result = await service.solicitarSemilla();
        expect(result).toBe(variantXml);
      });

      it('should accept response with soapenv:Envelope namespace', async () => {
        const soapenvXml = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <SemillaOutput xmlns="urn:dgii.gov.do:ecf:remision:2019">
      <valor>seed456</valor>
    </SemillaOutput>
  </soapenv:Body>
</soapenv:Envelope>`;

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(soapenvXml),
        });

        const result = await service.solicitarSemilla();
        expect(result).toBe(soapenvXml);
      });
    });

    describe('configuration', () => {
      it('should use DGII_SEMILLA_URL from config', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(VALID_SOAP_RESPONSE),
        });

        await service.solicitarSemilla();

        expect(mockFetch).toHaveBeenCalledWith(
          'https://ecf.dgii.gov.do/CerteCF/WSCertificacion.asmx',
          expect.anything(),
        );
      });
    });
  });
});
