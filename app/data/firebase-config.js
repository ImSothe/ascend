// Firebase web configuration of the Ascend project. These values identify the
// project to Google's servers; they are public by design (every Firebase web
// app ships them) and they are NOT credentials. What protects the data is
// firestore.rules: a signed-in user can only touch their own documents.
// If apiKey were empty the app would work on the device only and hide sign-in.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAeYD9kZnNaEQ7SADf1FkWn7m03ovdDe94',
  authDomain: 'ascend-db682.firebaseapp.com',
  projectId: 'ascend-db682',
  storageBucket: 'ascend-db682.firebasestorage.app',
  messagingSenderId: '714873777005',
  appId: '1:714873777005:web:3047bd16262a42032c0864',
};

// Public site key of the reCAPTCHA Enterprise (Fraud Defense) key that App
// Check uses to prove AI requests come from this web app. Public by design;
// there is no secret half for this provider.
export const APP_CHECK_SITE_KEY = '6Lcy6CQuAAAAAGgbdXF_4I3VXmZLQGugZ254Jahb';
