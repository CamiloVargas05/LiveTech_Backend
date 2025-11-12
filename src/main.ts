import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);

  // ⚠️ IMPORTANTE: IoAdapter ANTES de enableCors
  app.useWebSocketAdapter(new IoAdapter(app));
  
  // CORS
  app.enableCors({
    origin: [
      'https://livetech-ventas.up.railway.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://livetechbackend-ventas.up.railway.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Solo REST API tiene prefijo, NO el WebSocket
  app.setGlobalPrefix('api');

  const port = configService.get('PORT') || 3000;
  await app.listen(port, '0.0.0.0'); // ⚠️ Escuchar en todas las interfaces
  
  console.log(`🚀 Backend corriendo en puerto ${port}`);
  console.log(`📡 WebSocket disponible en /streaming`);
}
bootstrap();