import type { API } from 'homebridge';

import { BetterHttpRemotePlatform } from './platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

/**
 * This method registers the platform with Homebridge.
 * Registered under both PLATFORM_NAME (BetterHttpRemote) and PLUGIN_NAME so either
 * "platform": "BetterHttpRemote" or "platform": "homebridge-esphome-buttons" works.
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, BetterHttpRemotePlatform);
  api.registerPlatform(PLUGIN_NAME, BetterHttpRemotePlatform);
};
