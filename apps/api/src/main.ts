import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { JWT_DEFAULT_SECRET } from './auth/jwt.strategy';
import { uploadsDir } from './documents/upload.config';

/** Fail fast on insecure production configuration. */
const assertProductionConfig = (): void => {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === JWT_DEFAULT_SECRET) {
    throw new Error('JWT_SECRET must be set to a strong value in production.');
  }
};

const bootstrap = async (): Promise<void> => {
  assertProductionConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001').split(','),
    credentials: true,
  });

  // Uploaded documents are served from /uploads (outside the /api prefix).
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  const port = Number(process.env.PORT ?? 4000);
  // Bind all interfaces so the API is reachable inside a container network.
  await app.listen(port, '0.0.0.0');
  Logger.log(`LoanPilot API listening on http://localhost:${port}/api`, 'Bootstrap');
};

void bootstrap();
