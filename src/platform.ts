import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { RemoteButtonAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export interface ESPHomeButton {
  name: string;
  id: string;
  repeatIntervalMs?: number;
}

export interface ESPHomeDevice {
  name: string;
  baseUrl: string;
  buttons: ESPHomeButton[];
}

export interface RemoteButtonConfig {
  deviceName: string;
  baseUrl: string;
  buttonName: string;
  buttonId: string;
  uniqueId: string;
  /** Repeat interval in ms while switch is held; 0 = single press only. */
  repeatIntervalMs: number;
}

export interface BetterHttpRemotePlatformConfig extends PlatformConfig {
  name?: string;
  /** Default repeat interval (ms) while switch is held; 0 = single press only. Default 250. */
  repeatIntervalMs?: number;
  devices?: ESPHomeDevice[];
}

/**
 * Platform that exposes ESPHome device buttons as HomeKit switches.
 * Turning the switch "on" triggers the button via the ESPHome web server API (POST /button/{id}/press).
 */
export class BetterHttpRemotePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: BetterHttpRemotePlatformConfig,
    public readonly api: API
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.log.debug('Finished initializing platform:', this.config.name);
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  discoverDevices() {
    const devices = this.config.devices;
    if (!Array.isArray(devices) || devices.length === 0) {
      this.log.debug('No devices in config');
      return;
    }

    const buttonConfigs: RemoteButtonConfig[] = [];
    for (const device of devices) {
      if (!device.baseUrl || !Array.isArray(device.buttons)) continue;
      const baseUrl = device.baseUrl.replace(/\/$/, '');
      const deviceName = device.name || baseUrl;
      const platformRepeat =
        typeof this.config.repeatIntervalMs === 'number'
          ? Math.max(0, this.config.repeatIntervalMs)
          : 250;
      for (const btn of device.buttons) {
        if (!btn.id || !btn.name) continue;
        const repeatIntervalMs =
          btn.repeatIntervalMs !== undefined
            ? Math.max(0, Number(btn.repeatIntervalMs))
            : platformRepeat;
        buttonConfigs.push({
          deviceName,
          baseUrl,
          buttonName: btn.name,
          buttonId: btn.id,
          uniqueId: `esphome:${baseUrl}:button:${btn.id}`,
          repeatIntervalMs,
        });
      }
    }

    for (const buttonConfig of buttonConfigs) {
      const uuid = this.api.hap.uuid.generate(buttonConfig.uniqueId);
      const displayName = `${buttonConfig.buttonName} (${buttonConfig.deviceName})`;
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        existingAccessory.context.button = buttonConfig;
        new RemoteButtonAccessory(this, existingAccessory);
      } else {
        this.log.info('Adding new accessory:', displayName);
        const accessory = new this.api.platformAccessory(displayName, uuid);
        accessory.context.button = buttonConfig;
        new RemoteButtonAccessory(this, accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      this.discoveredCacheUUIDs.push(uuid);
    }

    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
