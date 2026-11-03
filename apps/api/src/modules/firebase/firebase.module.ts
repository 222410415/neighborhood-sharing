import { Module, Global } from "@nestjs/common";
import { initializeFirebaseAdmin, type FirebaseAdminInstance } from "./firebase-admin.js";
import { FirebaseService } from "./firebase.service.js";

@Module({
  providers: [
    {
      provide: "FIREBASE_ADMIN",
      useFactory: (): FirebaseAdminInstance => initializeFirebaseAdmin(),
    },
    {
      provide: FirebaseService,
      useFactory: (instance: FirebaseAdminInstance) => new FirebaseService(instance),
      inject: ["FIREBASE_ADMIN"],
    },
  ],
  exports: ["FIREBASE_ADMIN", FirebaseService],
})
@Global()
export class FirebaseModule {}
