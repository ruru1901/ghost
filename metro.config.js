const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

/**
 * Ghost – Metro Config
 * Provides Node.js core module shims for packages that expect
 * a browser-like environment (tweetnacl, buffer, events, etc.)
 */
const config = {
  resolver: {
    sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json'],
    // Map Node core modules to npm shim packages
    extraNodeModules: {
      buffer: path.resolve(__dirname, 'node_modules/buffer'),
      events: path.resolve(__dirname, 'node_modules/events'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
