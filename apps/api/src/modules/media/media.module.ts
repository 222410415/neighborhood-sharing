import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { MediaRepository } from "./media.repository.js";
import { ListingRepository } from "../listings/listing.repository.js";
import { MediaService } from "./media.service.js";
import { MediaController } from "./media.controller.js";

@Module({
  imports: [FirebaseModule],
  controllers: [MediaController],
  providers: [MediaRepository, ListingRepository, MediaService, AuthGuard],
  exports: [MediaService, MediaRepository, ListingRepository],
})
export class MediaModule {}
