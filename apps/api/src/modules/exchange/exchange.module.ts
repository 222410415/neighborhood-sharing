import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { CalendarGuardService } from "./calendar-guard.service.js";
import { MemberDirectory } from "./member-directory.service.js";

/** Shared Sprint 2 infrastructure: calendar guard and member lookups. */
@Module({
  imports: [FirebaseModule],
  providers: [CalendarGuardService, MemberDirectory],
  exports: [CalendarGuardService, MemberDirectory],
})
export class ExchangeModule {}
