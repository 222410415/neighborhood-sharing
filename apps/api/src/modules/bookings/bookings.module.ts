import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ExchangeModule } from "../exchange/exchange.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { OptionalAuthGuard } from "../../common/guards/optional-auth.guard.js";
import { AvailabilityService } from "./availability.service.js";
import { QuoteService } from "./quote.service.js";
import { BookingCommandRunner } from "./booking-command-runner.js";
import { BookingService } from "./booking.service.js";
import { BookingQueryService } from "./booking-query.service.js";
import { HandoverService } from "./handover.service.js";
import { OwnerCalendarController } from "./owner-calendar.controller.js";
import { PublicAvailabilityController } from "./public-availability.controller.js";
import { BookingController } from "./booking.controller.js";
import { SweepController } from "./sweep.controller.js";

@Module({
  imports: [FirebaseModule, ExchangeModule],
  controllers: [
    OwnerCalendarController,
    PublicAvailabilityController,
    BookingController,
    SweepController,
  ],
  providers: [
    AvailabilityService,
    QuoteService,
    BookingCommandRunner,
    BookingService,
    BookingQueryService,
    HandoverService,
    AuthGuard,
    OptionalAuthGuard,
  ],
})
export class BookingsModule {}
