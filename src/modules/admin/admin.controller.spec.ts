import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PlanesService } from '../planes/planes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

describe('AdminController', () => {
  let controller: AdminController;
  let mockPlanesService: {
    findAll: jest.Mock;
    cambiarPlan: jest.Mock;
  };

  beforeEach(async () => {
    mockPlanesService = {
      findAll: jest.fn(),
      cambiarPlan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: PlanesService, useValue: mockPlanesService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
  });

  describe('GET /api/v1/admin/planes', () => {
    it('should return list of all plans', async () => {
      const plans = [
        { id: 'uuid-1', nombre: 'Básico', limite_facturas_mensual: 50, precio: '29.99', activo: true },
        { id: 'uuid-2', nombre: 'Profesional', limite_facturas_mensual: 200, precio: '79.99', activo: true },
        { id: 'uuid-3', nombre: 'Empresarial', limite_facturas_mensual: null, precio: '199.99', activo: true },
      ];
      mockPlanesService.findAll.mockResolvedValue(plans);

      const result = await controller.getPlanes();

      expect(result).toEqual(plans);
      expect(mockPlanesService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('PATCH /api/v1/admin/empresas/:id/plan', () => {
    it('should change the plan of an empresa and return success response', async () => {
      const empresaId = '550e8400-e29b-41d4-a716-446655440000';
      const planId = '660e8400-e29b-41d4-a716-446655440001';
      const updatedEmpresa = { id: empresaId, plan_id: planId };

      mockPlanesService.cambiarPlan.mockResolvedValue(updatedEmpresa);

      const result = await controller.cambiarPlan(empresaId, { plan_id: planId });

      expect(result).toEqual({
        message: 'Plan actualizado exitosamente',
        empresa_id: empresaId,
        plan_id: planId,
      });
      expect(mockPlanesService.cambiarPlan).toHaveBeenCalledWith(empresaId, planId);
    });
  });
});

describe('AdminController - Guard behavior (403 for non-Super_Admin)', () => {
  it('SuperAdminGuard should reject non-super_admin users with 403', () => {
    const guard = new SuperAdminGuard();

    const createMockContext = (user: any): ExecutionContext => ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any);

    // Regular admin should be rejected
    const adminContext = createMockContext({
      tipo: 'usuario',
      empresa_id: 'some-id',
      rnc: '101000001',
      rol: 'admin',
    });
    expect(() => guard.canActivate(adminContext)).toThrow(ForbiddenException);

    // Facturador should be rejected
    const facturadorContext = createMockContext({
      tipo: 'usuario',
      empresa_id: 'some-id',
      rnc: '101000001',
      rol: 'facturador',
    });
    expect(() => guard.canActivate(facturadorContext)).toThrow(ForbiddenException);

    // Lector should be rejected
    const lectorContext = createMockContext({
      tipo: 'usuario',
      empresa_id: 'some-id',
      rnc: '101000001',
      rol: 'lector',
    });
    expect(() => guard.canActivate(lectorContext)).toThrow(ForbiddenException);

    // API Key should be rejected
    const apiKeyContext = createMockContext({
      tipo: 'api_key',
      empresa_id: 'some-id',
      rnc: '101000001',
      api_key_id: 'key-id',
    });
    expect(() => guard.canActivate(apiKeyContext)).toThrow(ForbiddenException);
  });

  it('SuperAdminGuard should allow super_admin users', () => {
    const guard = new SuperAdminGuard();

    const context: ExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            tipo: 'usuario',
            empresa_id: '',
            rnc: '',
            rol: 'super_admin',
          },
        }),
      }),
    } as any;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('SuperAdminGuard should throw UnauthorizedException if no user', () => {
    const guard = new SuperAdminGuard();

    const context: ExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user: undefined }),
      }),
    } as any;

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
