import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, JWT_ALG, JWT_ISSUER, JWT_AUDIENCE } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithms: [JWT_ALG], // niente 'none', niente downgrade di algoritmo
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  async validate(payload: JwtPayload): Promise<{ id: string; email: string; type: string }> {
    if (payload.type !== 'access') throw new UnauthorizedException();
    // Lo stato si controlla a ogni richiesta: un account sospeso/cancellato
    // perde l'accesso subito, non allo scadere dei 15 minuti del token.
    const u = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true } });
    if (!u || u.status !== 'active') throw new UnauthorizedException();
    return { id: payload.sub, email: payload.email, type: payload.type };
  }
}
