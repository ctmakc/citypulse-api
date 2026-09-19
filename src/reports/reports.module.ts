import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_REPORT_GENERATION } from '../queue/queue.constants.js';
import { ReportsService } from './reports.service.js';
import { ReportDataService } from './reports.data.js';
import { ReportsController } from './reports.controller.js';

/**
 * Reports module — generates real downloadable artifacts (PDF via pdfkit, XLSX
 * via exceljs) from live tenant data (PrismaService is global) and serves them
 * from the artifacts directory.
 *
 * Registers the existing 'report-generation' queue so the controller can
 * enqueue jobs directly (same queue name/Redis as the rest of the app).
 *
 * Marked @Global so ReportsService is injectable into the report-generation
 * processor (declared in QueueModule) WITHOUT QueueModule having to import this
 * module — that keeps the dependency one-directional and avoids a cycle.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_REPORT_GENERATION })],
  controllers: [ReportsController],
  providers: [ReportsService, ReportDataService],
  exports: [ReportsService],
})
export class ReportsModule {}
