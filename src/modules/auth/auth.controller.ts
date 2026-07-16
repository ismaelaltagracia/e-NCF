import { Controller, Post, Body, HttpCode, HttpStatus, UsePipes } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import * as AuthSchemas from './dto/auth.schemas.js';
import type { TokenPair } from './interfaces/token-pair.interface.js';

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
}
