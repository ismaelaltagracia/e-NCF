import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import * as AuthSchemas from './dto/auth.schemas.js';
import type { TokenPair } from './interfaces/token-pair.interface.js';

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(AuthSchemas.LoginSchema))
  async login(@Body() dto: AuthSchemas.LoginDto): Promise<TokenPair> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(AuthSchemas.RefreshSchema))
  async refresh(@Body() dto: AuthSchemas.RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ZodValidationPipe(AuthSchemas.LogoutSchema))
  async logout(@Body() dto: AuthSchemas.LogoutDto): Promise<void> {
    return this.authService.logout(dto.refresh_token);
  }

  /**
   * Cambio de contraseña por elección (requiere sesión activa).
   */
  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: RequestContext,
    @Body(new ZodValidationPipe(AuthSchemas.ChangePasswordSchema))
    dto: AuthSchemas.ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(user, dto.password_actual, dto.password_nueva);
  }

  /**
   * Solicitud de recuperación de contraseña. Responde 200 siempre (no revela si
   * el email existe) para evitar enumeración de cuentas.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(new ZodValidationPipe(AuthSchemas.ForgotPasswordSchema))
    dto: AuthSchemas.ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return {
      message:
        'Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.',
    };
  }

  /**
   * Confirmación de recuperación: token del email + nueva contraseña.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(AuthSchemas.ResetPasswordSchema))
    dto: AuthSchemas.ResetPasswordDto,
  ): Promise<void> {
    return this.authService.resetPassword(dto.token, dto.password_nueva);
  }
}
