import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { AiModule } from "../ai/ai.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { PolicyService } from "./policy.service.js";
import { AssistantService } from "./assistant.service.js";
import { PolicyController } from "./policy.controller.js";

@Module({
  imports: [FirebaseModule, AiModule],
  controllers: [PolicyController],
  providers: [PolicyService, AssistantService, AuthGuard],
  exports: [PolicyService],
})
export class PoliciesModule {}
