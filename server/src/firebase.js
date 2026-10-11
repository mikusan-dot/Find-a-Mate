import admin from 'firebase-admin';

let ready = false;

export function initFirebase() {
  if (admin.apps.length) return true;
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_STORAGE_BUCKET } = process.env;
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && FIREBASE_PROJECT_ID) {
    admin.initializeApp({ projectId: FIREBASE_PROJECT_ID, storageBucket: FIREBASE_STORAGE_BUCKET });
    ready = true;
  } else if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      storageBucket: FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.appspot.com`,
    });
    ready = true;
  } else {
    console.warn('[firebase] credentials missing: API will return 503 until FIREBASE_* variables are set.');
  }
  return ready;
}

export const isReady = () => ready;
export const db = () => admin.firestore();
export const auth = () => admin.auth();
export const bucket = () => admin.storage().bucket();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
