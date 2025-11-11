
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Mantenimiento,
  EstadoMantenimiento,
} from './entities/mantenimiento.entity';
import { CreateMantenimientoDto } from './dto/create-mantenimiento.dto';
import { UpdateMantenimientoDto } from './dto/update-mantenimiento.dto';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../config/supabase.config';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';

import * as nodemailer from 'nodemailer';

@Injectable()
export class MantenimientoService {
  private transporter;
  private readonly bucketName = 'fotos-mantenimientos';
  private supabase: SupabaseClient;

  constructor(
    @InjectRepository(Mantenimiento)
    private mantenimientoRepository: Repository<Mantenimiento>,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {
    // Inicializar Supabase con ConfigService
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Faltan las credenciales de Supabase en las variables de entorno',
      );
    }

    this.supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Configurar nodemailer
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
    });
  }
  private sanitizarNombreArchivo(nombreOriginal: string): string {
    // Remover espacios y caracteres especiales
    const nombreLimpio = nombreOriginal
      .toLowerCase()
      .replace(/\s+/g, '-') // Reemplazar espacios con guiones
      .replace(/[^\w\-\.]/g, '') // Remover caracteres especiales excepto guiones, puntos y letras
      .replace(/\-+/g, '-'); // Reemplazar múltiples guiones con uno solo

    return nombreLimpio;
  }

  async crear(
    crearMantenimientoDto: CreateMantenimientoDto,
    foto?: Express.Multer.File,
  ) {
    // Validar que el usuario existe y tiene rol USER
    const usuario = await this.usersService.findOne(
      crearMantenimientoDto.usuarioId,
    );
    if (usuario.role !== UserRole.USER) {
      throw new BadRequestException('El usuario asignado debe tener rol USER');
    }

    // Validar que el técnico existe y tiene rol TECNICO
    const tecnico = await this.usersService.findOne(
      crearMantenimientoDto.tecnicoId,
    );
    if (tecnico.role !== UserRole.TECNICO) {
      throw new BadRequestException(
        'El técnico asignado debe tener rol TECNICO',
      );
    }

    let fotoUrl: string | null = null;
    let fotoPath: string | null = null;

    // Subir foto a Supabase si existe
    if (foto) {
      const nombreArchivoLimpio = this.sanitizarNombreArchivo(
        foto.originalname,
      );
      const fileName = `${Date.now()}-${nombreArchivoLimpio}`;
      const filePath = `${fileName}`;

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, foto.buffer, {
          contentType: foto.mimetype,
          upsert: false,
        });

      if (error) {
        throw new BadRequestException(
          'Error al subir la foto: ' + error.message,
        );
      }

      // Obtener URL pública
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      fotoUrl = urlData.publicUrl;
      fotoPath = filePath;
    }

    // Crear mantenimiento con tipo explícito
    const nuevoMantenimiento: Partial<Mantenimiento> = {
      nombreEquipo: crearMantenimientoDto.nombreEquipo,
      marca: crearMantenimientoDto.marca,
      modelo: crearMantenimientoDto.modelo,
      descripcionProblema: crearMantenimientoDto.descripcionProblema,
      usuarioId: crearMantenimientoDto.usuarioId,
      tecnicoId: crearMantenimientoDto.tecnicoId,
      estado: EstadoMantenimiento.PENDIENTE,
    };

    if (fotoUrl) {
      nuevoMantenimiento.fotoUrl = fotoUrl;
    }

    if (fotoPath) {
      nuevoMantenimiento.fotoPath = fotoPath;
    }

    const mantenimiento =
      this.mantenimientoRepository.create(nuevoMantenimiento);
    const mantenimientoGuardado =
      await this.mantenimientoRepository.save(mantenimiento);

    // Enviar email al usuario con diseño mejorado
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('EMAIL_USER'),
        to: usuario.email,
        subject: '✅ Nuevo Mantenimiento Registrado - LiveTech',
        html: this.generarEmailNuevoMantenimiento(
          usuario.name,
          crearMantenimientoDto,
          tecnico.name,
        ),
      });
    } catch (error) {
      console.error('Error al enviar email:', error);
    }

    return {
      message: 'Mantenimiento creado exitosamente',
      mantenimiento: await this.encontrarUnoConRelaciones(
        mantenimientoGuardado.id,
      ),
    };
  }

  async encontrarTodos() {
    const mantenimientos = await this.mantenimientoRepository.find({
      relations: ['usuario', 'tecnico'],
      order: { creadoEn: 'DESC' },
    });

    return {
      total: mantenimientos.length,
      mantenimientos: mantenimientos.map((m) => this.sanitizarMantenimiento(m)),
    };
  }

  async encontrarPorToken(userId: string, userRole: UserRole) {
    let mantenimientos: Mantenimiento[] = [];

    if (userRole === UserRole.TECNICO) {
      mantenimientos = await this.mantenimientoRepository.find({
        where: { tecnicoId: userId },
        relations: ['usuario', 'tecnico'],
        order: { creadoEn: 'DESC' },
      });
    } else if (userRole === UserRole.USER) {
      mantenimientos = await this.mantenimientoRepository.find({
        where: { usuarioId: userId },
        relations: ['usuario', 'tecnico'],
        order: { creadoEn: 'DESC' },
      });
    } else {
      mantenimientos = await this.mantenimientoRepository.find({
        relations: ['usuario', 'tecnico'],
        order: { creadoEn: 'DESC' },
      });
    }

    return {
      total: mantenimientos.length,
      mantenimientos: mantenimientos.map((m) => this.sanitizarMantenimiento(m)),
    };
  }

  async encontrarUno(id: string) {
    const mantenimiento = await this.encontrarUnoConRelaciones(id);
    return this.sanitizarMantenimiento(mantenimiento);
  }

  async actualizar(
    id: string,
    actualizarMantenimientoDto: UpdateMantenimientoDto,
    foto?: Express.Multer.File,
  ) {
    const mantenimiento = await this.encontrarUnoConRelaciones(id);

    const dataActualizar: any = { ...actualizarMantenimientoDto };

    // Si hay nueva foto, eliminar la anterior y subir la nueva
    if (foto) {
      // Eliminar foto anterior si existe
      if (mantenimiento.fotoPath) {
        await this.supabase.storage
          .from(this.bucketName)
          .remove([mantenimiento.fotoPath]);
      }

      // Subir nueva foto
      const nombreArchivoLimpio = this.sanitizarNombreArchivo(
        foto.originalname,
      );
      const fileName = `${Date.now()}-${nombreArchivoLimpio}`;
      const filePath = `${fileName}`;

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, foto.buffer, {
          contentType: foto.mimetype,
          upsert: false,
        });

      if (error) {
        throw new BadRequestException(
          'Error al subir la foto: ' + error.message,
        );
      }

      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      dataActualizar.fotoUrl = urlData.publicUrl;
      dataActualizar.fotoPath = filePath;
    }

    await this.mantenimientoRepository.update(id, dataActualizar);
    const actualizado = await this.encontrarUnoConRelaciones(id);

    return {
      message: 'Mantenimiento actualizado exitosamente',
      mantenimiento: this.sanitizarMantenimiento(actualizado),
    };
  }

  async eliminar(id: string) {
    const mantenimiento = await this.encontrarUnoConRelaciones(id);

    // Eliminar foto de Supabase si existe
    if (mantenimiento.fotoPath) {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([mantenimiento.fotoPath]);

      if (error) {
        console.error('Error al eliminar foto de Supabase:', error);
      }
    }

    await this.mantenimientoRepository.remove(mantenimiento);

    return {
      message: 'Mantenimiento eliminado exitosamente',
    };
  }

  async iniciarMantenimiento(id: string, tecnicoId: string) {
    const mantenimiento = await this.encontrarUnoConRelaciones(id);

    if (mantenimiento.tecnicoId !== tecnicoId) {
      throw new BadRequestException('No estás asignado a este mantenimiento');
    }

    if (mantenimiento.estado !== EstadoMantenimiento.PENDIENTE) {
      throw new BadRequestException(
        'Este mantenimiento ya fue iniciado o finalizado',
      );
    }

    await this.mantenimientoRepository.update(id, {
      estado: EstadoMantenimiento.EN_REVISION,
    });

    const actualizado = await this.encontrarUnoConRelaciones(id);

    // Enviar email al usuario con diseño mejorado
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('EMAIL_USER'),
        to: actualizado.usuario.email,
        subject: '🔧 Tu Dispositivo Está en Revisión - LiveTech',
        html: this.generarEmailRevisionIniciada(
          actualizado.usuario.name,
          actualizado.tecnico.name,
          actualizado.nombreEquipo,
        ),
      });
    } catch (error) {
      console.error('Error al enviar email:', error);
    }

    return {
      message: 'Mantenimiento iniciado exitosamente',
      mantenimiento: this.sanitizarMantenimiento(actualizado),
    };
  }

  // Métodos auxiliares
  private async encontrarUnoConRelaciones(id: string): Promise<Mantenimiento> {
    const mantenimiento = await this.mantenimientoRepository.findOne({
      where: { id },
      relations: ['usuario', 'tecnico'],
    });

    if (!mantenimiento) {
      throw new NotFoundException('Mantenimiento no encontrado');
    }

    return mantenimiento;
  }

  private sanitizarMantenimiento(mantenimiento: Mantenimiento) {
    const { usuario, tecnico, ...datos } = mantenimiento;

    return {
      ...datos,
      usuario: usuario
        ? {
            id: usuario.id,
            nombre: usuario.name,
            email: usuario.email,
            rol: usuario.role,
          }
        : null,
      tecnico: tecnico
        ? {
            id: tecnico.id,
            nombre: tecnico.name,
            email: tecnico.email,
            rol: tecnico.role,
          }
        : null,
    };
  }
  // mantenimiento.service.ts - Agregar este método

