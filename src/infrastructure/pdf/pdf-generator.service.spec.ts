import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PdfGeneratorService } from './pdf-generator.service.js';
import { QR_GENERATOR } from './qr-generator.interface.js';
import { STORAGE_PROVIDER } from '../storage/storage.interface.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;
  let mockQrGenerator: { generar: jest.Mock };
  let mockStorageProvider: { upload: jest.Mock };
  let mockFacturaRepository: { findOne: jest.Mock; update: jest.Mock };

  /**
   * Minimal valid 1x1 pixel PNG buffer for testing.
   * pdfkit requires a valid image format to embed in PDF.
   */
  const VALID_PNG_BUFFER = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  );

  const mockFactura: Partial<FacturaElectronica> = {
    id: 'factura-uuid-123',
    empresa_id: 'empresa-uuid-456',
    e_ncf: 'E310000000001',
    track_id: 'TRACK-123-456',
    payload_json: {
      rnc_receptor: '101000001',
      monto_total: 1500.0,
      itbis_total: 270.0,
      items: [
        {
          descripcion: 'Producto A',
          cantidad: 2,
          precio: 500,
          itbis: 180,
        },
        {
          descripcion: 'Producto B',
          cantidad: 1,
          precio: 230,
          itbis: 90,
        },
      ],
    },
    empresa: {
      id: 'empresa-uuid-456',
      rnc: '130000001',
      nombre: 'Mi Empresa SRL',
      formato_pdf: 'carta',
    } as any,
  };

  beforeEach(async () => {
    mockQrGenerator = {
      generar: jest.fn().mockResolvedValue(VALID_PNG_BUFFER),
    };

    mockStorageProvider = {
      upload: jest.fn().mockResolvedValue('https://s3.example.com/facturas-pdf/empresa-uuid-456/factura-uuid-123.pdf'),
    };

    mockFacturaRepository = {
      findOne: jest.fn().mockResolvedValue(mockFactura),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfGeneratorService,
        { provide: QR_GENERATOR, useValue: mockQrGenerator },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
        {
          provide: getRepositoryToken(FacturaElectronica),
          useValue: mockFacturaRepository,
        },
      ],
    }).compile();

    service = module.get<PdfGeneratorService>(PdfGeneratorService);
  });

  describe('generarFacturaPdf', () => {
    it('debe generar un PDF en formato carta', async () => {
      const result = await service.generarFacturaPdf(
        mockFactura as FacturaElectronica,
        'carta',
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      expect(result.toString('utf8', 0, 4)).toBe('%PDF');
    });

    it('debe generar un PDF en formato ticket', async () => {
      const result = await service.generarFacturaPdf(
        mockFactura as FacturaElectronica,
        'ticket',
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(result.toString('utf8', 0, 4)).toBe('%PDF');
    });

    it('debe llamar al generador de QR con los datos correctos', async () => {
      await service.generarFacturaPdf(mockFactura as FacturaElectronica, 'carta');

      expect(mockQrGenerator.generar).toHaveBeenCalledWith({
        url_dgii: 'https://dgii.gov.do/app/WebApps/ConsultaNCF/ConsultaNCF',
        rnc_emisor: '130000001',
        rnc_receptor: '101000001',
        encf: 'E310000000001',
        monto_total: '1500.00',
      });
    });

    it('debe manejar factura sin items', async () => {
      const facturaEmpty = {
        ...mockFactura,
        payload_json: { monto_total: 0 },
      };

      const result = await service.generarFacturaPdf(
        facturaEmpty as unknown as FacturaElectronica,
        'carta',
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString('utf8', 0, 4)).toBe('%PDF');
    });
  });

  describe('generarYSubirPdf', () => {
    it('debe generar el PDF, subirlo y actualizar la factura', async () => {
      await service.generarYSubirPdf('factura-uuid-123');

      expect(mockFacturaRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'factura-uuid-123' },
        relations: ['empresa'],
      });
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        'facturas-pdf',
        'empresa-uuid-456/factura-uuid-123.pdf',
        expect.any(Buffer),
        'application/pdf',
      );
      expect(mockFacturaRepository.update).toHaveBeenCalledWith('factura-uuid-123', {
        pdf_s3_url: 'https://s3.example.com/facturas-pdf/empresa-uuid-456/factura-uuid-123.pdf',
      });
    });

    it('debe usar formato carta por defecto cuando formato_pdf es null', async () => {
      const facturaNoFormat = {
        ...mockFactura,
        empresa: { ...mockFactura.empresa, formato_pdf: null },
      };
      mockFacturaRepository.findOne.mockResolvedValue(facturaNoFormat);

      await service.generarYSubirPdf('factura-uuid-123');

      expect(mockStorageProvider.upload).toHaveBeenCalled();
    });

    it('no debe hacer nada si la factura no existe', async () => {
      mockFacturaRepository.findOne.mockResolvedValue(null);

      await service.generarYSubirPdf('nonexistent-id');

      expect(mockStorageProvider.upload).not.toHaveBeenCalled();
      expect(mockFacturaRepository.update).not.toHaveBeenCalled();
    });

    it('debe reintentar la subida hasta 3 veces si falla', async () => {
      mockStorageProvider.upload
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce('https://s3.example.com/facturas-pdf/success.pdf');

      await service.generarYSubirPdf('factura-uuid-123');

      expect(mockStorageProvider.upload).toHaveBeenCalledTimes(3);
      expect(mockFacturaRepository.update).toHaveBeenCalledWith('factura-uuid-123', {
        pdf_s3_url: 'https://s3.example.com/facturas-pdf/success.pdf',
      });
    });

    it('debe lanzar error después de 3 intentos fallidos', async () => {
      mockStorageProvider.upload.mockRejectedValue(new Error('Persistent failure'));

      await expect(service.generarYSubirPdf('factura-uuid-123')).rejects.toThrow(
        'Fallo al subir PDF después de 3 intentos',
      );

      expect(mockStorageProvider.upload).toHaveBeenCalledTimes(3);
      expect(mockFacturaRepository.update).not.toHaveBeenCalled();
    });
  });
});
