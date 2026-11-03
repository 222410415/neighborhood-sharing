import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module.js";
import { ReferenceDataRepository } from "../../common/repositories/reference-data.repository.js";
import { ReferenceDataController } from "./reference-data.controller.js";

@Module({
  imports: [FirebaseModule],
  controllers: [ReferenceDataController],
  providers: [ReferenceDataRepository],
})
export class ReferenceDataModule {}