async finalizarMantenimiento(id: string, tecnicoId: string) {
  const mantenimiento = await this.encontrarUnoConRelaciones(id);

  // Validar que el técnico que finaliza es el asignado
  if (mantenimiento.tecnicoId !== tecnicoId) {
    throw new BadRequestException('No estás asignado a este mantenimiento');
  }

  // Validar que esté en estado EN_REVISION
  if (mantenimiento.estado !== EstadoMantenimiento.EN_REVISION) {
    throw new BadRequestException('Este mantenimiento no está en revisión');
  }

  // Actualizar estado a FINALIZADO
  await this.mantenimientoRepository.update(id, {
    estado: EstadoMantenimiento.FINALIZADO,
  });

  const actualizado = await this.encontrarUnoConRelaciones(id);

  // Enviar email al usuario (opcional)
  try {
    await this.transporter.sendMail({
      from: this.configService.get<string>('EMAIL_USER'),
      to: actualizado.usuario.email,
      subject: '✅ Mantenimiento Finalizado - LiveTech',
      html: this.generarEmailMantenimientoFinalizado(
        actualizado.usuario.name,
        actualizado.tecnico.name,
        actualizado.nombreEquipo
      ),
    });
  } catch (error) {
    console.error('Error al enviar email:', error);
  }

  return {
    message: 'Mantenimiento finalizado exitosamente',
    mantenimiento: this.sanitizarMantenimiento(actualizado),
  };
}


