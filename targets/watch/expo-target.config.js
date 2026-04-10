/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "watch",
  icon: '../../assets/watch_icon.jpg',
  colors: { $accent: "darkcyan", },
  info: { FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'watchoapp-c42af' },
  deploymentTarget: "8.0",
  entitlements: { /* Add entitlements */ },
});