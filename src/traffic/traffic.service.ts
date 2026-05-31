import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface Hotspot {
  name: string;
  congestionIndex: number;
  delay: string;
  district: string;
}

export interface IntersectionRow {
  name: string;
  los: string; // Level of Service: A–F
  delay: number; // avg delay seconds
  volume: number;
}

// 24 hourly delay-index values (0 = midnight, smooth AM/PM peaks)
const HOURLY_DELAY = [
  8, 6, 5, 5, 6, 12, 28, 58, 72, 64, 52, 48,
  55, 62, 58, 52, 64, 78, 72, 56, 42, 30, 20, 12,
];

// 7 days × 12 two-hour time-slots congestion matrix
const HEATGRID_MATRIX = [
  // 00 02 04 06 08 10 12 14 16 18 20 22
  [5,  4,  4,  6,  22, 38, 45, 42, 52, 48, 28, 15], // Mon
  [5,  4,  4,  7,  24, 40, 46, 44, 58, 52, 30, 14], // Tue
  [5,  4,  4,  7,  26, 42, 48, 45, 60, 54, 32, 14], // Wed
  [5,  4,  4,  6,  25, 41, 47, 44, 58, 55, 34, 16], // Thu
  [5,  4,  4,  6,  24, 38, 44, 42, 54, 62, 50, 28], // Fri
  [6,  5,  5,  5,  10, 22, 38, 42, 40, 35, 28, 18], // Sat
  [5,  4,  4,  4,   8, 16, 28, 32, 30, 25, 18, 10], // Sun
];

const HEATGRID_COL_LABELS = ['12am','2am','4am','6am','8am','10am','12pm','2pm','4pm','6pm','8pm','10pm'];
const HEATGRID_ROW_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const INTERSECTIONS: IntersectionRow[] = [
  { name: 'Bank St & Riverside Dr', los: 'D', delay: 48, volume: 2840 },
  { name: 'Woodroffe Ave & Baseline Rd', los: 'C', delay: 32, volume: 2210 },
  { name: 'Merivale Rd & Clyde Ave', los: 'E', delay: 64, volume: 3120 },
  { name: 'Hunt Club Rd & Strandherd Dr', los: 'F', delay: 88, volume: 3450 },
  { name: 'Trim Rd & Innes Rd', los: 'C', delay: 28, volume: 1880 },
  { name: 'March Rd & Terry Fox Dr', los: 'B', delay: 18, volume: 1540 },
  { name: 'Carling Ave & Kirkwood Ave', los: 'D', delay: 42, volume: 2650 },
  { name: 'King Edward Ave & Rideau St', los: 'E', delay: 70, volume: 2970 },
];

const HOTSPOTS: Hotspot[] = [
  { name: 'Hunt Club / Strandherd', congestionIndex: 88, delay: '+32%', district: 'Barrhaven' },
  { name: 'Merivale / Clyde', congestionIndex: 76, delay: '+28%', district: 'Nepean' },
  { name: 'King Edward / Rideau', congestionIndex: 72, delay: '+24%', district: 'Downtown' },
  { name: 'Bank / Riverside', congestionIndex: 64, delay: '+18%', district: 'Glebe' },
];

@Injectable()
export class TrafficService {
  constructor(private prisma: PrismaService) {}

  getCurrent(_tenantId: string) {
    const hour = new Date().getHours();
    const congestionIndex = HOURLY_DELAY[hour] ?? 40;
    const delayPct = Math.round(((congestionIndex - 30) / 30) * 100);
    const sign = delayPct >= 0 ? '+' : '';

    return {
      congestionIndex,
      avgDelay: `${sign}${delayPct}%`,
      congestionCost: '$182K',
      hotspots: HOTSPOTS,
      transitOnTimeRate: 78.4,
      activeSignalOverrides: 3,
      incidentsAffectingFlow: 2,
    };
  }

  getHourlyPattern(_tenantId: string): { hours: number[]; pattern: number[] } {
    return {
      hours: Array.from({ length: 24 }, (_, i) => i),
      pattern: HOURLY_DELAY,
    };
  }

  getIntersections(_tenantId: string): IntersectionRow[] {
    return INTERSECTIONS;
  }

  getHeatGrid(_tenantId: string) {
    return {
      matrix: HEATGRID_MATRIX,
      rowLabels: HEATGRID_ROW_LABELS,
      colLabels: HEATGRID_COL_LABELS,
    };
  }

  findAll(tenantId: string) {
    return (this.prisma.trafficReading as any)?.findMany({ where: { tenantId } }) ?? [];
  }
}