// Template de email para mantenimiento finalizado
private generarEmailMantenimientoFinalizado(nombreUsuario: string, nombreTecnico: string, nombreEquipo: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0fdf4;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; padding: 40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                  <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                    <tr>
                      <td style="background-color: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); padding: 12px 24px; border-radius: 12px;">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding-right: 12px; vertical-align: middle;">
                              <div style="width: 32px; height: 32px; background-color: white; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; padding: 8px;">
                                <span style="font-size: 20px;">🎧</span>
                              </div>
                            </td>
                            <td style="vertical-align: middle;">
                              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700; line-height: 1;">
                                Live<span style="color: #d1fae5;">Tech</span>
                              </h1>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <div style="text-align: center; margin-bottom: 30px;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                      <span style="font-size: 40px;">✅</span>
                    </div>
                    <h2 style="color: #1f2937; font-size: 26px; margin: 0 0 12px 0; font-weight: 700;">¡Mantenimiento Completado!</h2>
                    <p style="color: #10b981; font-size: 16px; margin: 0; font-weight: 600;">Tu dispositivo está listo</p>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">Hola <strong>${nombreUsuario}</strong>,</p>
                  <p style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">El técnico <strong style="color: #10b981;">${nombreTecnico}</strong> ha finalizado el mantenimiento de tu dispositivo <strong>${nombreEquipo}</strong>.</p>
                  
                  <!-- Info Card -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; border: 2px solid #10b981;">
                    <tr>
                      <td style="padding: 30px; text-align: center;">
                        <h3 style="color: #047857; font-size: 20px; margin: 0 0 16px 0; font-weight: 700;">📋 Estado Final</h3>
                        <p style="color: #065f46; font-size: 14px; line-height: 1.6; margin: 0;">
                          El mantenimiento se ha completado exitosamente. Puedes recoger tu dispositivo en nuestras instalaciones.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 30px 0 0 0;">Gracias por confiar en LiveTech.</p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0;">🔧 Tecnología 2025 - Soporte del Futuro</p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">Este es un correo automático, por favor no responder.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

  // Templates de email con diseño de LiveTech
  private generarEmailNuevoMantenimiento(
    nombreUsuario: string,
    datos: CreateMantenimientoDto,
    nombreTecnico: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0fdf4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
  <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
    <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
      <tr>
        <td style="; backdrop-filter: blur(10px); padding: 12px 24px; border-radius: 12px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right: 12px; vertical-align: middle;">
                <div style="width: 32px; height: 32px; background-color: rgba(255, 255, 255, 0.2); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; padding: 8px;">
                  <span style="font-size: 20px; margin-left: 4px;">🎧</span>
                </div>
              </td>
              <td style="vertical-align: middle;">
                <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700; line-height: 1;">
                  Live<span style="color: #d1fae5;">Tech</span>
                </h1>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #1f2937; font-size: 24px; margin: 0 0 16px 0; font-weight: 700;">¡Mantenimiento Registrado!</h2>
                    <p style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">Hola <strong>${nombreUsuario}</strong>,</p>
                    <p style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">Tu dispositivo ha sido registrado exitosamente en nuestro sistema. Nuestro equipo técnico se encargará de revisarlo pronto.</p>
                    
                    <!-- Info Card -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; border-left: 4px solid #10b981;">
                      <tr>
                        <td style="padding: 24px;">
                          <h3 style="color: #10b981; font-size: 18px; margin: 0 0 20px 0; font-weight: 600;">📋 Detalles del Mantenimiento</h3>
                          
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="color: #6b7280; font-size: 14px;">Equipo:</span>
                              </td>
                              <td style="padding: 8px 0; text-align: right;">
                                <strong style="color: #1f2937; font-size: 14px;">${datos.nombreEquipo}</strong>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
                                <span style="color: #6b7280; font-size: 14px;">Marca:</span>
                              </td>
                              <td style="padding: 8px 0; text-align: right; border-top: 1px solid #e5e7eb;">
                                <strong style="color: #1f2937; font-size: 14px;">${datos.marca}</strong>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
                                <span style="color: #6b7280; font-size: 14px;">Modelo:</span>
                              </td>
                              <td style="padding: 8px 0; text-align: right; border-top: 1px solid #e5e7eb;">
                                <strong style="color: #1f2937; font-size: 14px;">${datos.modelo}</strong>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
                                <span style="color: #6b7280; font-size: 14px;">Técnico Asignado:</span>
                              </td>
                              <td style="padding: 8px 0; text-align: right; border-top: 1px solid #e5e7eb;">
                                <strong style="color: #10b981; font-size: 14px;">${nombreTecnico}</strong>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
                                <span style="color: #6b7280; font-size: 14px;">Estado:</span>
                              </td>
                              <td style="padding: 8px 0; text-align: right; border-top: 1px solid #e5e7eb;">
                                <span style="background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">⏳ Pendiente</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 30px 0 0 0;">Te notificaremos inmediatamente cuando el técnico inicie la revisión de tu dispositivo.</p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0;">🔧 Tecnología 2025 - Soporte del Futuro</p>
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">Este es un correo automático, por favor no responder.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  private generarEmailRevisionIniciada(
    nombreUsuario: string,
    nombreTecnico: string,
    nombreEquipo: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0fdf4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
  <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
    <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
      <tr>
        <td style="; backdrop-filter: blur(10px); padding: 12px 24px; border-radius: 12px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right: 12px; vertical-align: middle;">
                <div style="width: 32px; height: 32px; background-color: rgba(255, 255, 255, 0.2); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; padding: 8px;">
                  <span style="font-size: 20px; margin-left: 4px;">🎧</span>
                </div>
              </td>
              <td style="vertical-align: middle;">
                <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700; line-height: 1;">
                  Live<span style="color: #d1fae5;">Tech</span>
                </h1>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                      
                      <h2 style="color: #1f2937; font-size: 26px; margin: 0 0 12px 0; font-weight: 700;">¡Revisión en Curso!</h2>
                      <p style="color: #10b981; font-size: 16px; margin: 0; font-weight: 600;">Tu dispositivo está siendo atendido</p>
                    </div>
                    
                    <p style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">Hola <strong>${nombreUsuario}</strong>,</p>
                    <p style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">Te informamos que <strong style="color: #10b981;">${nombreTecnico}</strong> ha iniciado la revisión de tu dispositivo <strong>${nombreEquipo}</strong>.</p>
                    
                    <!-- Action Card -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; border: 2px solid #10b981;">
                      <tr>
                        <td style="padding: 30px; text-align: center;">
                          <h3 style="color: #047857; font-size: 20px; margin: 0 0 16px 0; font-weight: 700;">📹 Transmisión en Vivo Disponible</h3>
                          <p style="color: #065f46; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                            Ahora puedes ingresar a la plataforma para visualizar el procedimiento en tiempo real y comunicarte con el técnico a través del chat.
                          </p>
                          <a href="#" style="display: inline-block; background-color: #10b981; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                            Ver Transmisión en Vivo →
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Features -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                      <tr>
                        <td width="50%" style="padding: 16px;">
                          <div style="text-align: center;">
                            <div style="font-size: 32px; margin-bottom: 8px;">💬</div>
                            <p style="color: #1f2937; font-size: 14px; font-weight: 600; margin: 0 0 4px 0;">Chat en Tiempo Real</p>
                            <p style="color: #6b7280; font-size: 12px; margin: 0;">Comunícate con el técnico</p>
                          </div>
                        </td>
                        <td width="50%" style="padding: 16px;">
                          <div style="text-align: center;">
                            <div style="font-size: 32px; margin-bottom: 8px;">📹</div>
                            <p style="color: #1f2937; font-size: 14px; font-weight: 600; margin: 0 0 4px 0;">Video en Directo</p>
                            <p style="color: #6b7280; font-size: 12px; margin: 0;">Observa el procedimiento</p>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0;">🔧 Tecnología 2025 - Soporte del Futuro</p>
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">Este es un correo automático, por favor no responder.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  // ==================== ESTADÍSTICAS ====================

async obtenerEstadisticas(userId: string, role: string) {
  let queryBuilder = this.mantenimientoRepository.createQueryBuilder('mantenimiento')
    .leftJoinAndSelect('mantenimiento.usuario', 'usuario')
    .leftJoinAndSelect('mantenimiento.tecnico', 'tecnico');

  // Filtrar según el rol
  if (role === 'tecnico') {
    queryBuilder = queryBuilder.where('mantenimiento.tecnicoId = :userId', { userId });
  } else if (role === 'user') {
    queryBuilder = queryBuilder.where('mantenimiento.usuarioId = :userId', { userId });
  }
  // Si es 'admin', no filtra (ve todo)

  const mantenimientos = await queryBuilder.getMany();

  // Calcular estadísticas
  const total = mantenimientos.length;
  const pendientes = mantenimientos.filter(m => m.estado === EstadoMantenimiento.PENDIENTE).length;
  const enRevision = mantenimientos.filter(m => m.estado === EstadoMantenimiento.EN_REVISION).length;
  const finalizados = mantenimientos.filter(m => m.estado === EstadoMantenimiento.FINALIZADO).length;

  // Estadísticas por tipo de equipo
  const equiposContador = mantenimientos.reduce((acc, m) => {
    const equipo = m.nombreEquipo || 'Sin especificar';
    acc[equipo] = (acc[equipo] || 0) + 1;
    return acc;
  }, {});

  // Estadísticas por marca
  const marcasContador = mantenimientos.reduce((acc, m) => {
    const marca = m.marca || 'Sin especificar';
    acc[marca] = (acc[marca] || 0) + 1;
    return acc;
  }, {});

  // Mantenimientos recientes (últimos 5)
  const recientes = mantenimientos
    .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime())
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      nombreEquipo: m.nombreEquipo,
      marca: m.marca,
      modelo: m.modelo,
      descripcionProblema: m.descripcionProblema,
      estado: m.estado,
      fechaCreacion: m.creadoEn,
      fotoUrl: m.fotoUrl,
      usuario: m.usuario ? { name: m.usuario.name, email: m.usuario.email } : null,
      tecnico: m.tecnico ? { name: m.tecnico.name, email: m.tecnico.email } : null,
    }));

  return {
    resumen: {
      total,
      pendientes,
      enRevision,
      finalizados,
      porcentajeFinalizado: total > 0 ? ((finalizados / total) * 100).toFixed(1) : 0,
    },
    porEquipo: equiposContador,
    porMarca: marcasContador,
    recientes,
  };
}

