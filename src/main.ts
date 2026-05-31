import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Security headers. crossOriginEmbedderPolicy stays OFF so the Swagger UI and
  // cross-origin Leaflet map tiles continue to load (COEP would block them).
  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  // gzip/deflate response compression.
  app.use(compression());

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3095',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('CityPulse API')
    .setDescription('AI-Powered Territorial Intelligence Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3096);
  const env = process.env.NODE_ENV ?? 'development';
  await app.listen(port);

  // Structured startup logging — one clean block on boot.
  const url = `http://localhost:${port}`;
  logger.log(`Environment   : ${env}`);
  logger.log(`Listening on  : port ${port}`);
  logger.log(`API base      : ${url}/api/v1`);
  logger.log(`Swagger docs  : ${url}/api/docs`);
  logger.log(`Health check  : ${url}/api/v1/health`);
  logger.log(`CityPulse API ready → ${url}`);
}
bootstrap();
