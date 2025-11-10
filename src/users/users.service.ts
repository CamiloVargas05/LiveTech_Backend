import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto, VerifyCodeDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';

@Injectable()
export class UsersService {
  private transporter;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {
    // Configurar nodemailer con Gmail
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // Tu email de Gmail
        pass: process.env.EMAIL_PASSWORD, // Tu contraseña de aplicación de Gmail
      },
    });
  }

  // ==================== PÚBLICO ====================

  async register(registerDto: RegisterDto) {
    const existingUser = await this.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = this.usersRepository.create({
      ...registerDto,
      password: hashedPassword,
      role: UserRole.USER,
    });

    const savedUser = await this.usersRepository.save(user);

    return {
      message: 'Usuario registrado exitosamente',
      user: this.sanitizeUser(savedUser),
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.findByEmail(forgotPasswordDto.email);

    if (!user) {
      throw new NotFoundException(
        'Este email no está registrado en el sistema',
      );
    }

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Guardar código hasheado y expiración (15 minutos)
    const hashedCode = await bcrypt.hash(code, 10);
    await this.usersRepository.update(user.id, {
      resetPasswordCode: hashedCode,
      resetPasswordExpires: new Date(Date.now() + 15 * 60000), // 15 minutos
    });

    // Enviar email con el código
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Código de recuperación de contraseña',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Recuperación de Contraseña</h2>
            <p>Hola ${user.name},</p>
            <p>Has solicitado recuperar tu contraseña. Tu código de verificación es:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${code}
            </div>
            <p>Este código expirará en 15 minutos.</p>
            <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #888; font-size: 12px;">Este es un correo automático, por favor no responder.</p>
          </div>
        `,
      });

      return {
        message: 'Código de verificación enviado a tu correo',
      };
    } catch (error) {
      console.error('Error al enviar email:', error);
      throw new BadRequestException(
        'Error al enviar el correo de recuperación',
      );
    }
  }

  async verifyCode(verifyCodeDto: VerifyCodeDto) {
    const { email, code } = verifyCodeDto;

    const user = await this.findByEmail(email);
    if (!user || !user.resetPasswordCode || !user.resetPasswordExpires) {
      throw new BadRequestException('Código inválido o expirado');
    }

    // Verificar si el código ha expirado
    if (new Date() > user.resetPasswordExpires) {
      throw new BadRequestException('El código ha expirado');
    }

    // Verificar el código
    const isCodeValid = await bcrypt.compare(code, user.resetPasswordCode);
    if (!isCodeValid) {
      throw new BadRequestException('Código incorrecto');
    }

    return {
      message: 'Código verificado correctamente',
      valid: true,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, code, newPassword, confirmPassword } = resetPasswordDto;

    // Validar que las contraseñas coincidan
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }

    const user = await this.findByEmail(email);
    if (!user || !user.resetPasswordCode || !user.resetPasswordExpires) {
      throw new BadRequestException('Código inválido o expirado');
    }

    // Verificar si el código ha expirado
    if (new Date() > user.resetPasswordExpires) {
      throw new BadRequestException('El código ha expirado');
    }

    // Verificar el código
    const isCodeValid = await bcrypt.compare(code, user.resetPasswordCode);
    if (!isCodeValid) {
      throw new BadRequestException('Código incorrecto');
    }

    // Actualizar contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.update(user.id, {
      password: hashedPassword,
      resetPasswordCode: null,
      resetPasswordExpires: null,
    });

    return {
      message: 'Contraseña restablecida exitosamente',
    };
  }

  // ==================== AUTENTICADO ====================

  async getProfile(userId: string) {
    const user = await this.findOne(userId);
    return this.sanitizeUser(user);
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    await this.usersRepository.update(userId, updateProfileDto);
    const updatedUser = await this.findOne(userId);

    return {
      message: 'Perfil actualizado exitosamente',
      user: this.sanitizeUser(updatedUser),
    };
  }

  // ==================== SOLO ADMIN ====================

  async createUser(createUserDto: CreateUserDto): Promise<any> {
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role: createUserDto.role || UserRole.USER,
    });

    const savedUser = await this.usersRepository.save(user);

    return {
      message: 'Usuario creado exitosamente',
      user: this.sanitizeUser(savedUser),
    };
  }

  async findAll(
    role?: UserRole,
    isActive?: boolean,
    search?: string,
  ): Promise<any> {
    const queryBuilder = this.usersRepository.createQueryBuilder('user');

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
      console.log('Aplicando filtro role:', role);
    }

    // Solo aplicar el filtro si isActive NO es undefined
    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }

    if (search) {
      queryBuilder.andWhere(
        '(user.name ILIKE :search OR user.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    queryBuilder.orderBy('user.createdAt', 'DESC');

    const users = await queryBuilder.getMany();

    return {
      total: users.length,
      users: users.map((user) => this.sanitizeUser(user)),
    };
  }
  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<any> {
    const user = await this.findOne(id);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser) {
        throw new ConflictException('El email ya está registrado');
      }
    }

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    await this.usersRepository.update(id, updateUserDto);
    const updatedUser = await this.findOne(id);

    return {
      message: 'Usuario actualizado exitosamente',
      user: this.sanitizeUser(updatedUser),
    };
  }

  async toggleActive(id: string): Promise<any> {
    const user = await this.findOne(id);

    await this.usersRepository.update(id, {
      isActive: !user.isActive,
    });

    const updatedUser = await this.findOne(id);

    return {
      message: `Usuario ${updatedUser.isActive ? 'activado' : 'desactivado'} exitosamente`,
      user: this.sanitizeUser(updatedUser),
    };
  }

  async getUserStats(): Promise<any> {
    const [total, activeUsers, inactiveUsers] = await Promise.all([
      this.usersRepository.count(),
      this.usersRepository.count({ where: { isActive: true } }),
      this.usersRepository.count({ where: { isActive: false } }),
    ]);

    const [admins, tecnicos, regularUsers] = await Promise.all([
      this.usersRepository.count({ where: { role: UserRole.ADMIN } }),
      this.usersRepository.count({ where: { role: UserRole.TECNICO } }),
      this.usersRepository.count({ where: { role: UserRole.USER } }),
    ]);

    return {
      total,
      activeUsers,
      inactiveUsers,
      byRole: {
        admins,
        tecnicos,
        users: regularUsers,
      },
    };
  }

  // ==================== MÉTODOS AUXILIARES ====================

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepository.findOne({ where: { email } });
  }

  private sanitizeUser(user: User) {
    const { password, resetPasswordCode, resetPasswordExpires, ...sanitized } =
      user;
    return sanitized;
  }
}