async obtenerResumenGeneral(userId: string, role: string) {
  let queryBuilder = this.mantenimientoRepository.createQueryBuilder('mantenimiento');

  // Filtrar según el rol
  if (role === 'tecnico') {
    queryBuilder = queryBuilder.where('mantenimiento.tecnicoId = :userId', { userId });
  } else if (role === 'user') {
    queryBuilder = queryBuilder.where('mantenimiento.usuarioId = :userId', { userId });
  }

  const mantenimientos = await queryBuilder.getMany();

  // Estadísticas por mes (últimos 6 meses)
  const hoy = new Date();
  const hace6Meses = new Date();
  hace6Meses.setMonth(hoy.getMonth() - 6);

  const porMes = mantenimientos
    .filter(m => new Date(m.creadoEn) >= hace6Meses)
    .reduce((acc, m) => {
      const mes = new Date(m.creadoEn).toLocaleString('es-ES', { month: 'long', year: 'numeric' });
      if (!acc[mes]) {
        acc[mes] = { total: 0, finalizados: 0, pendientes: 0, enRevision: 0 };
      }
      acc[mes].total++;
      if (m.estado === EstadoMantenimiento.FINALIZADO) acc[mes].finalizados++;
      if (m.estado === EstadoMantenimiento.PENDIENTE) acc[mes].pendientes++;
      if (m.estado === EstadoMantenimiento.EN_REVISION) acc[mes].enRevision++;
      return acc;
    }, {});

  return {
    totalMantenimientos: mantenimientos.length,
    estadisticasPorMes: porMes,
    tasaExito: {
      finalizados: mantenimientos.filter(m => m.estado === EstadoMantenimiento.FINALIZADO).length,
      total: mantenimientos.length,
      porcentaje: mantenimientos.length > 0 
        ? ((mantenimientos.filter(m => m.estado === EstadoMantenimiento.FINALIZADO).length / mantenimientos.length) * 100).toFixed(1)
        : 0,
    },
  };
}

