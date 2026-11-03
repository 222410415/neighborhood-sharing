import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ExchangeModule } from "../exchange/exchange.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { OptionalAuthGuard } from "../../common/guards/optional-auth.guard.js";
import { ListingRepository } from "./listing.repository.js";
import { ListingService } from "./listing.service.js";
import { ListingController } from "./listing.controller.js";
import { PublicListingRepository } from "./public-listing.repository.js";
import { PublicListingService } from "./public-listing.service.js";
import { PublicListingController } from "./public-listing.controller.js";
import { MediaRepository } from "../media/media.repository.js";

@Module({
  imports: [FirebaseModule, ExchangeModule],
  controllers: [ListingController, PublicListingController],
  providers: [
    ListingRepository,
    ListingService,
    PublicListingRepository,
    PublicListingService,
    MediaRepository,
    AuthGuard,
    OptionalAuthGuard,
  ],
  exports: [ListingService, ListingRepository, PublicListingRepository],
})
export class ListingModule {}
