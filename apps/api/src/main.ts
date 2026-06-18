import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { uploadsDir } from './documents/upload.config';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001').split(','),
    credentials: true,
  });

  // Uploaded documents are served from /uploads (outside the /api prefix).
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`LoanPilot API listening on http://localhost:${port}/api`, 'Bootstrap');
};

void bootstrap();
