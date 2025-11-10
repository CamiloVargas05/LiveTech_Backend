import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    
    if (!secret) {
      throw new Error('JWT_SECRET no está definido en las variables de entorno');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    // Validar que el usuario existe y está activo
    const user = await this.usersService.findOne(payload.sub);
    
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }
    
    // Retornar solo los datos necesarios del payload, no el usuario completo
    return { 
      id: payload.sub,
      sub: payload.sub, // Por compatibilidad con código existente
      email: payload.email, 
      role: payload.role 
    };
  }
}