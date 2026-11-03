import { Global, Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesService } from "./roles.service.js";
import { RolesGuard } from "./roles.guard.js";
import { AuditService } from "./audit.service.js";
import { RolesController } from "./roles.controller.js";

/** Roles, the roles guard and the audit trail, available to every module. */
@Global()
@Module({
  imports: [FirebaseModule],
  controllers: [RolesController],
  providers: [RolesService, RolesGuard, AuditService, AuthGuard],
  exports: [RolesService, RolesGuard, AuditService],
})
export class RolesModule {}
