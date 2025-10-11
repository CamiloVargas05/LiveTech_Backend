import { 
  Injectable, 
  NotFoundException, 
  BadRequestException,
  ConflictException 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  // ==================== PÚBLICO ====================

  async register(registerDto: RegisterDto) {
    // Verificar si el usuario ya existe
    const existingUser = await this.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Crear usuario con role "user" forzado
    const user = this.usersRepository.create({
      ...registerDto,
      password: hashedPassword,
      role: UserRole.USER,  // Siempre "user" en registro público
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
      // Por seguridad, no revelamos si el email existe o no
      return {
        message: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña',
      };
    }

    // Generar token de recuperación
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);

    // Guardar token y expiración (1 hora)
    await this.usersRepository.update(user.id, {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: new Date(Date.now() + 3600000), // 1 hora
    });

    // TODO: Aquí deberías enviar un email con el token
    // Por ahora lo retornamos (solo para desarrollo)
    console.log('Token de recuperación:', resetToken);

    return {
      message: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña',
      // En producción, NO retornes el token
      resetToken, // Solo para desarrollo
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    // Buscar usuario con token válido
    const users = await this.usersRepository.find();
    let user: User | null = null;

    for (const u of users) {
      if (u.resetPasswordToken && u.resetPasswordExpires) {
        const isTokenValid = await bcrypt.compare(token, u.resetPasswordToken);
        const isTokenExpired = new Date() > u.resetPasswordExpires;

        if (isTokenValid && !isTokenExpired) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    // Actualizar contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.update(user.id, {
      password: hashedPassword,
      resetPasswordToken: null,
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
    // Verificar si el email ya existe
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Crear usuario (admin puede especificar role)
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role: createUserDto.role || UserRole.USER, // Default a "user" si no se especifica
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

    // Filtrar por rol
    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    // Filtrar por estado activo
    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }

    // Búsqueda por nombre o email
    if (search) {
      queryBuilder.andWhere(
        '(user.name ILIKE :search OR user.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Ordenar por fecha de creación (más recientes primero)
    queryBuilder.orderBy('user.createdAt', 'DESC');

    const users = await queryBuilder.getMany();

    return {
      total: users.length,
      users: users.map(user => this.sanitizeUser(user)),
    };
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<any> {
    const user = await this.findOne(id);

    // Si se está actualizando el email, verificar que no exista
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser) {
        throw new ConflictException('El email ya está registrado');
      }
    }

    // Si se está actualizando la contraseña, hashearla
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
    const { password, resetPasswordToken, resetPasswordExpires, ...sanitized } = user;
    return sanitized;
  }
}