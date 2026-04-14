const { startDeviceSimulator } = require('./deviceSimulator');

// simulate multiple devices
startDeviceSimulator(
  Array.from({ length: 50 }, (_, i) => 28 + i)
);