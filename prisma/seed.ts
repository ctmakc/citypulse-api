import {
  PrismaClient,
  UserRole,
  AssetType,
  RiskLevel,
  Severity,
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

  console.log('Seed complete — Meridian tenant, 8 assets, 5 alerts, 5 reports, 6 projects, 8 work orders');
  console.log(`Admin login: admin@meridian.city / citypulse2026`);
  void admin;
}

main().catch(console.error).finally(() => prisma.$disconnect());
