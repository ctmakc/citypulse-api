import { Module } from '@nestjs/common';
import { CapitalService } from './capital.service';
import { CapitalController } from './capital.controller';

@Module({
  controllers: [CapitalController],
  providers: [CapitalService],
  exports: [CapitalService],
})
export class CapitalModule {}
