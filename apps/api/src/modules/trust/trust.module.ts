import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ExchangeModule } from "../exchange/exchange.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { ReportService } from "./report.service.js";
import { DisputeService } from "./dispute.service.js";
import { TrustController } from "./trust.controller.js";

@Module({
  imports: [FirebaseModule, ExchangeModule],
  controllers: [TrustController],
  providers: [ReportService, DisputeService, AuthGuard],
  exports: [ReportService, DisputeService],
})
export class TrustModule {}
