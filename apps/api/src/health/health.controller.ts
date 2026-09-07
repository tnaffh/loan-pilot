import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface HealthResponse {
  status: string;
  database: string;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const database = await this.prisma
      .$queryRaw`SELECT 1`.then(() => 'up')
      .catch(() => 'down');

    const body: HealthResponse = {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };

    // Returning 200 while the database is down made the container healthcheck — and any
    // uptime monitor watching the status code — blind to the one failure that matters.
    // The body is unchanged, so callers that inspect it keep working.
    if (database !== 'up') {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }
}
