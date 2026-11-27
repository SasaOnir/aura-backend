import { Body, Controller, Get, Post, Req, UseGuards, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto, TokenDto, EmailOnlyDto, SetPasswordDto, MfaVerifyDto, MfaCodeDto, MfaDisableDto } from './dto';
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

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  // ── Verifica email / password dimenticata / impostazione password ──────
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: TokenDto) {
    return this.auth.verifyEmail(dto.token);
  }

  // 3 richieste/ora per coppia IP+email: niente email-bombing
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post('resend-verification')
  resendVerification(@Body() dto: EmailOnlyDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: EmailOnlyDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post('set-password')
  setPassword(@Body() dto: SetPasswordDto, @Req() req: Request) {
    const { ip, ua } = this.meta(req);
    return this.auth.setPassword(dto.token, dto.password, ip, ua);
  }

  // ── MFA ────────────────────────────────────────────────────────────────
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(200)
  @Post('mfa/verify')
  mfaVerify(@Body() dto: MfaVerifyDto, @Req() req: Request) {
    const { ip, ua } = this.meta(req);
    return this.auth.mfaVerify(dto.mfaToken, { code: dto.code, recoveryCode: dto.recoveryCode }, ip, ua);
  }

  // setup/enable accettano access token normale OPPURE il token di enrollment dello staff
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(200)
  @Post('mfa/setup')
  async mfaSetup(@Req() req: Request) {
    const who = await this.auth.userFromBearer(req.headers.authorization, ['access', 'mfa_enroll']);
    return this.auth.mfaSetup(who.id);
  }

  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(200)
  @Post('mfa/enable')
  async mfaEnable(@Body() dto: MfaCodeDto, @Req() req: Request) {
    const who = await this.auth.userFromBearer(req.headers.authorization, ['access', 'mfa_enroll']);
    const { ip, ua } = this.meta(req);
    return this.auth.mfaEnable(who, dto.code, ip, ua);
  }

  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post('mfa/disable')
  mfaDisable(@Body() dto: MfaDisableDto, @Req() req: Request) {
    return this.auth.mfaDisable(((req as any).user as { id: string }).id, dto.password, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAll(@Req() req: Request) {
    return this.auth.logoutAll(((req as any).user as { id: string }).id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return this.auth.me(((req as any).user as { id: string }).id);
  }
}
