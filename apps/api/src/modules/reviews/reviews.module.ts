import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ExchangeModule } from "../exchange/exchange.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { ReviewService } from "./review.service.js";
import { MemberProfileService } from "./member-profile.service.js";
import { ReviewController } from "./review.controller.js";

@Module({
  imports: [FirebaseModule, ExchangeModule],
  controllers: [ReviewController],
  providers: [ReviewService, MemberProfileService, AuthGuard],
  exports: [ReviewService, MemberProfileService],
})
export class ReviewsModule {}
