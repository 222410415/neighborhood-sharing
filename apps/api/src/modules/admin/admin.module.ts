import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { TrustModule } from "../trust/trust.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";
import { VerificationModule } from "../verification/verification.module.js";
import { PoliciesModule } from "../policies/policies.module.js";
import { AdminController } from "./admin.controller.js";

/** Admin workspace routes; services come from the feature modules. */
@Module({
  imports: [FirebaseModule, TrustModule, ReviewsModule, VerificationModule, PoliciesModule],
  controllers: [AdminController],
  providers: [AuthGuard],
})
export class AdminModule {}
