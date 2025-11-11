import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);

  // Configurar el adaptador de WebSocket (Socket.io)
  app.useWebSocketAdapter(new IoAdapter(app));
  
  // Habilitar CORS para el frontend
  app.enableCors({
    origin: [
  configService.get('FRONTEND_URL'),
  'http://localhost:3000',
  'http://localhost:3001',
  'https://livetechbackend-ventas.up.railway.app'
].filter(Boolean),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api');

  const port = configService.get('PORT') || 3000;
  await app.listen(port);
  
  console.log(`🚀 LiveTech Backend running on: http://localhost:${port}/api`);
}
bootstrap();