// ==================== HISTORIAL ====================

async obtenerHistorialCompletados(userId: string, role: string) {
  let queryBuilder = this.mantenimientoRepository.createQueryBuilder('mantenimiento')
    .leftJoinAndSelect('mantenimiento.usuario', 'usuario')
    .leftJoinAndSelect('mantenimiento.tecnico', 'tecnico')
    .where('mantenimiento.estado = :estado', { estado: EstadoMantenimiento.FINALIZADO });

  // Filtrar según el rol
  if (role === 'tecnico') {
    queryBuilder = queryBuilder.andWhere('mantenimiento.tecnicoId = :userId', { userId });
  } else if (role === 'user') {
    queryBuilder = queryBuilder.andWhere('mantenimiento.usuarioId = :userId', { userId });
  }

  queryBuilder = queryBuilder.orderBy('mantenimiento.actualizadoEn', 'DESC');

  const historial = await queryBuilder.getMany();

  // Formatear historial con información detallada
  const historialFormateado = historial.map(m => {
    return {
      id: m.id,
      equipo: {
        nombre: m.nombreEquipo,
        marca: m.marca,
        modelo: m.modelo,
      },
      problema: m.descripcionProblema,
      estado: m.estado,
      fechas: {
        creacion: m.creadoEn,
        ultimaActualizacion: m.actualizadoEn,
      },
      usuario: m.usuario ? {
        id: m.usuario.id,
        nombre: m.usuario.name,
        email: m.usuario.email,
        telefono: m.usuario.phone,
      } : null,
      tecnico: m.tecnico ? {
        id: m.tecnico.id,
        nombre: m.tecnico.name,
        email: m.tecnico.email,
      } : null,
      fotoUrl: m.fotoUrl,
    };
  });

  // Estadísticas del historial
  const estadisticas = {
    totalFinalizados: historialFormateado.length,
    equiposMasAtendidos: this.obtenerEquiposMasAtendidos(historialFormateado),
    marcasMasAtendidas: this.obtenerMarcasMasAtendidas(historialFormateado),
  };

  return {
    estadisticas,
    historial: historialFormateado,
  };
}

