export { AuthModule } from './auth.module.js';
export { AuthService } from './auth.service.js';
export { JwtAuthGuard } from './guards/jwt-auth.guard.js';
export { ApiKeyGuard } from './guards/api-key.guard.js';
export { RolesGuard, ScopesGuard } from '../../common/guards/index.js';
export type { TokenPair } from './interfaces/token-pair.interface.js';
