import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { join } from 'path';
import * as express from 'express';

/**
 * Middleware que sirve la SPA de React desde /app.
 * - Archivos estáticos (JS, CSS, imágenes) se sirven directamente.
 * - Cualquier otra ruta recibe index.html para que React Router maneje la navegación.
 */
@Injectable()
export class SpaFallbackMiddleware implements NestMiddleware {
  private readonly clientDistPath = join(__dirname, '..', '..', '..', 'client', 'dist');
  private readonly staticHandler: express.Handler;

  constructor() {
    this.staticHandler = express.static(this.clientDistPath, {
      index: false,
      fallthrough: true,
    });
  }

  use(req: Request, res: Response, _next: NextFunction): void {
    // Strip /app prefix for static file lookup
    const originalUrl = req.url;
    req.url = req.url.replace(/^\/app\/?/, '/') || '/';

    // Try to serve static file first
    this.staticHandler(req, res, () => {
      // If static file not found, serve index.html (SPA fallback)
      req.url = originalUrl;
      res.sendFile(join(this.clientDistPath, 'index.html'));
    });
  }
}
