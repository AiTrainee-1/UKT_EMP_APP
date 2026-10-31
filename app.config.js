// Adds Firebase to the Android build when google-services.json is present in this folder.
//
// Phone notifications that reach a CLOSED app go through Google's Firebase Cloud Messaging. A build made without
// google-services.json cannot get a push address from Android, so notifications would only ever show inside the app.
// Everything else comes from app.json; drop the file next to it (see docs/PUSH_NOTIFICATIONS.md) and the next build
// picks it up with no other change.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(googleServices)) return config;
  return { ...config, android: { ...config.android, googleServicesFile: './google-services.json' } };
};
