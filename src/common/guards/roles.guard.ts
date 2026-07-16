import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestContext } from '../interfaces/request-context.interface.js';

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 3,
  facturador: 2,
  lector: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestContext | undefined;

    if (!user) {
      throw new UnauthorizedException('No autenticado');
    }

    // API Key users skip role check (they use scopes instead)
    if (user.tipo === 'api_key') {
      return true;
    }

    if (!user.rol) {
      throw new ForbiddenException('Permisos insuficientes: rol no asignado');
    }

    const userLevel = ROLE_HIERARCHY[user.rol] ?? 0;

    // The minimum required level is the lowest role in the decorator list
    const minimumRequiredLevel = Math.min(
      ...requiredRoles.map((role) => ROLE_HIERARCHY[role] ?? 0),
    );

    if (userLevel < minimumRequiredLevel) {
      throw new ForbiddenException(
        'Permisos insuficientes: solo administradores pueden realizar esta operación',
      );
    }

    return true;
  }
}
