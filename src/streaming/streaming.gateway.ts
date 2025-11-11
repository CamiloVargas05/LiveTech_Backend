// streaming/streaming.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MantenimientoService } from 'src/mantenimiento/mantenimiento.service';
import { SesionStreaming, MensajeChat } from './interfaces/streaming.interface';
import type { DatosWebRTC } from './interfaces/streaming.interface';
import { EstadoMantenimiento } from '../mantenimiento/entities/mantenimiento.entity';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // En producción, especifica tu dominio
    credentials: true,
  },
  namespace: '/streaming',
})
export class StreamingGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(StreamingGateway.name);

  // Almacenamiento en memoria
  private sesionesActivas = new Map<string, SesionStreaming>();
  private tecnicosActivos = new Map<string, string>(); // tecnicoId → mantenimientoId
  private socketToUser = new Map<string, string>(); // socketId → userId

  constructor(
    private jwtService: JwtService,
    private mantenimientoService: MantenimientoService,
  ) {
  console.log('🏗️ StreamingGateway - Constructor ejecutado');
  console.log('✅ JwtService inyectado:', !!jwtService);
  console.log('✅ MantenimientoService inyectado:', !!mantenimientoService);
}

  // ==================== CONEXIÓN Y DESCONEXIÓN ====================

  afterInit(server: Server) {
    this.logger.log('========================================');
    this.logger.log('🚀 WebSocket Gateway INICIALIZADO');
    this.logger.log('📡 Namespace: /streaming');
    this.logger.log('🌐 Escuchando conexiones...');
    this.logger.log('========================================');
  }

  async handleConnection(client: Socket) {
    this.logger.log('========================================');
    this.logger.log('🔔 INTENTO DE CONEXIÓN DETECTADO');
    this.logger.log(`Socket ID: ${client.id}`);
    
    try {
      const token = 
        client.handshake.auth.token || 
        client.handshake.headers.authorization?.split(' ')[1] ||
        client.handshake.query.token as string ||
        client.handshake.headers.token as string;

      this.logger.log(`Token recibido: ${token ? 'SÍ ✅' : 'NO ❌'}`);

      if (!token) {
        throw new UnauthorizedException('Token no proporcionado');
      }

      const decoded = this.jwtService.verify(token);

      client.data.userId = decoded.sub;
      client.data.userRole = decoded.role;
      client.data.userEmail = decoded.email;

      this.socketToUser.set(client.id, decoded.sub);

      this.logger.log(`✅ Cliente AUTENTICADO`);
      this.logger.log(`📧 Email: ${decoded.email}`);
      this.logger.log(`👤 Rol: ${decoded.role}`);
      this.logger.log('========================================');
    } catch (error) {
      this.logger.error('========================================');
      this.logger.error(`❌ ERROR EN AUTENTICACIÓN`);
      this.logger.error(`Mensaje: ${error.message}`);
      this.logger.error('========================================');
      client.emit('error', { message: 'Autenticación fallida' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    const userRole = client.data.userRole;

    this.logger.log(`Cliente desconectado: ${client.id} | Usuario: ${userId}`);

    // Si es un técnico, finalizar su sesión activa
    if (userRole === 'tecnico') {
      const mantenimientoId = this.tecnicosActivos.get(userId);
      if (mantenimientoId) {
        await this.finalizarStreamPorDesconexion(mantenimientoId, client);
      }
    }

    // Si es un usuario, notificar al técnico que se desconectó
    if (userRole === 'user') {
      for (const [mantenimientoId, sesion] of this.sesionesActivas) {
        if (sesion.usuarioSocketId === client.id) {
          sesion.usuarioSocketId = null;
          this.server.to(sesion.tecnicoSocketId).emit('usuario-desconectado', {
            mantenimientoId,
          });
          break;
        }
      }
    }

    this.socketToUser.delete(client.id);
  }

  // ==================== INICIAR STREAM (TÉCNICO) ====================

  @SubscribeMessage('iniciar-stream')
  async iniciarStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { mantenimientoId: string },
  ) {
    try {
      const tecnicoId = client.data.userId;
      const tecnicoRole = client.data.userRole;

      // Validar que sea técnico
      if (tecnicoRole !== 'tecnico') {
        client.emit('error', { message: 'Solo los técnicos pueden iniciar streams' });
        return;
      }

      // Verificar si ya tiene una sesión activa
      if (this.tecnicosActivos.has(tecnicoId)) {
        const mantenimientoActivoId = this.tecnicosActivos.get(tecnicoId);
        client.emit('error', {
          message: 'Ya tienes un mantenimiento activo',
          mantenimientoActivo: mantenimientoActivoId,
        });
        return;
      }

      // Obtener el mantenimiento de la BD
      const mantenimiento = await this.mantenimientoService.encontrarUno(data.mantenimientoId);

      // Validar que el técnico es el asignado
      if (mantenimiento.tecnicoId !== tecnicoId) {
        client.emit('error', { message: 'No eres el técnico asignado a este mantenimiento' });
        return;
      }

      // Validar que el estado sea EN_REVISION
      if (mantenimiento.estado !== EstadoMantenimiento.EN_REVISION) {
        client.emit('error', { message: 'El mantenimiento debe estar en estado EN_REVISION' });
        return;
      }

      // Crear sesión en memoria
      const sesion: SesionStreaming = {
        mantenimientoId: data.mantenimientoId,
        tecnicoSocketId: client.id,
        tecnicoId: tecnicoId,
        usuarioSocketId: null,
        usuarioId: mantenimiento.usuarioId,
        iniciadoEn: new Date(),
      };

      this.sesionesActivas.set(data.mantenimientoId, sesion);
      this.tecnicosActivos.set(tecnicoId, data.mantenimientoId);

      // Unir al técnico a la sala del mantenimiento
      client.join(`mantenimiento-${data.mantenimientoId}`);

      this.logger.log(`Stream iniciado: ${data.mantenimientoId} por técnico ${tecnicoId}`);

      client.emit('stream-iniciado', {
        mantenimientoId: data.mantenimientoId,
        sesionId: data.mantenimientoId,
      });
    } catch (error) {
      this.logger.error(`Error al iniciar stream: ${error.message}`);
      client.emit('error', { message: 'Error al iniciar el stream' });
    }
  }

  // ==================== UNIRSE AL STREAM (USUARIO) ====================

  @SubscribeMessage('unirse-stream')
  async unirseStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { mantenimientoId: string },
  ) {
    try {
      const usuarioId = client.data.userId;
      const usuarioRole = client.data.userRole;

      // Validar que sea usuario
      if (usuarioRole !== 'user') {
        client.emit('error', { message: 'Solo los usuarios pueden ver streams' });
        return;
      }

      // Verificar que exista una sesión activa
      const sesion = this.sesionesActivas.get(data.mantenimientoId);
      if (!sesion) {
        client.emit('error', { message: 'No hay un stream activo para este mantenimiento' });
        return;
      }

      // Validar que el usuario es el dueño del mantenimiento
      if (sesion.usuarioId !== usuarioId) {
        client.emit('error', { message: 'No tienes permiso para ver este stream' });
        return;
      }

      // Actualizar sesión con socket del usuario
      sesion.usuarioSocketId = client.id;

      // Unir al usuario a la sala del mantenimiento
      client.join(`mantenimiento-${data.mantenimientoId}`);

      this.logger.log(`Usuario ${usuarioId} se unió al stream: ${data.mantenimientoId}`);

      // Notificar al técnico que el usuario se conectó
      this.server.to(sesion.tecnicoSocketId).emit('usuario-conectado', {
        mantenimientoId: data.mantenimientoId,
      });

      client.emit('stream-disponible', {
        mantenimientoId: data.mantenimientoId,
        tecnicoSocketId: sesion.tecnicoSocketId,
      });
    } catch (error) {
      this.logger.error(`Error al unirse al stream: ${error.message}`);
      client.emit('error', { message: 'Error al unirse al stream' });
    }
  }

  // ==================== SEÑALIZACIÓN WEBRTC ====================

  @SubscribeMessage('webrtc-offer')
  async handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DatosWebRTC,
  ) {
    try {
      const sesion = this.sesionesActivas.get(data.mantenimientoId);
      if (!sesion) return;

      // El técnico envía offer al usuario
      if (sesion.usuarioSocketId) {
        this.server.to(sesion.usuarioSocketId).emit('webrtc-offer', {
          offer: data.offer,
          mantenimientoId: data.mantenimientoId,
        });
        this.logger.log(`Offer enviado para mantenimiento: ${data.mantenimientoId}`);
      }
    } catch (error) {
      this.logger.error(`Error en offer: ${error.message}`);
    }
  }

  @SubscribeMessage('webrtc-answer')
  async handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DatosWebRTC,
  ) {
    try {
      const sesion = this.sesionesActivas.get(data.mantenimientoId);
      if (!sesion) return;

      // El usuario envía answer al técnico
      this.server.to(sesion.tecnicoSocketId).emit('webrtc-answer', {
        answer: data.answer,
        mantenimientoId: data.mantenimientoId,
      });
      this.logger.log(`Answer enviado para mantenimiento: ${data.mantenimientoId}`);
    } catch (error) {
      this.logger.error(`Error en answer: ${error.message}`);
    }
  }

  @SubscribeMessage('webrtc-ice-candidate')
  async handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DatosWebRTC,
  ) {
    try {
      const sesion = this.sesionesActivas.get(data.mantenimientoId);
      if (!sesion) return;

      // Reenviar ice candidate al otro peer
      const targetSocketId = client.id === sesion.tecnicoSocketId
        ? sesion.usuarioSocketId
        : sesion.tecnicoSocketId;

      if (targetSocketId) {
        this.server.to(targetSocketId).emit('webrtc-ice-candidate', {
          candidate: data.candidate,
          mantenimientoId: data.mantenimientoId,
        });
      }
    } catch (error) {
      this.logger.error(`Error en ice candidate: ${error.message}`);
    }
  }

  // ==================== CHAT EN TIEMPO REAL ====================

  @SubscribeMessage('chat-mensaje')
  async handleChatMensaje(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { mantenimientoId: string; mensaje: string },
  ) {
    try {
      const sesion = this.sesionesActivas.get(data.mantenimientoId);
      if (!sesion) {
        client.emit('error', { message: 'Sesión no encontrada' });
        return;
      }

      const userId = client.data.userId;
      const userName = client.data.userEmail;

      // Validar que el usuario pertenece a esta sesión
      if (userId !== sesion.tecnicoId && userId !== sesion.usuarioId) {
        client.emit('error', { message: 'No tienes permiso para enviar mensajes en este chat' });
        return;
      }

      const mensaje: MensajeChat = {
        mantenimientoId: data.mantenimientoId,
        usuarioId: userId,
        usuarioNombre: userName,
        mensaje: data.mensaje,
        timestamp: new Date(),
      };

      // Enviar mensaje a toda la sala (técnico y usuario)
      this.server.to(`mantenimiento-${data.mantenimientoId}`).emit('chat-mensaje', mensaje);

      this.logger.log(`Mensaje en mantenimiento ${data.mantenimientoId}: ${data.mensaje}`);
    } catch (error) {
      this.logger.error(`Error en chat: ${error.message}`);
    }
  }

  // ==================== FINALIZAR STREAM ====================

  @SubscribeMessage('finalizar-stream')
  async finalizarStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { mantenimientoId: string },
  ) {
    try {
      const tecnicoId = client.data.userId;
      const sesion = this.sesionesActivas.get(data.mantenimientoId);

      if (!sesion) {
        client.emit('error', { message: 'Sesión no encontrada' });
        return;
      }

      // Validar que quien finaliza es el técnico de la sesión
      if (sesion.tecnicoId !== tecnicoId) {
        client.emit('error', { message: 'No tienes permiso para finalizar este stream' });
        return;
      }

      // Notificar a todos en la sala que el stream finalizó
      this.server.to(`mantenimiento-${data.mantenimientoId}`).emit('stream-finalizado', {
        mantenimientoId: data.mantenimientoId,
      });

      // Limpiar sesión de memoria
      this.sesionesActivas.delete(data.mantenimientoId);
      this.tecnicosActivos.delete(tecnicoId);

      this.logger.log(`Stream finalizado: ${data.mantenimientoId}`);

      client.emit('stream-finalizado-confirmado', {
        mantenimientoId: data.mantenimientoId,
      });
    } catch (error) {
      this.logger.error(`Error al finalizar stream: ${error.message}`);
      client.emit('error', { message: 'Error al finalizar el stream' });
    }
  }

  // ==================== MÉTODOS AUXILIARES ====================

  private async finalizarStreamPorDesconexion(mantenimientoId: string, client: Socket) {
    const sesion = this.sesionesActivas.get(mantenimientoId);
    if (!sesion) return;

    // Notificar al usuario que el técnico se desconectó
    if (sesion.usuarioSocketId) {
      this.server.to(sesion.usuarioSocketId).emit('tecnico-desconectado', {
        mantenimientoId,
        message: 'El técnico se ha desconectado',
      });
    }

    // Limpiar sesión
    this.sesionesActivas.delete(mantenimientoId);
    this.tecnicosActivos.delete(sesion.tecnicoId);

    this.logger.log(`Stream finalizado por desconexión: ${mantenimientoId}`);
  }

  // Método para obtener sesiones activas (para debugging)
  getSesionesActivas(): SesionStreaming[] {
    return Array.from(this.sesionesActivas.values());
  }
  
}