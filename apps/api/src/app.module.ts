import {
  Module,
  MiddlewareConsumer,
  NestModule,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { FirebaseModule } from "./modules/firebase/firebase.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { ReferenceDataModule } from "./modules/reference-data/reference-data.module.js";
import { ProfileModule } from "./modules/profiles/profile.module.js";
import { MediaModule } from "./modules/media/media.module.js";
import { ListingModule } from "./modules/listings/listing.module.js";
import { BookingsModule } from "./modules/bookings/bookings.module.js";
import { MessagingModule } from "./modules/messaging/messaging.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { RolesModule } from "./modules/roles/roles.module.js";
import { ReviewsModule } from "./modules/reviews/reviews.module.js";
import { TrustModule } from "./modules/trust/trust.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { VerificationModule } from "./modules/verification/verification.module.js";
import { CommunityModule } from "./modules/community/community.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { PoliciesModule } from "./modules/policies/policies.module.js";
import { RequestIdMiddleware } from "./common/request-id/request-id.middleware.js";
import { SecurityHeadersMiddleware } from "./common/security-headers.middleware.js";
import { ApiExceptionFilter } from "./common/errors/api-exception-filter.js";

@Module({
  imports: [
    FirebaseModule,
    RolesModule,
    HealthModule,
    ReferenceDataModule,
    ProfileModule,
    MediaModule,
    ListingModule,
    BookingsModule,
    MessagingModule,
    NotificationsModule,
    ReviewsModule,
    TrustModule,
    VerificationModule,
    CommunityModule,
    AiModule,
    PoliciesModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, SecurityHeadersMiddleware).forRoutes("*");
  }
}
