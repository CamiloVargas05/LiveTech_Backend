import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    // Buscar usuario
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar si está activo
    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Generar token
    const token = this.generateToken(user);

    return {
      message: 'Login exitoso',
      user: this.sanitizeUser(user),
      token,
    };
  }

  async logout() {
    // En JWT stateless, el logout se maneja en el frontend eliminando el token
    return {
      message: 'Logout exitoso',
    };
  }

  // Método auxiliar para generar token
  generateToken(user: User): string {
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role 
    };
    return this.jwtService.sign(payload);
  }

  // Método auxiliar para sanitizar usuario
  private sanitizeUser(user: User) {
    const { password, resetPasswordCode, resetPasswordExpires, ...sanitized } = user;
    return sanitized;
  }
}