import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto, LogoutDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private meta(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip,
      ua: req.headers['user-agent'],
    };
  }

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    const { ip, ua } = this.meta(req);
    return this.auth.register(dto, ip, ua);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const { ip, ua } = this.meta(req);
    return this.auth.login(dto, ip, ua);
  }

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
