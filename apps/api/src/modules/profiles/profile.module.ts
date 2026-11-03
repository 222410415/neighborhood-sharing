import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ProfileRepository } from "../../common/repositories/profile.repository.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { ProfileController } from "./profile.controller.js";

@Module({
  imports: [FirebaseModule],
  controllers: [ProfileController],
  providers: [ProfileRepository, AuthGuard],
})
export class ProfileModule {}
