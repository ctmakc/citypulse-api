import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EnvironmentalReading {
  id: string;
  tenantId: string;
  metric: string;
  value: number;
  unit?: string;
  locationLat?: number;
  locationLng?: number;
  district?: string;
  recordedAt: Date;
}

// 24-hour AQI seed values (hour 0 = midnight)
const SEED_AQI_VALUES = [72, 74, 76, 78, 80, 82, 84, 89, 96, 104, 98, 88, 79, 72, 70, 68, 72, 75, 80, 84, 82, 78, 76, 74];

const AQI_SENSORS = [
  { district: 'Downtown', lat: 45.4215, lng: -75.6972 },
  { district: 'Westboro', lat: 45.4053, lng: -75.7416 },
  { district: 'Kanata', lat: 45.3480, lng: -75.9224 },
  { district: 'Barrhaven', lat: 45.2636, lng: -75.7374 },
  { district: 'Vanier', lat: 45.4355, lng: -75.6601 },
  { district: 'Orleans', lat: 45.4588, lng: -75.5165 },
];

function aqiLabel(value: number): string {
  if (value <= 50) return 'Good';
  if (value <= 100) return 'Moderate';
  if (value <= 150) return 'Unhealthy for Sensitive Groups';
  if (value <= 200) return 'Unhealthy';
  return 'Very Unhealthy';
}

@Injectable()
export class EnvironmentService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EnvironmentService.name);
  private seeded = false;

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.bootstrapSeed();
  }

  private async bootstrapSeed() {
    try {
      const meridian = await (this.prisma.tenant as any).findFirst({
        where: { name: { contains: 'Meridian' } },
      });
      if (!meridian) {
        this.logger.warn('Meridian tenant not found — skipping environment seed');
        return;
      }
      const existing = await (this.prisma.environmentalReading as any).count({
        where: { tenantId: meridian.id, metric: 'AQI' },
      });
      if (existing >= 24) {
        this.logger.log('Environment seed already present — skipping');
        this.seeded = true;
        return;
      }
      await this.seedReadings(meridian.id);
    } catch (err) {
      this.logger.error('Environment bootstrap seed failed', err);
    }
  }

  async seedReadings(tenantId: string): Promise<{ created: number }> {
    const now = new Date();
    const records = SEED_AQI_VALUES.map((value, i) => {
      const recordedAt = new Date(now);
      recordedAt.setHours(now.getHours() - (23 - i), 0, 0, 0);
      const sensor = AQI_SENSORS[i % AQI_SENSORS.length];
      return {
        tenantId,
        metric: 'AQI',
        value,
        unit: 'AQI',
        locationLat: sensor.lat,
        locationLng: sensor.lng,
        district: sensor.district,
        recordedAt,
      };
    });

    await (this.prisma.environmentalReading as any).createMany({ data: records });
    this.seeded = true;
    this.logger.log(`Seeded ${records.length} AQI readings for tenant ${tenantId}`);
    return { created: records.length };
  }

  async getCurrentAQI(tenantId: string) {
    const readings: EnvironmentalReading[] = await (this.prisma.environmentalReading as any).findMany({
      where: { tenantId, metric: 'AQI' },
      orderBy: { recordedAt: 'desc' },
      take: AQI_SENSORS.length,
    });

    if (readings.length === 0) {
      // fallback static
      return {
        cityAQI: 84,
        label: 'Moderate',
        sensors: [],
        schoolZonePeak: 104,
      };
    }

    const latest = readings[0];
    const cityAQI = Math.round(readings.reduce((s, r) => s + r.value, 0) / readings.length);
    const schoolZonePeak = Math.max(...readings.map((r) => r.value));

    return {
      cityAQI,
      label: aqiLabel(cityAQI),
      sensors: readings,
      schoolZonePeak,
    };
  }

  async getAirHistory(tenantId: string, hours = 12): Promise<EnvironmentalReading[]> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const readings: EnvironmentalReading[] = await (this.prisma.environmentalReading as any).findMany({
      where: {
        tenantId,
        metric: 'AQI',
        recordedAt: { gte: since },
      },
      orderBy: { recordedAt: 'asc' },
    });

    if (readings.length > 0) return readings;

    // Fallback: return last N seed values as synthetic readings
    const sliced = SEED_AQI_VALUES.slice(-hours);
    return sliced.map((value, i) => {
      const recordedAt = new Date();
      recordedAt.setHours(recordedAt.getHours() - (sliced.length - 1 - i), 0, 0, 0);
      return {
        id: `synthetic-${i}`,
        tenantId,
        metric: 'AQI',
        value,
        unit: 'AQI',
        recordedAt,
      } as EnvironmentalReading;
    });
  }

  getWaterQuality(_tenantId: string) {
    return {
      exceedances: 0,
      pumpUptime: 99.1,
      nonRevenueWater: 12.4,
      chlorineResidual: 0.72,
      turbidity: 0.18,
      ph: 7.4,
      stations: [
        { name: 'Lemieux Island WTP', uptime: 99.6, status: 'Normal' },
        { name: 'Britannia WTP', uptime: 98.7, status: 'Normal' },
        { name: 'Vars WTP', uptime: 99.0, status: 'Normal' },
      ],
    };
  }

  getWildfireRisk(_tenantId: string) {
    return {
      level: 'High',
      fuelMoisture: 9,
      windSpeed: 32,
      homesInBand: 430,
      fireWeatherIndex: 28,
      dangerRating: 'High',
      nearestActivePerimeter: '42 km NE',
      lastUpdated: new Date().toISOString(),
    };
  }

  getFloodRisk(_tenantId: string) {
    return {
      level: 'Moderate',
      forecastRainMm: 38,
      atCapacityDrains: 1,
      riverLevel: 3.2,
      riverLevelThreshold: 4.5,
      surgeCapacityPct: 78,
      floodZoneHomes: 210,
      lastUpdated: new Date().toISOString(),
    };
  }
}
