import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';
import { PlanesService } from '../planes/planes.service';
import { ModoNcf } from '../../database/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { RequestContext } from '../../common/interfaces/request-context.interface';

describe('EmpresasController - updateConfiguracion', () => {
  let controller: EmpresasController;
  let empresasService: Record<string, jest.Mock>;

  const mockUser: RequestContext = {
    tipo: 'usuario',
    empresa_id: 'empresa-1',
    rnc: '123456789',
    usuario_id: 'user-1',
    rol: 'admin',
  };

  beforeEach(async () => {
    empresasService = {
      uploadCertificado: jest.fn(),
      updateConfiguracion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmpresasController],
      providers: [
        {
          provide: EmpresasService,
          useValue: empresasService,
        },
        {
          provide: PlanesService,
          useValue: { getUsoActual: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EmpresasController>(EmpresasController);
  });

  it('should call service.updateConfiguracion with correct params', async () => {
    const dto = { modo_ncf: ModoNcf.MANUAL };
    const expectedResponse = {
      modo_ncf: ModoNcf.MANUAL,
      validar_rnc_receptor: true,
      formato_pdf: null,
    };
    empresasService.updateConfiguracion.mockResolvedValue(expectedResponse);

    const result = await controller.updateConfiguracion(dto, mockUser);

    expect(empresasService.updateConfiguracion).toHaveBeenCalledWith('empresa-1', dto);
    expect(result).toEqual(expectedResponse);
  });

  it('should pass through NotFoundException from service', async () => {
    const dto = { modo_ncf: ModoNcf.AUTOMATICO };
    empresasService.updateConfiguracion.mockRejectedValue(
      new NotFoundException('Empresa no encontrada'),
    );

    await expect(controller.updateConfiguracion(dto, mockUser)).rejects.toThrow(NotFoundException);
  });

  it('should accept partial configuration updates', async () => {
    const dto = { validar_rnc_receptor: false };
    const expectedResponse = {
      modo_ncf: ModoNcf.AUTOMATICO,
      validar_rnc_receptor: false,
      formato_pdf: null,
    };
    empresasService.updateConfiguracion.mockResolvedValue(expectedResponse);

    const result = await controller.updateConfiguracion(dto, mockUser);

    expect(result.validar_rnc_receptor).toBe(false);
    expect(result.modo_ncf).toBe(ModoNcf.AUTOMATICO);
  });
});
