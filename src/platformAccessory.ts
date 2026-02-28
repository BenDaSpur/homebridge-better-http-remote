import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { BetterHttpRemotePlatform, RemoteButtonConfig, RemoteDeviceContext } from './platform.js';

/**
 * Handles either (a) one "remote" accessory with multiple Switch services, or (b) one accessory per button with a single Switch.
 * When context.device is set: multi-service remote. When context.button is set: single button (correct name in Home).
 */
export class RemoteButtonAccessory {
  /** Per-button repeat timer, keyed by button uniqueId. */
  private readonly repeatTimers = new Map<string, ReturnType<typeof setInterval>>();
  /** Per-button on state when fireAndForget is false. */
  private readonly onState = new Map<string, boolean>();

  constructor(
    private readonly platform: BetterHttpRemotePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const device = accessory.context.device as RemoteDeviceContext | undefined;
    const singleButton = accessory.context.button as RemoteButtonConfig | undefined;

    if (singleButton?.baseUrl && singleButton?.buttonId) {
      this.setupSingleButton(singleButton);
      return;
    }
    if (!device?.baseUrl || !Array.isArray(device.buttons) || device.buttons.length === 0) {
      platform.log.warn('Accessory missing device config:', accessory.displayName);
      return;
    }

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ESPHome')
      .setCharacteristic(this.platform.Characteristic.Model, 'ESPHome Remote')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `esphome:${device.baseUrl}`);

    for (const button of device.buttons) {
      if (!button.baseUrl || !button.buttonId) {
        continue;
      }
      const subtype = button.uniqueId;
      const svc =
        this.accessory.getServiceById(this.platform.Service.Switch, subtype) ||
        this.accessory.addService(this.platform.Service.Switch, button.buttonName, subtype);
      // Ensure each control shows its real name (e.g. "Fan on/off") in the Home app, not the accessory name.
      svc.setCharacteristic(this.platform.Characteristic.Name, button.buttonName);
      if ('displayName' in svc) {
        (svc as Service & { displayName: string }).displayName = button.buttonName;
      }
      svc
        .getCharacteristic(this.platform.Characteristic.On)
        .onSet((value) => this.setOn(button, svc, value))
        .onGet(() => this.getOn(button));
    }
  }

  private setupSingleButton(button: RemoteButtonConfig) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ESPHome')
      .setCharacteristic(this.platform.Characteristic.Model, 'ESPHome Button')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, button.uniqueId);

    const svc = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch, button.buttonName);
    svc
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet((value) => this.setOn(button, svc, value))
      .onGet(() => this.getOn(button));
  }

  private getOn(button: RemoteButtonConfig): boolean {
    if (button.fireAndForget) {
      return false;
    }
    return this.onState.get(button.uniqueId) ?? false;
  }

  private stopRepeat(buttonUniqueId: string) {
    const t = this.repeatTimers.get(buttonUniqueId);
    if (t) {
      clearInterval(t);
      this.repeatTimers.delete(buttonUniqueId);
    }
  }

  private async firePress(button: RemoteButtonConfig): Promise<void> {
    if (!button?.baseUrl || !button?.buttonId) {
      return;
    }
    const url = `${button.baseUrl}/button/${encodeURIComponent(button.buttonId)}/press`;
    this.platform.log.debug('Triggering button:', button.buttonName);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      });
      if (!res.ok) {
        this.platform.log.warn('Button request failed:', button.buttonName, res.status, res.statusText);
      }
    } catch (err) {
      this.platform.log.error('Button request error:', button.buttonName, err);
    }
  }

  private async setOn(button: RemoteButtonConfig, service: Service, value: CharacteristicValue) {
    if (value === true) {
      this.stopRepeat(button.uniqueId);
      if (!button.fireAndForget) {
        this.onState.set(button.uniqueId, true);
      }
      await this.firePress(button);

      if (button.repeatIntervalMs > 0) {
        this.repeatTimers.set(
          button.uniqueId,
          setInterval(() => this.firePress(button), button.repeatIntervalMs),
        );
      } else if (button.fireAndForget) {
        setImmediate(() => service.updateCharacteristic(this.platform.Characteristic.On, false));
      }
    } else {
      this.stopRepeat(button.uniqueId);
      if (!button.fireAndForget) {
        this.onState.set(button.uniqueId, false);
      }
      service.updateCharacteristic(this.platform.Characteristic.On, false);
    }
  }
}
