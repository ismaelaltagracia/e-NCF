import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingService } from './onboarding.service.js';
import { OnboardingController } from './onboarding.controller.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { Usuario } from '../../database/entities/usuario.entity.js';
import { Plan } from '../../database/entities/plan.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Empresa, Usuario, Plan])],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
