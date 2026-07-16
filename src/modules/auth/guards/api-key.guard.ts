import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';

import { ApiKey } from '../../../database/entities/api-key.entity.js';
import { EstadoEmpresa } from '../../../database/enums.js';
import type { RequestContext } from '../../../common/interfaces/request-context.interface.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

    if (!apiKeyHeader) {
      throw new UnauthorizedException('API key requerida');
    }

    const keyHash = createHash('sha256').update(apiKeyHeader).digest('hex');

    const apiKey = await this.apiKeyRepo.findOne({
      where: { key_hash: keyHash },
      relations: ['empresa'],
    });

    if (
      !apiKey ||
      !apiKey.activo ||
      !apiKey.empresa ||
      apiKey.empresa.estado !== EstadoEmpresa.ACTIVO
    ) {
      throw new UnauthorizedException('API key inválida');
    }

    const requestContext: RequestContext = {
      tipo: 'api_key',
      empresa_id: apiKey.empresa_id,
      rnc: apiKey.empresa.rnc,
      api_key_id: apiKey.id,
      scopes: apiKey.scopes,
    };

    request.user = requestContext;

    // Update last_used_at asynchronously (fire-and-forget)
    this.apiKeyRepo.update(apiKey.id, { last_used_at: new Date() }).catch(() => {
      // Silently ignore errors on last_used_at update
    });

    return true;
  }
}
