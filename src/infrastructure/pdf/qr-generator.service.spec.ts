import { QrGeneratorService } from './qr-generator.service';
import { QrPayload } from './qr-generator.interface';

describe('QrGeneratorService', () => {
  let service: QrGeneratorService;

  beforeEach(() => {
    service = new QrGeneratorService();
  });

  const defaultPayload: QrPayload = {
    url_dgii:
      'https://dgii.gov.do/app/WebApps/ConsultaNCF/ConsultaNCF/Consultas/VerificaComprobantes.aspx',
    rnc_emisor: '101123456',
    rnc_receptor: '102654321',
    encf: 'E310000000001',
    monto_total: '1500.00',
  };

  describe('generar()', () => {
    it('debe retornar un Buffer', async () => {
      const result = await service.generar(defaultPayload);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('debe retornar un PNG válido (magic bytes)', async () => {
      const result = await service.generar(defaultPayload);
      // Los primeros 8 bytes de un PNG son: 137 80 78 71 13 10 26 10
      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(result.subarray(0, 8)).toEqual(pngSignature);
    });

    it('debe generar un PNG de al menos 150x150 px', async () => {
      const result = await service.generar(defaultPayload);
      // En PNG, el IHDR chunk contiene width (bytes 16-19) y height (bytes 20-23)
      const width = result.readUInt32BE(16);
      const height = result.readUInt32BE(20);
      expect(width).toBeGreaterThanOrEqual(150);
      expect(height).toBeGreaterThanOrEqual(150);
    });

    it('debe generar QR con diferentes montos formateados a 2 decimales', async () => {
      const payloads: QrPayload[] = [
        { ...defaultPayload, monto_total: '0.00' },
        { ...defaultPayload, monto_total: '99999.99' },
        { ...defaultPayload, monto_total: '1234.56' },
      ];

      for (const payload of payloads) {
        const result = await service.generar(payload);
        expect(Buffer.isBuffer(result)).toBe(true);
        // Validar que es PNG
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(result.subarray(0, 8)).toEqual(pngSignature);
      }
    });

    it('debe generar QR con diferentes RNC emisor y receptor', async () => {
      const payload: QrPayload = {
        ...defaultPayload,
        rnc_emisor: '999888777',
        rnc_receptor: '111222333',
        encf: 'E320000000099',
      };

      const result = await service.generar(payload);
      expect(Buffer.isBuffer(result)).toBe(true);
      const width = result.readUInt32BE(16);
      const height = result.readUInt32BE(20);
      expect(width).toBeGreaterThanOrEqual(150);
      expect(height).toBeGreaterThanOrEqual(150);
    });
  });
});
