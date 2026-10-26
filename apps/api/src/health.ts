import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness check; does not report user or infrastructure data' })
  getHealth() { return { status: 'ok', service: 'pulse-api' }; }
}
