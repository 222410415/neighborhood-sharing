import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ExchangeModule } from "../exchange/exchange.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { ConversationService } from "./conversation.service.js";
import { ConversationController } from "./conversation.controller.js";

@Module({
  imports: [FirebaseModule, ExchangeModule],
  controllers: [ConversationController],
  providers: [ConversationService, AuthGuard],
})
export class MessagingModule {}
