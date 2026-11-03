import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ListingModule } from "../listings/listing.module.js";
import { OptionalAuthGuard } from "../../common/guards/optional-auth.guard.js";
import { AiClient } from "./ai.client.js";
import { SuggestionService } from "./suggestion.service.js";
import { AiController } from "./ai.controller.js";

@Module({
  imports: [FirebaseModule, ListingModule],
  controllers: [AiController],
  providers: [AiClient, SuggestionService, OptionalAuthGuard],
  exports: [AiClient],
})
export class AiModule {}
