import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { API_KEY_SCOPES_KEY } from '../decorators/api-key-scopes.decorator.js';
import type { RequestContext } from '../interfaces/request-context.interface.js';

@Injectable()
export class ScopesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[] | undefined>(
      API_KEY_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestContext | undefined;

    if (!user) {
      throw new UnauthorizedException('No autenticado');
    }

    // JWT users skip scope check (they use roles instead)
    if (user.tipo === 'usuario') {
      return true;
    }

    const userScopes = user.scopes ?? [];

    const missingScopes = requiredScopes.filter((scope) => !userScopes.includes(scope));

    if (missingScopes.length > 0) {
      throw new ForbiddenException(
        `API key no tiene permisos suficientes. Scopes requeridos: ${missingScopes.join(', ')}`,
      );
    }

    return true;
  }

  constructor(private readonly reflector: Reflector) {}
}
