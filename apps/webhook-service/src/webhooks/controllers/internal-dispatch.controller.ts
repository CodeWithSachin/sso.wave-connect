import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DispatchService, DispatchRequest } from '../services/dispatch.service';

@ApiTags('Internal')
@Controller('internal')
export class InternalDispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatch(
    @Body() body: DispatchRequest,
  ) {
    const count = await this.dispatchService.dispatch(body);
    return { dispatched_to: count };
  }
}
