import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";

// `||` (not `??`) so an empty build argument falls back to the default.
const firebaseConfig = {
  apiKey:
    process.env["NEXT_PUBLIC_FIREBASE_API_KEY"] ||
    "AIzaSyBRD-CHSC306RLREaSjdUVUGuci95u5ON8",
  authDomain:
    process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] ||
    "neighborhood-sharing.firebaseapp.com",
  projectId:
    process.env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] || "neighborhood-sharing",
  storageBucket:
    process.env["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"] ||
    "neighborhood-sharing.firebasestorage.app",
  messagingSenderId:
    process.env["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"] || "72444173558",
  appId:
    process.env["NEXT_PUBLIC_FIREBASE_APP_ID"] ||
    "1:72444173558:web:98ff06f17cff16c5efa0d7",
  measurementId:
    process.env["NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"] || "G-B43NY3L0WW",
};

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;

  if (getApps().length === 0) {
    initializeApp(firebaseConfig);
  }

  authInstance = getAuth(getApp());

  const emulatorHost = process.env["NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST"];

  // Only connect to emulator if the env var is explicitly set
  if (emulatorHost) {
    connectAuthEmulator(authInstance, emulatorHost, {
      disableWarnings: true,
    });
  }

  setPersistence(authInstance, browserLocalPersistence).catch(() => {});

  return authInstance;
}

export { firebaseConfig };
