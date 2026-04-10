const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withStripPush(config) {
  return withEntitlementsPlist(config, config => {
    // Forcibly remove the push notification capability
    delete config.modResults['aps-environment'];
    return config;
  });
};
