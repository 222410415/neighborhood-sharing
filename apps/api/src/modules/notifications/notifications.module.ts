import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { NotificationService } from "./notification.service.js";
import { NotificationController } from "./notification.controller.js";
import { ReminderService } from "./reminder.service.js";

@Module({
  imports: [FirebaseModule],
  controllers: [NotificationController],
  providers: [NotificationService, ReminderService, AuthGuard],
  exports: [ReminderService],
})
export class NotificationsModule {}
