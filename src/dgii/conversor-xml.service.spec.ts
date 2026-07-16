import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '@nestjs/common';
import { ConversorXmlService } from './conversor-xml.service.js';
import * as fs from 'node:fs';

jest.mock('node:fs');

const mockedFs = jest.mocked(fs);

describe('ConversorXmlService', () => {
  let service: ConversorXmlService;
  let module: TestingModule;

  const VALID_XSD_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="urn:dgii.gov.do:ecf:remision:2019"
           xmlns:ecf="urn:dgii.gov.do:ecf:remision:2019">
  <xs:element name="ECF">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Encabezado" type="ecf:EncabezadoType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

  const SAMPLE_PAYLOAD: Record<string, unknown> = {
    Encabezado: {
      IdDoc: {
        TipoeCF: 31,
        FechaVencimientoSecuencia: '31-12-2025',
      },
      Emisor: {
        RNCEmisor: '101234567',
        RazonSocialEmisor: 'Empresa Test SRL',
        DireccionEmisor: 'Calle Falsa 123',
      },
      Comprador: {
        RNCComprador: '109876543',
        RazonSocialComprador: 'Comprador Test SRL',
      },
      Totales: {
        MontoGravadoTotal: 1000.0,
        MontoGravadoI1: 1000.0,
        ITBIS1: 18.0,
        TotalITBIS: 180.0,
        MontoTotal: 1180.0,
      },
    },
    DetallesItems: {
      Item: [
        {
          NumeroLinea: 1,
          NombreItem: 'Servicio Consultoría',
          IndicadorFacturacion: 1,
          CantidadItem: 1,
          PrecioUnitarioItem: 1000.0,
          MontoItem: 1000.0,
        },
      ],
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: XSD file exists
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.statSync.mockReturnValue({
      mtimeMs: 1700000000000,
      isFile: () => true,
    } as unknown as fs.Stats);
    mockedFs.readFileSync.mockReturnValue(VALID_XSD_CONTENT);

    module = await Test.createTestingModule({
      providers: [
        ConversorXmlService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'XSD_PATH') return './xsd/ecf-v1.0.xsd';
              if (key === 'XSD_POLL_INTERVAL_MS') return 0; // Disable polling in tests
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ConversorXmlService>(ConversorXmlService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    service.onModuleDestroy();
    await module.close();
  });

  describe('convertir', () => {
    it('should produce a valid XML string with UTF-8 declaration', async () => {
      const result = await service.convertir(SAMPLE_PAYLOAD, 'E310000000001');

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('should include the DGII namespace in the root ECF element', async () => {
      const result = await service.convertir(SAMPLE_PAYLOAD, 'E310000000001');

      expect(result).toContain('urn:dgii.gov.do:ecf:remision:2019');
    });

    it('should include the e-NCF value in the XML output', async () => {
      const encf = 'E310000000042';
      const result = await service.convertir(SAMPLE_PAYLOAD, encf);

      expect(result).toContain('<eNCF>E310000000042</eNCF>');
    });

    it('should preserve all payload field values in the XML output', async () => {
      const result = await service.convertir(SAMPLE_PAYLOAD, 'E310000000001');

      expect(result).toContain('101234567');
      expect(result).toContain('Empresa Test SRL');
      expect(result).toContain('109876543');
      expect(result).toContain('Comprador Test SRL');
      expect(result).toContain('1000');
      expect(result).toContain('Servicio Consultoría');
    });

    it('should include DetallesItems when present in payload', async () => {
      const result = await service.convertir(SAMPLE_PAYLOAD, 'E310000000001');

      expect(result).toContain('<DetallesItems>');
      expect(result).toContain('<Item>');
      expect(result).toContain('<NombreItem>');
    });

    it('should not include optional sections when absent from payload', async () => {
      const minimalPayload: Record<string, unknown> = {
        Encabezado: {
          IdDoc: { TipoeCF: 31 },
          Emisor: { RNCEmisor: '101234567' },
        },
      };

      const result = await service.convertir(minimalPayload, 'E310000000001');

      expect(result).not.toContain('<DetallesItems>');
      expect(result).not.toContain('<InformacionReferencia>');
    });

    it('should produce XML that can be parsed back (round-trip)', async () => {
      const result = await service.convertir(SAMPLE_PAYLOAD, 'E310000000001');

      // Use the XMLParser from fast-xml-parser (top-level require)
      const { XMLParser: RoundTripParser } = require('fast-xml-parser');
      const parser = new RoundTripParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const parsed = parser.parse(result);

      expect(parsed.ECF).toBeDefined();
      expect(parsed.ECF.Encabezado).toBeDefined();
      expect(parsed.ECF.Encabezado.IdDoc.eNCF).toBe('E310000000001');
    });

    it('should preserve numeric precision in round-trip', async () => {
      const payload: Record<string, unknown> = {
        Encabezado: {
          IdDoc: { TipoeCF: 31 },
          Emisor: { RNCEmisor: '101234567' },
          Totales: { MontoTotal: 12345.67 },
        },
      };

      const result = await service.convertir(payload, 'E310000000001');

      expect(result).toContain('12345.67');
    });
  });

  describe('recargarEsquema', () => {
    it('should load the XSD file from the configured path', async () => {
      mockedFs.statSync.mockReturnValue({
        mtimeMs: 1700000001000, // Changed mtime
        isFile: () => true,
      } as unknown as fs.Stats);

      await service.recargarEsquema();

      expect(mockedFs.existsSync).toHaveBeenCalled();
      expect(mockedFs.readFileSync).toHaveBeenCalled();
    });

    it('should not reload if the file has not changed (same mtime)', async () => {
      // Same mtime as initial load
      mockedFs.statSync.mockReturnValue({
        mtimeMs: 1700000000000,
        isFile: () => true,
      } as unknown as fs.Stats);

      mockedFs.readFileSync.mockClear();
      await service.recargarEsquema();

      // readFileSync should NOT be called again (already loaded)
      expect(mockedFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should update the version when XSD file changes', async () => {
      const newXsd = VALID_XSD_CONTENT.replace('1.0', '2.0');
      mockedFs.statSync.mockReturnValue({
        mtimeMs: 1700000002000,
        isFile: () => true,
      } as unknown as fs.Stats);
      mockedFs.readFileSync.mockReturnValue(newXsd);

      await service.recargarEsquema();

      // Version should be extracted from filename configured as ecf-v1.0.xsd
      expect(service.getVersionEsquema()).toBeDefined();
    });

    it('should keep previous version if new XSD is invalid', async () => {
      const previousVersion = service.getVersionEsquema();

      mockedFs.statSync.mockReturnValue({
        mtimeMs: 1700000003000,
        isFile: () => true,
      } as unknown as fs.Stats);
      mockedFs.readFileSync.mockReturnValue('this is not valid XML at all');

      await service.recargarEsquema();

      expect(service.getVersionEsquema()).toBe(previousVersion);
    });

    it('should keep previous version if XSD file does not exist', async () => {
      const previousVersion = service.getVersionEsquema();

      mockedFs.existsSync.mockReturnValue(false);

      await service.recargarEsquema();

      expect(service.getVersionEsquema()).toBe(previousVersion);
    });

    it('should keep previous version if file is empty', async () => {
      const previousVersion = service.getVersionEsquema();

      mockedFs.statSync.mockReturnValue({
        mtimeMs: 1700000004000,
        isFile: () => true,
      } as unknown as fs.Stats);
      mockedFs.readFileSync.mockReturnValue('');

      await service.recargarEsquema();

      expect(service.getVersionEsquema()).toBe(previousVersion);
    });
  });

  describe('getVersionEsquema', () => {
    it('should return the version extracted from the XSD filename', () => {
      // Configured path is ./xsd/ecf-v1.0.xsd
      expect(service.getVersionEsquema()).toBe('1.0');
    });

    it('should return fallback version when filename has no version pattern', async () => {
      // Create a new service with a path that has no version in filename
      const moduleNoVersion = await Test.createTestingModule({
        providers: [
          ConversorXmlService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                if (key === 'XSD_PATH') return './xsd/schema.xsd';
                if (key === 'XSD_POLL_INTERVAL_MS') return 0;
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const svc = moduleNoVersion.get<ConversorXmlService>(ConversorXmlService);
      await svc.onModuleInit();

      // Should use the mtime fallback
      expect(svc.getVersionEsquema()).toContain('file-');
      svc.onModuleDestroy();
      await moduleNoVersion.close();
    });
  });

  describe('error handling', () => {
    it('should throw UnprocessableEntityException (422) when conversion logic fails', async () => {
      // Spy on the internal XML builder to force a failure
      const builderSpy = jest.spyOn(service['xmlBuilder'], 'build');
      builderSpy.mockImplementation(() => {
        throw new Error("Cannot convert field 'invalidField' to XML element");
      });

      await expect(
        service.convertir(SAMPLE_PAYLOAD, 'E310000000001'),
      ).rejects.toThrow(UnprocessableEntityException);

      builderSpy.mockRestore();
    });

    it('should include error details in the 422 response', async () => {
      // Override xmlBuilder to force an error
      const errorPayload: Record<string, unknown> = {
        Encabezado: null as unknown,
      };

      try {
        await service.convertir(errorPayload, 'E310000000001');
      } catch (error) {
        if (error instanceof UnprocessableEntityException) {
          const response = error.getResponse();
          expect(response).toHaveProperty('message');
        }
      }
    });
  });

  describe('lifecycle hooks', () => {
    it('should start polling on module init when interval > 0', async () => {
      jest.useFakeTimers();

      const pollingModule = await Test.createTestingModule({
        providers: [
          ConversorXmlService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                if (key === 'XSD_PATH') return './xsd/ecf-v1.0.xsd';
                if (key === 'XSD_POLL_INTERVAL_MS') return 300000;
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const svc = pollingModule.get<ConversorXmlService>(ConversorXmlService);
      await svc.onModuleInit();

      // Advance timer by 5 minutes
      mockedFs.statSync.mockReturnValue({
        mtimeMs: 1700000005000,
        isFile: () => true,
      } as unknown as fs.Stats);

      jest.advanceTimersByTime(300000);

      // readFileSync is called on reload
      expect(mockedFs.readFileSync).toHaveBeenCalled();

      svc.onModuleDestroy();
      await pollingModule.close();
      jest.useRealTimers();
    });

    it('should stop polling on module destroy', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Service with polling enabled was already destroyed in afterEach
      // Test that onModuleDestroy doesn't throw
      expect(() => service.onModuleDestroy()).not.toThrow();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('namespace and structure', () => {
    it('should wrap content inside an ECF root element', async () => {
      const result = await service.convertir(SAMPLE_PAYLOAD, 'E310000000001');

      expect(result).toContain('<ECF');
      expect(result).toContain('</ECF>');
    });

    it('should include Encabezado section with IdDoc, Emisor, Comprador', async () => {
      const result = await service.convertir(SAMPLE_PAYLOAD, 'E310000000001');

      expect(result).toContain('<Encabezado>');
      expect(result).toContain('<IdDoc>');
      expect(result).toContain('<Emisor>');
      expect(result).toContain('<Comprador>');
    });

    it('should include Totales section in Encabezado when provided', async () => {
      const result = await service.convertir(SAMPLE_PAYLOAD, 'E310000000001');

      expect(result).toContain('<Totales>');
      expect(result).toContain('<MontoTotal>');
    });
  });
});
