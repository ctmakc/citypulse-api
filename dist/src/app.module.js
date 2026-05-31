"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const tenants_module_1 = require("./tenants/tenants.module");
const users_module_1 = require("./users/users.module");
const assets_module_1 = require("./assets/assets.module");
const alerts_module_1 = require("./alerts/alerts.module");
const reports311_module_1 = require("./reports311/reports311.module");
const capital_module_1 = require("./capital/capital.module");
const work_orders_module_1 = require("./work-orders/work-orders.module");
const agents_module_1 = require("./agents/agents.module");
const environment_module_1 = require("./environment/environment.module");
const traffic_module_1 = require("./traffic/traffic.module");
const dashboard_module_1 = require("./dashboard/dashboard.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            tenants_module_1.TenantsModule,
            users_module_1.UsersModule,
            assets_module_1.AssetsModule,
            alerts_module_1.AlertsModule,
            reports311_module_1.Reports311Module,
            capital_module_1.CapitalModule,
            work_orders_module_1.WorkOrdersModule,
            agents_module_1.AgentsModule,
            environment_module_1.EnvironmentModule,
            traffic_module_1.TrafficModule,
            dashboard_module_1.DashboardModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map