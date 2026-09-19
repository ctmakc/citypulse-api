import {
  PrismaClient,
  UserRole,
  AssetType,
  RiskLevel,
  Severity,
  IncidentStatus,
  ReportStatus,
  Priority,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

// Load .env for the seed runner
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Create Meridian tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'meridian-tenant-id' },
    update: {},
    create: {
      id: 'meridian-tenant-id',
      name: 'City of Meridian',
      type: 'CITY',
      country: 'CA',
      timezone: 'America/Vancouver',
      riskScore: 62,
      riskLabel: 'Elevated',
      population: 341200,
    },
  });

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@meridian.city' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@meridian.city',
      name: 'Jordan Rivera',
      role: UserRole.CITY_MANAGER,
      department: 'City Manager Office',
      passwordHash: await bcrypt.hash('citypulse2026', 10),
    },
  });

  // Create all 8 assets from the design
  const assets = [
    { externalId: 'WTR-2207', type: 'WATER_MAIN', name: 'Trunk main MX-118', district: 'Riverside', department: 'Water Authority', condition: 41, failureProb: 0.82, riskLevel: 'CRITICAL' },
    { externalId: 'BRG-0072', type: 'BRIDGE', name: 'Cedar St bridge', district: 'Cedar Crossing', department: 'Public Works', condition: 58, failureProb: 0.34, riskLevel: 'ELEVATED' },
    { externalId: 'RD-1190', type: 'ROAD_SEGMENT', name: 'Vine St (4th–9th)', district: 'Old Town', department: 'Public Works', condition: 62, failureProb: 0.21, riskLevel: 'WATCH' },
    { externalId: 'SIG-3390', type: 'TRAFFIC_SIGNAL', name: 'Vine & Harbor controller', district: 'Old Town', department: 'Transportation', condition: 70, failureProb: 0.12, riskLevel: 'WATCH' },
    { externalId: 'PMP-014', type: 'PUMP_STATION', name: 'Westbank storm pump', district: 'Westbank', department: 'Public Works', condition: 66, failureProb: 0.18, riskLevel: 'WATCH' },
    { externalId: 'HYD-882', type: 'HYDRANT', name: 'Hydrant cluster 88', district: 'Northgate', department: 'Fire & Rescue', condition: 88, failureProb: 0.04, riskLevel: 'OK' },
    { externalId: 'LGT-455', type: 'STREETLIGHT', name: 'Birch Ave run', district: 'Northgate', department: 'Utilities', condition: 74, failureProb: 0.09, riskLevel: 'OK' },
    { externalId: 'BLD-007', type: 'PUBLIC_BUILDING', name: 'Harbor community center', district: 'Harbor', department: 'Facilities', condition: 79, failureProb: 0.07, riskLevel: 'OK' },
  ];

  for (const a of assets) {
    await prisma.asset.upsert({
      where: { id: a.externalId + '-' + tenant.id },
      update: {},
      create: {
        id: a.externalId + '-' + tenant.id,
        tenantId: tenant.id,
        externalId: a.externalId,
        type: a.type as AssetType,
        name: a.name,
        district: a.district,
        department: a.department,
        condition: a.condition,
        failureProb: a.failureProb,
        riskLevel: a.riskLevel as RiskLevel,
      },
    });
  }

  // Create alerts
  const alerts = [
    { externalId: 'WTR-2207', severity: 'CRITICAL', category: 'Water', title: 'Trunk main MX-118 — failure predicted ≤ 90 days', location: 'Riverside / 4th St', department: 'Water Authority' },
    { externalId: 'FIRE-0461', severity: 'CRITICAL', category: 'Wildfire', title: 'Ignition-risk zone expanding toward Northgate homes', location: 'NE Ridge', department: 'Fire & Rescue' },
    { externalId: 'TRF-3390', severity: 'HIGH', category: 'Traffic', title: 'Vine & Harbor intersection — delay + emissions spike', location: 'Old Town', department: 'Transportation' },
    { externalId: '311-5521', severity: 'HIGH', category: 'Drainage', title: 'Cluster of 9 reports indicates storm-drain failure', location: 'Westbank', department: 'Public Works' },
    { externalId: 'BRG-0072', severity: 'MEDIUM', category: 'Bridge', title: 'Cedar St bridge — condition trending down, grant-eligible', location: 'Cedar Crossing', department: 'Public Works' },
  ];

  for (const al of alerts) {
    await prisma.alert.upsert({
      where: { id: al.externalId + '-alert-' + tenant.id },
      update: {},
      create: {
        id: al.externalId + '-alert-' + tenant.id,
        tenantId: tenant.id,
        externalId: al.externalId,
        severity: al.severity as Severity,
        category: al.category,
        title: al.title,
        location: al.location,
        department: al.department,
      },
    });
  }

  // Create 311 reports (delete existing to avoid duplicate trackingCode issues on re-seed)
  await prisma.report311.deleteMany({ where: { tenantId: tenant.id } });

  const reports = [
    { category: 'Flooding', severity: 'HIGH', location: 'Westbank · Marsh & 9th', department: 'Public Works', status: 'ROUTING', duplicateCount: 9 },
    { category: 'Pothole', severity: 'MEDIUM', location: 'Old Town · Vine St', department: 'Public Works', status: 'ASSIGNED' },
    { category: 'Streetlight out', severity: 'LOW', location: 'Northgate · Birch Ave', department: 'Utilities', status: 'ASSIGNED', duplicateCount: 2 },
    { category: 'Water leak', severity: 'HIGH', location: 'Riverside · 4th St', department: 'Water Authority', status: 'IN_PROGRESS', duplicateCount: 4 },
    { category: 'Illegal dumping', severity: 'MEDIUM', location: 'Harbor · Dock Rd', department: 'Sanitation', status: 'NEW' },
  ];

  for (const r of reports) {
    await prisma.report311.create({
      data: {
        tenantId: tenant.id,
        category: r.category,
        severity: r.severity as Severity,
        location: r.location,
        department: r.department,
        status: r.status as ReportStatus,
        duplicateCount: r.duplicateCount ?? 0,
      },
    });
  }

  // Create capital projects (delete existing on re-seed)
  await prisma.capitalProject.deleteMany({ where: { tenantId: tenant.id } });

  const projects = [
    { title: 'Riverside trunk main replacement', cost: 2400000, urgency: 'Immediate', grantProgram: 'State Water Resilience Fund', grantEligibility: 'Eligible', grantMatch: '80%', probability: 0.74 },
    { title: 'NE Ridge wildfire buffer + sensor network', cost: 3100000, urgency: 'High', grantProgram: 'FEMA BRIC', grantEligibility: 'Eligible', grantMatch: '75%', probability: 0.61 },
    { title: 'Cedar St bridge rehabilitation', cost: 4800000, urgency: 'High', grantProgram: 'State Bridge Rehab', grantEligibility: 'Newly eligible', grantMatch: '80%', probability: 0.68 },
    { title: 'Lead service-line replacement — Westbank', cost: 5600000, urgency: 'High', grantProgram: 'EPA WIIN / DWSRF', grantEligibility: 'Eligible', grantMatch: '90%', probability: 0.71 },
    { title: 'Smart signal modernization — Old Town', cost: 1900000, urgency: 'Medium', grantProgram: 'CMAQ', grantEligibility: 'Eligible', grantMatch: '70%', probability: 0.66 },
    { title: 'School-zone air monitoring + screening', cost: 700000, urgency: 'Medium', grantProgram: 'EPA Community Air', grantEligibility: 'Eligible', grantMatch: '100%', probability: 0.69 },
  ];

  for (const p of projects) {
    await prisma.capitalProject.create({
      data: { tenantId: tenant.id, ...p },
    });
  }

  // Work orders (delete existing on re-seed)
  await prisma.workOrder.deleteMany({ where: { tenantId: tenant.id } });

  const workOrders = [
    { title: 'Emergency inspection — MX-118 water main', department: 'Water Authority', priority: 'CRITICAL', status: 'IN_PROGRESS', assignee: 'G. Navarro', source: 'AI · WTR-2207' },
    { title: 'NE Ridge crew pre-positioning', department: 'Fire & Rescue', priority: 'CRITICAL', status: 'SCHEDULED', assignee: 'R. Park', source: 'AI · FIRE-0461' },
    { title: 'Westbank drainage survey', department: 'Public Works', priority: 'HIGH', status: 'SCHEDULED', assignee: 'M. Okafor', source: 'AI · 311-5521' },
    { title: 'Vine & Harbor signal retiming', department: 'Transportation', priority: 'HIGH', status: 'ASSIGNED', assignee: 'L. Chen', source: 'AI · TRF-3390' },
    { title: 'Cedar St bridge Tier-2 inspection', department: 'Public Works', priority: 'HIGH', status: 'SCHEDULED', assignee: 'D. Walsh', source: 'AI · BRG-0072' },
    { title: 'CP-118 grant application submission', department: 'Grants Office', priority: 'HIGH', status: 'IN_PROGRESS', assignee: 'S. Marsh', source: 'CP-118' },
    { title: 'School district AQI notification', department: 'Environment', priority: 'MEDIUM', status: 'NEW', assignee: 'T. Reyes', source: 'AI · Air' },
    { title: 'Northgate streetlight repair — Birch Ave', department: 'Utilities', priority: 'LOW', status: 'ASSIGNED', assignee: 'P. Kumar', source: '311-5517' },
  ];

  for (const wo of workOrders) {
    await prisma.workOrder.create({
      data: {
        tenantId: tenant.id,
        title: wo.title,
        department: wo.department,
        priority: wo.priority as Priority,
        status: wo.status as WorkOrderStatus,
        assignee: wo.assignee,
        source: wo.source,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Rich history for the 3 highest-risk assets (detail-page nested data)
  // ---------------------------------------------------------------------
  const assetId = (externalId: string) => `${externalId}-${tenant.id}`;
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  // Inspections: 2-3 per high-risk asset, dated over the past year, condition trending down.
  const inspections = [
    // WTR-2207 — Trunk main MX-118 (CRITICAL)
    { key: 'WTR-2207-insp-1', externalId: 'WTR-2207', inspector: 'G. Navarro', condition: 58, inspectedAt: daysAgo(330), notes: 'Acoustic survey: minor circumferential corrosion at joints 4–6. Within tolerance.' },
    { key: 'WTR-2207-insp-2', externalId: 'WTR-2207', inspector: 'G. Navarro', condition: 47, inspectedAt: daysAgo(180), notes: 'Pressure transients increasing; two pinhole leaks repaired. Recommend leak-detection loggers.' },
    { key: 'WTR-2207-insp-3', externalId: 'WTR-2207', inspector: 'S. Okonkwo', condition: 41, inspectedAt: daysAgo(35), notes: 'Wall-thickness below threshold over 120 m. Failure predicted ≤ 90 days. Escalate to capital replacement.' },
    // BRG-0072 — Cedar St bridge (ELEVATED)
    { key: 'BRG-0072-insp-1', externalId: 'BRG-0072', inspector: 'D. Walsh', condition: 71, inspectedAt: daysAgo(300), notes: 'Routine NBI inspection. Deck spalling on north approach; expansion joints serviceable.' },
    { key: 'BRG-0072-insp-2', externalId: 'BRG-0072', inspector: 'D. Walsh', condition: 58, inspectedAt: daysAgo(75), notes: 'Tier-2 inspection: section loss on girder G3, chloride ingress. Load rating reduced. Grant-eligible.' },
    // PMP-014 — Westbank storm pump (WATCH)
    { key: 'PMP-014-insp-1', externalId: 'PMP-014', inspector: 'M. Okafor', condition: 74, inspectedAt: daysAgo(250), notes: 'Annual service. Pump 2 seal weeping; bearings within spec.' },
    { key: 'PMP-014-insp-2', externalId: 'PMP-014', inspector: 'M. Okafor', condition: 66, inspectedAt: daysAgo(60), notes: 'Reduced throughput during high-flow test. Impeller wear on Pump 2; schedule rebuild before wet season.' },
  ];

  for (const ins of inspections) {
    await prisma.inspection.upsert({
      where: { id: ins.key },
      update: {},
      create: {
        id: ins.key,
        assetId: assetId(ins.externalId),
        tenantId: tenant.id,
        inspector: ins.inspector,
        condition: ins.condition,
        notes: ins.notes,
        inspectedAt: ins.inspectedAt,
      },
    });
  }

  // Incidents: 1-2 per high-risk asset.
  const incidents = [
    { key: 'WTR-2207-inc-1', externalId: 'WTR-2207', title: 'Pressure-loss event, Riverside zone', severity: 'HIGH', status: 'RESOLVED', reportedAt: daysAgo(210), resolvedAt: daysAgo(209), description: 'Sudden 14 psi drop; isolated to MX-118. Two pinhole leaks clamped.' },
    { key: 'WTR-2207-inc-2', externalId: 'WTR-2207', title: 'Discoloured water complaints (cluster of 4)', severity: 'MEDIUM', status: 'IN_PROGRESS', reportedAt: daysAgo(28), description: 'Sediment disturbance consistent with internal corrosion. Flushing scheduled.' },
    { key: 'BRG-0072-inc-1', externalId: 'BRG-0072', title: 'Concrete spall fell to roadway below', severity: 'HIGH', status: 'OPEN', reportedAt: daysAgo(40), description: 'Fragment from north approach soffit. Netting installed pending rehab.' },
    { key: 'PMP-014-inc-1', externalId: 'PMP-014', title: 'Pump 2 high-temperature trip', severity: 'MEDIUM', status: 'RESOLVED', reportedAt: daysAgo(55), resolvedAt: daysAgo(54), description: 'Thermal overload during storm event; restarted after cooldown, flagged for rebuild.' },
  ];

  for (const inc of incidents) {
    await prisma.incident.upsert({
      where: { id: inc.key },
      update: {},
      create: {
        id: inc.key,
        assetId: assetId(inc.externalId),
        tenantId: tenant.id,
        title: inc.title,
        description: inc.description,
        severity: inc.severity as Severity,
        status: inc.status as IncidentStatus,
        reportedAt: inc.reportedAt,
        resolvedAt: inc.resolvedAt,
      },
    });
  }

  // Link AI-generated work orders to their assets so the detail page shows real work orders.
  const workOrderAssetLinks: Record<string, string> = {
    'AI · WTR-2207': 'WTR-2207',
    'AI · BRG-0072': 'BRG-0072',
  };
  for (const [source, externalId] of Object.entries(workOrderAssetLinks)) {
    await prisma.workOrder.updateMany({
      where: { tenantId: tenant.id, source, assetId: null },
      data: { assetId: assetId(externalId) },
    });
  }
  // Add a dedicated work order for PMP-014 (its AI alert source isn't asset-tagged in the WO list).
  await prisma.workOrder.upsert({
    where: { id: 'PMP-014-wo-1' },
    update: {},
    create: {
      id: 'PMP-014-wo-1',
      tenantId: tenant.id,
      assetId: assetId('PMP-014'),
      title: 'Westbank pump 2 impeller rebuild',
      department: 'Public Works',
      priority: Priority.HIGH,
      status: WorkOrderStatus.SCHEDULED,
      assignee: 'M. Okafor',
      source: 'INSP · PMP-014',
    },
  });

  // ---------------------------------------------------------------------
  // Large synthetic asset set for spatial / pagination perf testing.
  // Guarded: only inserts when the asset count is small, so re-runs are
  // stable and we never balloon the table. The spread is fully
  // DETERMINISTIC (index-derived trig jitter), so geometry is reproducible.
  // ---------------------------------------------------------------------
  const SYNTHETIC_TARGET = 50000;
  const existingAssetCount = await prisma.asset.count();
  if (existingAssetCount < 20000) {
    // Bounding box around the city center.
    const LAT_MIN = 47.558;
    const LAT_MAX = 47.642;
    const LNG_MIN = -122.405;
    const LNG_MAX = -122.255;
    const LAT_SPAN = LAT_MAX - LAT_MIN; // 0.084
    const LNG_SPAN = LNG_MAX - LNG_MIN; // 0.150

    const TYPES = Object.values(AssetType);
    const RISKS = Object.values(RiskLevel);
    const DISTRICTS = ['Riverside', 'Cedar Crossing', 'Old Town', 'Westbank', 'Northgate', 'Harbor', 'Eastpoint', 'Southshore'];
    const DEPARTMENTS = ['Public Works', 'Water Authority', 'Transportation', 'Utilities', 'Fire & Rescue', 'Facilities', 'Sanitation', 'Environment'];

    // Deterministic 0..1 hash from an integer (mulberry32-style, no state).
    const det = (n: number): number => {
      let t = (n + 0x6d2b79f5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const rows: {
      id: string;
      tenantId: string;
      externalId: string;
      type: AssetType;
      name: string;
      district: string;
      department: string;
      locationLat: number;
      locationLng: number;
      condition: number;
      failureProb: number;
      riskLevel: RiskLevel;
    }[] = [];

    for (let i = 0; i < SYNTHETIC_TARGET; i++) {
      // Deterministic spread: trig over the index gives a smooth, reproducible
      // scatter; the det() hash decorrelates lat from lng so it isn't a line.
      const u = (Math.sin(i * 12.9898) * 43758.5453123) % 1;
      const v = det(i);
      const latFrac = (Math.abs(u) + det(i * 7 + 1)) / 2; // 0..1
      const lngFrac = (v + Math.abs((Math.cos(i * 78.233) * 43758.5453) % 1)) / 2; // 0..1
      const lat = LAT_MIN + latFrac * LAT_SPAN;
      const lng = LNG_MIN + lngFrac * LNG_SPAN;

      const type = TYPES[i % TYPES.length];
      const condition = Math.round(det(i * 3 + 2) * 100); // 0..100
      const failureProb = Math.round(det(i * 5 + 3) * 1000) / 1000; // 0..1, 3dp
      const riskLevel = RISKS[i % RISKS.length];
      const district = DISTRICTS[i % DISTRICTS.length];
      const department = DEPARTMENTS[(i + 3) % DEPARTMENTS.length];
      const externalId = `SYN-${String(i).padStart(6, '0')}`;

      rows.push({
        id: `${externalId}-${tenant.id}`,
        tenantId: tenant.id,
        externalId,
        type,
        name: `Synthetic ${type} ${i}`,
        district,
        department,
        locationLat: Math.round(lat * 1e6) / 1e6,
        locationLng: Math.round(lng * 1e6) / 1e6,
        condition,
        failureProb,
        riskLevel,
      });
    }

    const CHUNK = 5000;
    let inserted = 0;
    for (let off = 0; off < rows.length; off += CHUNK) {
      const batch = rows.slice(off, off + CHUNK);
      const res = await prisma.asset.createMany({ data: batch, skipDuplicates: true });
      inserted += res.count;
    }
    console.log(`Synthetic assets inserted: ${inserted} (target ${SYNTHETIC_TARGET}, prior count ${existingAssetCount})`);
  } else {
    console.log(`Synthetic asset insert SKIPPED — asset count already ${existingAssetCount} (>= 20000).`);
  }

  console.log(
    'Seed complete — Meridian tenant, 8 assets, 5 alerts, 5 reports, 6 projects, 9 work orders, ' +
      `${inspections.length} inspections, ${incidents.length} incidents`,
  );
  console.log(`Admin login: admin@meridian.city / citypulse2026`);
  void admin;
}

main().catch(console.error).finally(() => prisma.$disconnect());
