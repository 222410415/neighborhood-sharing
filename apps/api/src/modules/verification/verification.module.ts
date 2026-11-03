import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ExchangeModule } from "../exchange/exchange.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { VerificationService } from "./verification.service.js";
import { VerificationController } from "./verification.controller.js";

@Module({
  imports: [FirebaseModule, ExchangeModule],
  controllers: [VerificationController],
  providers: [VerificationService, AuthGuard],
  exports: [VerificationService],
})
export class VerificationModule {}
