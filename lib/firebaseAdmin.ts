// lib/firebaseAdmin.ts
import admin from "firebase-admin";

let firebaseApp: admin.app.App | undefined;

export function getFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  // If an app already exists (hot reload), reuse it
  if (admin.apps && admin.apps.length > 0) {
    firebaseApp = admin.app(); // reuse default app
    return firebaseApp;
  }

  const saJsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJsonEnv) throw new Error("FIREBASE_SERVICE_ACCOUNT not configured");

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(saJsonEnv);
  } catch {
    try {
      const decoded = Buffer.from(saJsonEnv, "base64").toString("utf8");
      serviceAccount = JSON.parse(decoded);
    } catch (e) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT must be valid JSON or base64(JSON)"
      );
    }
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  return firebaseApp;
}
