import { ApiTags } from '@nestjs/swagger';
import { Controller, Post, Body, HttpCode, HttpStatus, UsePipes } from '@nestjs/common';
import { OnboardingService } from './onboarding.service.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RegistroSchema } from './dto/onboarding.schemas.js';
import type { RegistroDto } from './dto/onboarding.schemas.js';
import type { RegistroResult } from './onboarding.service.js';

@ApiTags('Onboarding')
@Controller('api/v1/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('registro')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(RegistroSchema))
  async registro(@Body() dto: RegistroDto): Promise<RegistroResult> {
    return this.onboardingService.registrar(dto);
  }
}
