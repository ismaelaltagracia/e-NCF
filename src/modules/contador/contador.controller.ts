import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContadorService } from './contador.service.js';
import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';

@ApiTags('Contador')
@Controller('api/v1/contador')
@UseGuards(JwtAuthGuard)
export class ContadorController {
  constructor(
    private readonly service: ContadorService,
    private readonly authService: AuthService,
  ) {}

  @Post('registro')
  @HttpCode(HttpStatus.CREATED)
  async registrar(
    @Body() body: {
      nombre_firma: string;
      rnc_firma?: string;
      exequatur?: string;
      email_facturacion: string;
    },
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.registrar({
      usuario_id: user.usuario_id!,
      ...body,
    });
  }

  @Get('me')
  async perfil(@CurrentUser() user: RequestContext) {
    return this.service.obtenerPerfil(user.usuario_id!);
  }

  @Patch('me')
  async actualizarPerfil(
    @Body() body: Partial<{
      nombre_firma: string;
      rnc_firma: string;
      exequatur: string;
      email_facturacion: string;
    }>,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.actualizarPerfil(user.usuario_id!, body);
  }

  @Get('empresas')
  async listarEmpresas(@CurrentUser() user: RequestContext) {
    return this.service.listarEmpresas(user.usuario_id!);
  }

  @Post('empresas')
  @HttpCode(HttpStatus.CREATED)
  async crearEmpresa(
    @Body() body: { nombre: string; rnc: string; plan_id: string },
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.crearEmpresa(user.usuario_id!, body);
  }

  @Delete('empresas/:id')
  async desvincularEmpresa(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.desvincularEmpresa(user.usuario_id!, id);
  }

  @Post('empresas/:id/cambiar-plan')
  async cambiarPlan(
    @Param('id') id: string,
    @Body() body: { plan_id: string },
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.cambiarPlanEmpresa(user.usuario_id!, id, body.plan_id);
  }

  @Post('cambiar-empresa')
  @HttpCode(HttpStatus.OK)
  async cambiarEmpresa(
    @Body() body: { empresa_id: string },
    @CurrentUser() user: RequestContext,
  ) {
    const autorizado = await this.service.validarEmpresaPertenece(
      user.usuario_id!,
      body.empresa_id,
    );
    if (!autorizado) {
      return { autorizado: false, error: 'Empresa no vinculada a su cuenta de contador' };
    }

    // Issue a new JWT with the selected empresa_id
    const accessToken = await this.authService.generateAccessTokenForContador({
      usuario_id: user.usuario_id!,
      empresa_id: body.empresa_id,
      rol: 'admin',
    });

    return {
      autorizado: true,
      empresa_id: body.empresa_id,
      access_token: accessToken,
    };
  }

  @Get('factura-actual')
  async previewFactura(@CurrentUser() user: RequestContext) {
    return this.service.previewFacturaMes(user.usuario_id!);
  }

  @Get('facturas')
  async listarFacturas(@CurrentUser() user: RequestContext) {
    return this.service.listarFacturas(user.usuario_id!);
  }

  // ─── Usuarios del equipo ───

  @Post('usuarios')
  @HttpCode(HttpStatus.CREATED)
  async crearUsuario(
    @Body() body: { usuario_id: string; rol: string; empresa_ids: string[] },
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.crearUsuarioEquipo(user.usuario_id!, body);
  }

  @Get('usuarios')
  async listarUsuarios(@CurrentUser() user: RequestContext) {
    return this.service.listarUsuariosEquipo(user.usuario_id!);
  }

  @Delete('usuarios/:usuarioId')
  async eliminarUsuario(
    @Param('usuarioId') usuarioId: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.eliminarUsuarioEquipo(user.usuario_id!, usuarioId);
  }
}
