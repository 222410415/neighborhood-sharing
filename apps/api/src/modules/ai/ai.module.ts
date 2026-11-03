import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ListingModule } from "../listings/listing.module.js";
import { OptionalAuthGuard } from "../../common/guards/optional-auth.guard.js";
import { GeminiClient } from "./gemini.client.js";
import { SuggestionService } from "./suggestion.service.js";
import { AiController } from "./ai.controller.js";

@Module({
  imports: [FirebaseModule, ListingModule],
  controllers: [AiController],
  providers: [GeminiClient, SuggestionService, OptionalAuthGuard],
  exports: [GeminiClient],
})
export class AiModule {}
