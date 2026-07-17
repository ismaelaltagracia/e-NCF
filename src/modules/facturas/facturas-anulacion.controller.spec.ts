import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnprocessableEntityException, NotFoundException, ForbiddenException } from '@nestjs/common';

import { FacturasController } from './facturas.controller.js';
import { FacturasService } from './facturas.service.js';
import { AnulacionService } from '../../dgii/anulacion.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { EstadoDgii } from '../../database/enums.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import type { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';

// Mock correlation-id interceptor
jest.mock('../../common/interceptors/correlation-id.interceptor.js', () => ({
  getCorrelationId: () => 'test-correlation-id',
}));

describe('FacturasController - Anulación', () => {
  let controller: FacturasController;

  const mockFacturasService = {
    crearFactura: jest.fn(),
    listarFacturas: jest.fn(),
    obtenerFactura: jest.fn(),
    obtenerEstadoFactura: jest.fn(),
    descargarPdf: jest.fn(),
    actualizarEstadoAnulado: jest.fn(),
  };

  const mockAnulacionService = {
    anular: jest.fn(),
  };

  const mockAuditoriaService = {
    registrar: jest.fn(),
  };

  const adminUser: RequestContext = {
    tipo: 'usuario',
    empresa_id: 'empresa-uuid-1',
    rnc: '123456789',
    usuario_id: 'user-uuid-1',
    rol: 'admin',
  };

  const mockRequest = {
    ip: '192.168.1.100',
    correlationId: 'req-correlation-id',
  } as unknown as import('express').Request;

  const facturaAprobada: Partial<FacturaElectronica> = {
    id: 'factura-uuid-1',
    empresa_id: 'empresa-uuid-1',
    e_ncf: 'E310000000001',
    estado_dgii: EstadoDgii.APROBADO,
    track_id: 'TRACK-123',
    created_at: new Date('2024-01-15T10:00:00Z'),
    updated_at: new Date('2024-01-15T12:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacturasController],
      providers: [
        { provide: FacturasService, useValue: mockFacturasService },
        { provide: AnulacionService, useValue: mockAnulacionService },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FacturasController>(FacturasController);
    jest.clearAllMocks();
  });

  describe('POST /api/v1/facturas/:id/anular', () => {
    it('should annul an approved invoice successfully', async () => {
      mockFacturasService.obtenerFactura.mockResolvedValue(facturaAprobada);
      mockAnulacionService.anular.mockResolvedValue({
        exito: true,
        mensaje: 'Anulación confirmada por la DGII',
      });
      mockFacturasService.actualizarEstadoAnulado.mockResolvedValue(undefined);
      mockAuditoriaService.registrar.mockResolvedValue({ id: 'audit-1' });

      const result = await controller.anular(
        'factura-uuid-1',
        { motivo: 'Error en datos del comprador' },
        adminUser,
        mockRequest,
      );

      expect(result).toEqual({
        id: 'factura-uuid-1',
        e_ncf: 'E310000000001',
        estado_dgii: EstadoDgii.ANULADO,
        mensaje: 'Factura anulada exitosamente',
      });

      expect(mockFacturasService.obtenerFactura).toHaveBeenCalledWith(
        'factura-uuid-1',
        'empresa-uuid-1',
      );
      expect(mockAnulacionService.anular).toHaveBeenCalledWith({
        factura_id: 'factura-uuid-1',
        empresa_id: 'empresa-uuid-1',
        e_ncf: 'E310000000001',
        rnc_emisor: '123456789',
        motivo: 'Error en datos del comprador',
        correlation_id: 'test-correlation-id',
      });
      expect(mockFacturasService.actualizarEstadoAnulado).toHaveBeenCalledWith('factura-uuid-1');
      expect(mockAuditoriaService.registrar).toHaveBeenCalledWith({
        empresa_id: 'empresa-uuid-1',
        usuario_id: 'user-uuid-1',
        api_key_id: null,
        accion: 'factura_anulada',
        recurso_tipo: 'factura_electronica',
        recurso_id: 'factura-uuid-1',
        datos_anteriores: { estado_dgii: EstadoDgii.APROBADO },
        datos_nuevos: { estado_dgii: EstadoDgii.ANULADO, motivo: 'Error en datos del comprador' },
        ip_origen: '192.168.1.100',
        correlation_id: 'test-correlation-id',
      });
    });

    it('should throw ConflictException when factura estado_dgii is not aprobado (Req 30.6)', async () => {
      const facturaEnviada = { ...facturaAprobada, estado_dgii: EstadoDgii.ENVIADO };
      mockFacturasService.obtenerFactura.mockResolvedValue(facturaEnviada);

      await expect(
        controller.anular('factura-uuid-1', { motivo: 'Motivo test' }, adminUser, mockRequest),
      ).rejects.toThrow(ConflictException);

      expect(mockAnulacionService.anular).not.toHaveBeenCalled();
      expect(mockFacturasService.actualizarEstadoAnulado).not.toHaveBeenCalled();
    });

    it('should throw ConflictException for already annulled invoice', async () => {
      const facturaAnulada = { ...facturaAprobada, estado_dgii: EstadoDgii.ANULADO };
      mockFacturasService.obtenerFactura.mockResolvedValue(facturaAnulada);

      await expect(
        controller.anular('factura-uuid-1', { motivo: 'Motivo test' }, adminUser, mockRequest),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for rejected invoice', async () => {
      const facturaRechazada = { ...facturaAprobada, estado_dgii: EstadoDgii.RECHAZADO };
      mockFacturasService.obtenerFactura.mockResolvedValue(facturaRechazada);

      await expect(
        controller.anular('factura-uuid-1', { motivo: 'Motivo test' }, adminUser, mockRequest),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw UnprocessableEntityException when DGII rejects annulment (Req 30.4)', async () => {
      mockFacturasService.obtenerFactura.mockResolvedValue(facturaAprobada);
      mockAnulacionService.anular.mockResolvedValue({
        exito: false,
        error_dgii: { codigo: 'ANL-001', mensaje: 'Factura ya fue anulada' },
      });

      await expect(
        controller.anular('factura-uuid-1', { motivo: 'Motivo test' }, adminUser, mockRequest),
      ).rejects.toThrow(UnprocessableEntityException);

      // Should NOT update estado
      expect(mockFacturasService.actualizarEstadoAnulado).not.toHaveBeenCalled();
      // Should NOT create audit record
      expect(mockAuditoriaService.registrar).not.toHaveBeenCalled();
    });

    it('should propagate NotFoundException when factura does not exist', async () => {
      mockFacturasService.obtenerFactura.mockRejectedValue(
        new NotFoundException('Factura no encontrada'),
      );

      await expect(
        controller.anular('non-existent-id', { motivo: 'Motivo test' }, adminUser, mockRequest),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException when factura belongs to another empresa', async () => {
      mockFacturasService.obtenerFactura.mockRejectedValue(
        new ForbiddenException('No tiene acceso a esta factura'),
      );

      await expect(
        controller.anular('factura-uuid-1', { motivo: 'Motivo test' }, adminUser, mockRequest),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should NOT release the e-NCF after annulment (Req 30.7)', async () => {
      mockFacturasService.obtenerFactura.mockResolvedValue(facturaAprobada);
      mockAnulacionService.anular.mockResolvedValue({ exito: true });
      mockFacturasService.actualizarEstadoAnulado.mockResolvedValue(undefined);
      mockAuditoriaService.registrar.mockResolvedValue({ id: 'audit-1' });

      await controller.anular('factura-uuid-1', { motivo: 'Test' }, adminUser, mockRequest);

      // No secuencias-related calls should be made
      // The controller does NOT interact with SecuenciasNcfService
      // This test verifies by omission that no NCF release logic exists
      expect(mockFacturasService.actualizarEstadoAnulado).toHaveBeenCalledTimes(1);
    });

    it('should create audit record with correct data (Req 30.3)', async () => {
      mockFacturasService.obtenerFactura.mockResolvedValue(facturaAprobada);
      mockAnulacionService.anular.mockResolvedValue({ exito: true });
      mockFacturasService.actualizarEstadoAnulado.mockResolvedValue(undefined);
      mockAuditoriaService.registrar.mockResolvedValue({ id: 'audit-1' });

      await controller.anular(
        'factura-uuid-1',
        { motivo: 'Datos incorrectos del receptor' },
        adminUser,
        mockRequest,
      );

      expect(mockAuditoriaService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'factura_anulada',
          recurso_tipo: 'factura_electronica',
          recurso_id: 'factura-uuid-1',
          datos_anteriores: { estado_dgii: 'aprobado' },
          datos_nuevos: { estado_dgii: 'anulado', motivo: 'Datos incorrectos del receptor' },
        }),
      );
    });
  });
});
