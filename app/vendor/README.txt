Ascend · vendored Firebase web SDK

File:      firebase.js  (one ES module, minified)
Contents:  firebase/app, firebase/auth (Google popup), firebase/firestore/lite, firebase/app-check and firebase/ai,
           bundled with their dependencies. Ascend uses app, auth and firestore/lite today.
Versions:  firebase 13.3.0, built with esbuild 0.28.2
           (npm install firebase@13.3.0, then esbuild entry.js --bundle --format=esm --minify --target=es2022 --legal-comments=none)
SHA-256:   739293a6af57ad5628a04efd265f170134dea8a00e10458b7858996be9a9ace3
Licence:   Apache License 2.0, see LICENSE-firebase.txt (copyright Google LLC and the Firebase authors)

The app loads this file with a dynamic import() only when the person opens the account card or has signed in before.
