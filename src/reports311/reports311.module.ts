import { Module } from '@nestjs/common';
import { Reports311Service } from './reports311.service';
import { Reports311Controller } from './reports311.controller';

@Module({
  controllers: [Reports311Controller],
  providers: [Reports311Service],
  exports: [Reports311Service],
})
export class Reports311Module {}
