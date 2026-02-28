import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { discoverButtonsFromDevice } from './esphomeDiscovery.js';
import { discoverESPHomeDevicesOnNetwork } from './esphomeDeviceDiscovery.js';
import { RemoteButtonAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export type ControlType = 'button' | 'switch';

export interface ESPHomeButton {
  name: string;
  id: string;
  repeatIntervalMs?: number;
  /** "button" = momentary (fire-and-forget, single press); "switch" = toggle with optional repeat. */
  controlType?: ControlType;
  /** Override fire-and-forget for this button (default depends on controlType). */
  fireAndForget?: boolean;
}

export interface ESPHomeDevice {
  name: string;
  baseUrl: string;
  /** When singleRemotePerDevice is true: name of the one tile in the Home app (e.g. "Ceiling Fan"). If unset, uses "{name} Remote". */
  accessoryName?: string;
  /** When true, buttons are discovered from the device's /events stream; buttons array is optional. */
  discoverButtons?: boolean;
  buttons?: ESPHomeButton[];
  /** Default control type for buttons on this device. */
  controlType?: ControlType;
}

export interface RemoteButtonConfig {
  deviceName: string;
  baseUrl: string;
  buttonName: string;
  buttonId: string;
  uniqueId: string;
  /** Repeat interval in ms while switch is held; 0 = single press only. */
  repeatIntervalMs: number;
  /** When true, press triggers once and switch resets to Off; when false, switch stays On until turned Off. */
  fireAndForget: boolean;
}

/** Context for a single "remote" accessory (one per device, many buttons). */
export interface RemoteDeviceContext {
  deviceName: string;
  /** Display name for the single tile in the Home app (e.g. "Ceiling Fan"). */
  accessoryDisplayName: string;
  baseUrl: string;
  buttons: RemoteButtonConfig[];
}

export interface BetterHttpRemotePlatformConfig extends PlatformConfig {
  name?: string;
  /** Default repeat interval (ms) while switch is held; 0 = single press only. Default 250. */
  repeatIntervalMs?: number;
  /** When true (default), switches reset to Off after a press and turning Off does nothing. When false, switch stays On until turned Off. */
  fireAndForget?: boolean;
  /** "button" = momentary (fire-and-forget, single press); "switch" = toggle with optional repeat. Default "button". */
  controlType?: ControlType;
  /**
   * When false (default), one accessory per button so each shows its name in Home.
   * When true, one "remote" per device (grouped) but Home may show the same name for each control.
   */
  singleRemotePerDevice?: boolean;
  /** When true, discover all ESPHome devices on the network via mDNS; devices array is optional. */
  discoverDevicesOnNetwork?: boolean;
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
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.log.debug('Finished initializing platform:', this.config.name);
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      void this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    type DeviceEntry = {
      name: string;
      baseUrl: string;
      accessoryName?: string;
      discoverButtons?: boolean;
      buttons?: ESPHomeButton[];
      controlType?: ControlType;
    };
    let devicesToUse: DeviceEntry[] = [];

    if (this.config.discoverDevicesOnNetwork) {
      this.log.info('Discovering ESPHome devices on network (mDNS)...');
      try {
        const discovered = await discoverESPHomeDevicesOnNetwork();
        this.log.info('Discovered', discovered.length, 'ESPHome device(s) on network');
        devicesToUse = discovered.map((d) => ({
          name: d.name,
          baseUrl: `http://${d.ip}`,
          discoverButtons: true,
        }));
      } catch (err) {
        this.log.warn('Network discovery failed:', err);
      }
    }

    const devices = this.config.devices;
    if (Array.isArray(devices) && devices.length > 0) {
      for (const device of devices) {
        if (device.baseUrl) {
          devicesToUse.push({
            name: device.name || device.baseUrl.replace(/\/$/, ''),
            baseUrl: device.baseUrl.replace(/\/$/, ''),
            accessoryName: device.accessoryName,
            discoverButtons: device.discoverButtons,
            buttons: device.buttons,
            controlType: device.controlType,
          });
        }
      }
    }

    if (devicesToUse.length === 0) {
      this.log.debug('No devices (discovery found none and config has none)');
      return;
    }

    const platformRepeat = typeof this.config.repeatIntervalMs === 'number' ? Math.max(0, this.config.repeatIntervalMs) : 250;
    const platformFireAndForget = typeof this.config.fireAndForget === 'boolean' ? this.config.fireAndForget : true;
    const platformControlType = this.config.controlType === 'switch' || this.config.controlType === 'button' ? this.config.controlType : 'button';
    const singleRemotePerDevice = typeof this.config.singleRemotePerDevice === 'boolean' ? this.config.singleRemotePerDevice : false;
    const deviceContexts: RemoteDeviceContext[] = [];
    const singleButtonConfigs: RemoteButtonConfig[] = [];

    for (const device of devicesToUse) {
      const baseUrl = device.baseUrl.replace(/\/$/, '');
      const deviceName = device.name || baseUrl;
      const deviceControlType = device.controlType === 'switch' || device.controlType === 'button' ? device.controlType : platformControlType;
      let buttons: ESPHomeButton[];

      if (device.discoverButtons) {
        this.log.info('Discovering buttons from device:', deviceName, baseUrl);
        try {
          const discovered = await discoverButtonsFromDevice(baseUrl, this.log);
          buttons = discovered.map((b) => ({ id: b.id, name: b.name }));
          this.log.info('Discovered', buttons.length, 'button(s) from', deviceName);
        } catch (err) {
          this.log.warn('Discovery failed for', deviceName, err);
          buttons = [];
        }
      } else if (Array.isArray(device.buttons)) {
        buttons = device.buttons;
      } else {
        continue;
      }

      const buttonConfigs: RemoteButtonConfig[] = [];
      for (const btn of buttons) {
        if (!btn.id || !btn.name) {
          continue;
        }
        const controlType: ControlType = btn.controlType === 'switch' || btn.controlType === 'button' ? btn.controlType : deviceControlType;
        const isButton = controlType === 'button';
        const repeatIntervalMs = btn.repeatIntervalMs !== undefined ? Math.max(0, Number(btn.repeatIntervalMs)) : isButton ? 0 : platformRepeat;
        const fireAndForget = typeof btn.fireAndForget === 'boolean' ? btn.fireAndForget : isButton ? true : platformFireAndForget;
        buttonConfigs.push({
          deviceName,
          baseUrl,
          buttonName: btn.name,
          buttonId: btn.id,
          uniqueId: `esphome:${baseUrl}:button:${btn.id}`,
          repeatIntervalMs,
          fireAndForget,
        });
      }
      if (buttonConfigs.length > 0) {
        if (singleRemotePerDevice) {
          const accessoryDisplayName = (typeof device.accessoryName === 'string' && device.accessoryName.trim()) || `${deviceName} Remote`;
          deviceContexts.push({ deviceName, accessoryDisplayName, baseUrl, buttons: buttonConfigs });
        } else {
          singleButtonConfigs.push(...buttonConfigs);
        }
      }
    }

    if (singleRemotePerDevice) {
      for (const ctx of deviceContexts) {
        const uuid = this.api.hap.uuid.generate(`esphome:${ctx.baseUrl}:remote`);
        const displayName = ctx.accessoryDisplayName;
        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.device = ctx;
          existingAccessory.context.button = undefined;
          new RemoteButtonAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new accessory:', displayName);
          const accessory = new this.api.platformAccessory(displayName, uuid);
          accessory.context.device = ctx;
          new RemoteButtonAccessory(this, accessory);
          this.accessories.set(uuid, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
        this.discoveredCacheUUIDs.push(uuid);
      }
    } else {
      for (const buttonConfig of singleButtonConfigs) {
        const uuid = this.api.hap.uuid.generate(buttonConfig.uniqueId);
        const displayName = `${buttonConfig.buttonName} (${buttonConfig.deviceName})`;
        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.button = buttonConfig;
          existingAccessory.context.device = undefined;
          new RemoteButtonAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new accessory:', displayName);
          const accessory = new this.api.platformAccessory(displayName, uuid);
          accessory.context.button = buttonConfig;
          new RemoteButtonAccessory(this, accessory);
          this.accessories.set(uuid, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
        this.discoveredCacheUUIDs.push(uuid);
      }
    }

    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
