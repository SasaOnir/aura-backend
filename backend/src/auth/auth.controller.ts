import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto, LogoutDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { clientIp } from '../common/client-ip';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private meta(req: Request) {
    return { ip: clientIp(req), ua: req.headers['user-agent']?.slice(0, 300) };
  }

  // 5 registrazioni/ora per IP
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    const { ip, ua } = this.meta(req);
    return this.auth.register(dto, ip, ua);
  }

  // 5 tentativi / 15 minuti per coppia IP+email
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const { ip, ua } = this.meta(req);
    return this.auth.login(dto, ip, ua);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const { ip, ua } = this.meta(req);
    return this.auth.refresh(dto.refreshToken, ip, ua);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Body() dto: LogoutDto, @Req() req: Request) {
    const user = (req as any).user as { id: string };
    return this.auth.logout(user.id, dto.refreshToken);
  }
}
