import { Controller, Get, Req, Res, All } from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

/**
 * WebController — serve la SPA standalone AURA come catch-all.
 *
 * - GET /  → serve download/aura-admin-standalone.html
 * - Tutte le altre route non-API → serve la stessa SPA (router client-side)
 *
 * La SPA è un singolo file HTML con CSS+JS inline, generato da download/.
 * Le rotte API (/auth, /music, /aura, /admin, /users, /roles, /staff, /audit)
 * sono gestite dai rispettivi controller NestJS e non arrivano qui.
 */
@Controller()
export class WebController {
  private spaPath = '/home/z/my-project/download/aura-admin-standalone.html';

  @All('*path')
  serve(@Req() req: Request, @Res() res: Response) {
    // Non intercettare le rotte API
    const apiPrefixes = ['/auth', '/users', '/roles', '/staff', '/audit', '/admin', '/health', '/music', '/aura'];
    if (apiPrefixes.some((p) => req.path.startsWith(p))) {
      res.status(404).json({ statusCode: 404, message: 'Not found' });
      return;
    }
    try {
      const html = fs.readFileSync(this.spaPath, 'utf8');
      res.type('html').send(html);
    } catch (e) {
      res.status(500).send('SPA not found. Run the build first.');
    }
  }
}
