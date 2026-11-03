import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ExchangeModule } from "../exchange/exchange.module.js";
import { ListingModule } from "../listings/listing.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { FavoriteService } from "./favorite.service.js";
import { RequestService } from "./request.service.js";
import { CommunityController } from "./community.controller.js";

@Module({
  imports: [FirebaseModule, ExchangeModule, ListingModule],
  controllers: [CommunityController],
  providers: [FavoriteService, RequestService, AuthGuard],
  exports: [FavoriteService, RequestService],
})
export class CommunityModule {}
