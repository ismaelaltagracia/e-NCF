import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';

import { FacturasService } from './facturas.service.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { SecuenciasNcfService } from '../secuencias-ncf/secuencias-ncf.service.js';
import { PlanesService } from '../planes/planes.service.js';
import { ConversorXmlService } from '../../dgii/conversor-xml.service.js';
import { FirmaService } from '../../dgii/firma.service.js';
import { TransmisionService } from '../../dgii/transmision.service.js';
import { RncValidatorService } from '../../dgii/rnc-validator.service.js';
import { STORAGE_PROVIDER } from '../../infrastructure/storage/storage.interface.js';
import { RETRY_QUEUE_SERVICE } from '../../infrastructure/queue/retry-queue.interfaces.js';
import { EstadoDgii, ModoNcf, TipoComprobante } from '../../database/enums.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import type { CreateFacturaDto } from './dto/factura.schemas.js';

describe('FacturasService', () => {
  let service: FacturasService;

  const mockEmpresa: Partial<Empresa> = {
    id: 'empresa-uuid-1',
    rnc: '123456789',
    nombre: 'Empresa Test',
    modo_ncf: ModoNcf.AUTOMATICO,
    validar_rnc_receptor: true,
  };

  const mockUser: RequestContext = {
    tipo: 'usuario',
    empresa_id: 'empresa-uuid-1',
    rnc: '123456789',
    usuario_id: 'user-uuid-1',
    rol: 'admin',
  };

  const mockDto: CreateFacturaDto = {
    rnc_emisor: '123456789',
    rnc_receptor: '987654321',
    items: [
      {
        descripcion: 'Servicio de consultoría',
        cantidad: 1,
        precio_unitario: 1000,
        tasa_itbis: 18,
      },
    ],
    subtotal: 1000,
    monto_itbis: 180,
    monto_total: 1180,
    tipo_comprobante: TipoComprobante.E31,
  };

  const mockFacturaRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
  };

  const mockEmpresaRepo = {
    findOne: jest.fn(),
  };

  const mockSecuenciasNcfService = {
    asignarSiguiente: jest.fn(),
  };

  const mockPlanesService = {
    verificarLimite: jest.fn(),
    incrementarUso: jest.fn(),
  };

  const mockConversorXmlService = {
    convertir: jest.fn(),
  };

  const mockFirmaService = {
    firmarEcf: jest.fn(),
  };

  const mockTransmisionService = {
    transmitir: jest.fn(),
  };

  const mockRncValidatorService = {
    validarRncParaFactura: jest.fn(),
  };

  const mockStorageProvider = {
    upload: jest.fn(),
    getPresignedUrl: jest.fn(),
  };

  const mockRetryQueue = {
    encolarTransmision: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacturasService,
        { provide: getRepositoryToken(FacturaElectronica), useValue: mockFacturaRepo },
        { provide: getRepositoryToken(Empresa), useValue: mockEmpresaRepo },
        { provide: SecuenciasNcfService, useValue: mockSecuenciasNcfService },
        { provide: PlanesService, useValue: mockPlanesService },
        { provide: ConversorXmlService, useValue: mockConversorXmlService },
        { provide: FirmaService, useValue: mockFirmaService },
        { provide: TransmisionService, useValue: mockTransmisionService },
        { provide: RncValidatorService, useValue: mockRncValidatorService },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
        { provide: RETRY_QUEUE_SERVICE, useValue: mockRetryQueue },
      ],
    }).compile();

    service = module.get<FacturasService>(FacturasService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('crearFactura', () => {
    it('should orchestrate the full invoice creation flow in automatic mode', async () => {
      // Arrange
      mockEmpresaRepo.findOne.mockResolvedValue(mockEmpresa);
      mockPlanesService.verificarLimite.mockResolvedValue(undefined);
      mockSecuenciasNcfService.asignarSiguiente.mockResolvedValue({
        e_ncf: 'E310000000001',
        secuencia_id: 'seq-uuid-1',
      });
      mockRncValidatorService.validarRncParaFactura.mockResolvedValue({ rnc_validado: true });

      const savedFactura = {
        id: 'factura-uuid-1',
        empresa_id: 'empresa-uuid-1',
        e_ncf: 'E310000000001',
        estado_dgii: EstadoDgii.ENVIADO,
        created_at: new Date('2024-01-15T10:00:00Z'),
        xml_s3_url: null,
        track_id: null,
        error_dgii: null,
      };
      mockFacturaRepo.create.mockReturnValue(savedFactura);
      mockFacturaRepo.save.mockResolvedValue(savedFactura);

      mockConversorXmlService.convertir.mockResolvedValue('<ECF>...</ECF>');
      mockFirmaService.firmarEcf.mockResolvedValue('<ECF signed>...</ECF>');
      mockStorageProvider.upload.mockResolvedValue('https://s3.example.com/facturas-xml/empresa-uuid-1/factura-uuid-1.xml');
      mockTransmisionService.transmitir.mockResolvedValue({
        track_id: 'TRACK-123',
        estado: 'aceptado',
      });
      mockPlanesService.incrementarUso.mockResolvedValue(undefined);

      // Act
      const result = await service.crearFactura(mockDto, mockUser, 'corr-id-1');

      // Assert
      expect(mockEmpresaRepo.findOne).toHaveBeenCalledWith({ where: { id: 'empresa-uuid-1' } });
      expect(mockPlanesService.verificarLimite).toHaveBeenCalledWith('empresa-uuid-1');
      expect(mockSecuenciasNcfService.asignarSiguiente).toHaveBeenCalledWith('empresa-uuid-1', TipoComprobante.E31);
      expect(mockRncValidatorService.validarRncParaFactura).toHaveBeenCalledWith('987654321', mockEmpresa);
      expect(mockConversorXmlService.convertir).toHaveBeenCalled();
      expect(mockFirmaService.firmarEcf).toHaveBeenCalledWith('<ECF>...</ECF>', 'empresa-uuid-1');
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        'facturas-xml',
        'empresa-uuid-1/factura-uuid-1.xml',
        expect.any(Buffer),
        'application/xml',
      );
      expect(mockTransmisionService.transmitir).toHaveBeenCalledWith({
        factura_id: 'factura-uuid-1',
        empresa_id: 'empresa-uuid-1',
        xml_firmado: '<ECF signed>...</ECF>',
        correlation_id: 'corr-id-1',
      });
      expect(mockPlanesService.incrementarUso).toHaveBeenCalledWith('empresa-uuid-1');
      expect(result.id).toBe('factura-uuid-1');
      expect(result.estado_dgii).toBe(EstadoDgii.ACEPTADO);
    });

    it('should throw ForbiddenException when RNC emisor does not match empresa', async () => {
      mockEmpresaRepo.findOne.mockResolvedValue({ ...mockEmpresa, rnc: '999999999' });

      await expect(
        service.crearFactura(mockDto, mockUser, 'corr-id-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when empresa is not found', async () => {
      mockEmpresaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.crearFactura(mockDto, mockUser, 'corr-id-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when manual mode and e_ncf is missing', async () => {
      mockEmpresaRepo.findOne.mockResolvedValue({
        ...mockEmpresa,
        modo_ncf: ModoNcf.MANUAL,
      });

      await expect(
        service.crearFactura(mockDto, mockUser, 'corr-id-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use provided e_ncf in manual mode', async () => {
      const manualEmpresa = { ...mockEmpresa, modo_ncf: ModoNcf.MANUAL };
      const manualDto = { ...mockDto, e_ncf: 'E310000000099' };
      mockEmpresaRepo.findOne.mockResolvedValue(manualEmpresa);
      mockPlanesService.verificarLimite.mockResolvedValue(undefined);
      mockRncValidatorService.validarRncParaFactura.mockResolvedValue({ rnc_validado: true });

      const savedFactura = {
        id: 'factura-uuid-2',
        empresa_id: 'empresa-uuid-1',
        e_ncf: 'E310000000099',
        estado_dgii: EstadoDgii.ENVIADO,
        created_at: new Date(),
        xml_s3_url: null,
        track_id: null,
        error_dgii: null,
      };
      mockFacturaRepo.create.mockReturnValue(savedFactura);
      mockFacturaRepo.save.mockResolvedValue(savedFactura);
      mockConversorXmlService.convertir.mockResolvedValue('<ECF/>');
      mockFirmaService.firmarEcf.mockResolvedValue('<ECF signed/>');
      mockStorageProvider.upload.mockResolvedValue('https://s3/url');
      mockTransmisionService.transmitir.mockResolvedValue({
        track_id: 'TRACK-456',
        estado: 'aceptado',
      });
      mockPlanesService.incrementarUso.mockResolvedValue(undefined);

      const result = await service.crearFactura(manualDto, mockUser, 'corr-id-2');

      // Should NOT call asignarSiguiente in manual mode
      expect(mockSecuenciasNcfService.asignarSiguiente).not.toHaveBeenCalled();
      expect(result.e_ncf).toBe('E310000000099');
    });

    it('should set api_key_id when user type is api_key', async () => {
      const apiKeyUser: RequestContext = {
        tipo: 'api_key',
        empresa_id: 'empresa-uuid-1',
        rnc: '123456789',
        api_key_id: 'apikey-uuid-1',
        scopes: ['facturacion:crear'],
      };

      mockEmpresaRepo.findOne.mockResolvedValue(mockEmpresa);
      mockPlanesService.verificarLimite.mockResolvedValue(undefined);
      mockSecuenciasNcfService.asignarSiguiente.mockResolvedValue({
        e_ncf: 'E310000000002',
        secuencia_id: 'seq-uuid-1',
      });
      mockRncValidatorService.validarRncParaFactura.mockResolvedValue({ rnc_validado: true });

      const savedFactura = {
        id: 'factura-uuid-3',
        empresa_id: 'empresa-uuid-1',
        e_ncf: 'E310000000002',
        estado_dgii: EstadoDgii.ENVIADO,
        created_at: new Date(),
        xml_s3_url: null,
        track_id: null,
        error_dgii: null,
      };
      mockFacturaRepo.create.mockReturnValue(savedFactura);
      mockFacturaRepo.save.mockResolvedValue(savedFactura);
      mockConversorXmlService.convertir.mockResolvedValue('<ECF/>');
      mockFirmaService.firmarEcf.mockResolvedValue('<ECF signed/>');
      mockStorageProvider.upload.mockResolvedValue('https://s3/url');
      mockTransmisionService.transmitir.mockResolvedValue({
        track_id: 'TRACK-789',
        estado: 'aceptado',
      });
      mockPlanesService.incrementarUso.mockResolvedValue(undefined);

      await service.crearFactura(mockDto, apiKeyUser, 'corr-id-3');

      expect(mockFacturaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario_id: null,
          api_key_id: 'apikey-uuid-1',
        }),
      );
    });

    it('should map rechazado estado correctly', async () => {
      mockEmpresaRepo.findOne.mockResolvedValue(mockEmpresa);
      mockPlanesService.verificarLimite.mockResolvedValue(undefined);
      mockSecuenciasNcfService.asignarSiguiente.mockResolvedValue({
        e_ncf: 'E310000000003',
        secuencia_id: 'seq-uuid-1',
      });
      mockRncValidatorService.validarRncParaFactura.mockResolvedValue({ rnc_validado: true });

      const savedFactura = {
        id: 'factura-uuid-4',
        empresa_id: 'empresa-uuid-1',
        e_ncf: 'E310000000003',
        estado_dgii: EstadoDgii.ENVIADO,
        created_at: new Date(),
        xml_s3_url: null,
        track_id: null,
        error_dgii: null,
      };
      mockFacturaRepo.create.mockReturnValue(savedFactura);
      mockFacturaRepo.save.mockResolvedValue(savedFactura);
      mockConversorXmlService.convertir.mockResolvedValue('<ECF/>');
      mockFirmaService.firmarEcf.mockResolvedValue('<ECF signed/>');
      mockStorageProvider.upload.mockResolvedValue('https://s3/url');
      mockTransmisionService.transmitir.mockResolvedValue({
        track_id: null,
        estado: 'rechazado',
        error_dgii: { codigo: 'ERR-001', mensaje: 'Datos inválidos' },
      });
      mockPlanesService.incrementarUso.mockResolvedValue(undefined);

      const result = await service.crearFactura(mockDto, mockUser, 'corr-id-4');

      expect(result.estado_dgii).toBe(EstadoDgii.RECHAZADO);
      expect(result.track_id).toBeNull();
    });

    it('should map reintentando estado correctly', async () => {
      mockEmpresaRepo.findOne.mockResolvedValue(mockEmpresa);
      mockPlanesService.verificarLimite.mockResolvedValue(undefined);
      mockSecuenciasNcfService.asignarSiguiente.mockResolvedValue({
        e_ncf: 'E310000000004',
        secuencia_id: 'seq-uuid-1',
      });
      mockRncValidatorService.validarRncParaFactura.mockResolvedValue({ rnc_validado: false });

      const savedFactura = {
        id: 'factura-uuid-5',
        empresa_id: 'empresa-uuid-1',
        e_ncf: 'E310000000004',
        estado_dgii: EstadoDgii.ENVIADO,
        created_at: new Date(),
        xml_s3_url: null,
        track_id: null,
        error_dgii: null,
      };
      mockFacturaRepo.create.mockReturnValue(savedFactura);
      mockFacturaRepo.save.mockResolvedValue(savedFactura);
      mockConversorXmlService.convertir.mockResolvedValue('<ECF/>');
      mockFirmaService.firmarEcf.mockResolvedValue('<ECF signed/>');
      mockStorageProvider.upload.mockResolvedValue('https://s3/url');
      mockTransmisionService.transmitir.mockResolvedValue({
        track_id: null,
        estado: 'reintentando',
      });
      mockPlanesService.incrementarUso.mockResolvedValue(undefined);

      const result = await service.crearFactura(mockDto, mockUser, 'corr-id-5');

      expect(result.estado_dgii).toBe(EstadoDgii.REINTENTANDO);
    });
  });

  describe('descargarPdf', () => {
    const facturaConPdf: Partial<FacturaElectronica> = {
      id: 'factura-uuid-1',
      empresa_id: 'empresa-uuid-1',
      pdf_s3_url: 'empresa-uuid-1/factura-uuid-1.pdf',
      e_ncf: 'E310000000001',
      estado_dgii: EstadoDgii.ACEPTADO,
    };

    it('should return presigned URL and expiration for factura with PDF', async () => {
      mockFacturaRepo.findOne.mockResolvedValue(facturaConPdf);
      mockStorageProvider.getPresignedUrl.mockResolvedValue(
        'https://s3.example.com/presigned-url?token=abc',
      );

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const result = await service.descargarPdf('factura-uuid-1', 'empresa-uuid-1');

      expect(mockFacturaRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'factura-uuid-1' },
      });
      expect(mockStorageProvider.getPresignedUrl).toHaveBeenCalledWith(
        'facturas-pdf',
        'empresa-uuid-1/factura-uuid-1.pdf',
        900,
      );
      expect(result.url).toBe('https://s3.example.com/presigned-url?token=abc');
      expect(result.expires_at).toBe(new Date(now + 900 * 1000).toISOString());

      jest.spyOn(Date, 'now').mockRestore();
    });

    it('should throw NotFoundException when factura does not exist', async () => {
      mockFacturaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.descargarPdf('non-existent-id', 'empresa-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when factura belongs to another empresa', async () => {
      mockFacturaRepo.findOne.mockResolvedValue({
        ...facturaConPdf,
        empresa_id: 'otra-empresa-uuid',
      });

      await expect(
        service.descargarPdf('factura-uuid-1', 'empresa-uuid-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when pdf_s3_url is null', async () => {
      mockFacturaRepo.findOne.mockResolvedValue({
        ...facturaConPdf,
        pdf_s3_url: null,
      });

      await expect(
        service.descargarPdf('factura-uuid-1', 'empresa-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return expires_at in ISO 8601 format', async () => {
      mockFacturaRepo.findOne.mockResolvedValue(facturaConPdf);
      mockStorageProvider.getPresignedUrl.mockResolvedValue('https://s3.example.com/url');

      const fixedNow = new Date('2024-06-15T12:00:00.000Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      const result = await service.descargarPdf('factura-uuid-1', 'empresa-uuid-1');

      // 15 minutes = 900 seconds later
      expect(result.expires_at).toBe('2024-06-15T12:15:00.000Z');

      jest.spyOn(Date, 'now').mockRestore();
    });
  });
});
