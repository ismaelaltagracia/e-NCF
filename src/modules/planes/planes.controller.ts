import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

import { PlanesService } from './planes.service.js';

@ApiTags('Planes')
@Controller('api/v1/planes')
export class PlanesController {
  constructor(private readonly planesService: PlanesService) {}

  /**
   * GET /api/v1/planes
   * Listar planes disponibles (público).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    return this.planesService.findAll();
  }
}