async obtenerDetalleHistorial(id: string, userId: string, role: string) {
  const mantenimiento = await this.mantenimientoRepository.findOne({
    where: { id },
    relations: ['usuario', 'tecnico'],
  });

  if (!mantenimiento) {
    throw new NotFoundException('Mantenimiento no encontrado');
  }

  // Verificar permisos según rol
  if (role === 'tecnico' && mantenimiento.tecnicoId !== userId) {
    throw new ForbiddenException('No tienes permiso para ver este mantenimiento');
  }

  if (role === 'user' && mantenimiento.usuarioId !== userId) {
    throw new ForbiddenException('No tienes permiso para ver este mantenimiento');
  }

  return {
    id: mantenimiento.id,
    equipo: {
      nombre: mantenimiento.nombreEquipo,
      marca: mantenimiento.marca,
      modelo: mantenimiento.modelo,
    },
    detalles: {
      descripcionProblema: mantenimiento.descripcionProblema,
      estado: mantenimiento.estado,
    },
    timeline: {
      fechaCreacion: mantenimiento.creadoEn,
      ultimaActualizacion: mantenimiento.actualizadoEn,
    },
    participantes: {
      usuario: mantenimiento.usuario ? {
        id: mantenimiento.usuario.id,
        nombre: mantenimiento.usuario.name,
        email: mantenimiento.usuario.email,
        telefono: mantenimiento.usuario.phone,
      } : null,
      tecnico: mantenimiento.tecnico ? {
        id: mantenimiento.tecnico.id,
        nombre: mantenimiento.tecnico.name,
        email: mantenimiento.tecnico.email,
      } : null,
    },
    multimedia: {
      fotoUrl: mantenimiento.fotoUrl,
    },
  };
}

// ==================== MÉTODOS AUXILIARES ====================

private obtenerEquiposMasAtendidos(historial: any[]): any[] {
  const contador = historial.reduce((acc, h) => {
    const equipo = h.equipo.nombre || 'Sin especificar';
    acc[equipo] = (acc[equipo] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(contador)
    .map(([equipo, cantidad]) => ({ equipo, cantidad }))
    .sort((a: any, b: any) => b.cantidad - a.cantidad)
    .slice(0, 5);
}

private obtenerMarcasMasAtendidas(historial: any[]): any[] {
  const contador = historial.reduce((acc, h) => {
    const marca = h.equipo.marca || 'Sin especificar';
    acc[marca] = (acc[marca] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(contador)
    .map(([marca, cantidad]) => ({ marca, cantidad }))
    .sort((a: any, b: any) => b.cantidad - a.cantidad)
    .slice(0, 5);
}
}
