import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { BetterHttpRemotePlatform, BetterHttpRemotePlatformConfig, RemoteButtonConfig, RemoteDeviceContext } from './platform.js';

/**
 * One "remote" accessory per device: multiple Switch services (one per button).
 * When fireAndForget: only "On" triggers a press; "Off" does nothing. Single press resets to Off.
 * When !fireAndForget: switch stays On until user turns Off (no second press when turning Off).
 */
export class RemoteButtonAccessory {
  /** Per-button repeat timer, keyed by button uniqueId. */
  private readonly repeatTimers = new Map<string, ReturnType<typeof setInterval>>();
  /** Per-button on state when fireAndForget is false. */
  private readonly onState = new Map<string, boolean>();
  private readonly fireAndForget: boolean = true;

  constructor(
    private readonly platform: BetterHttpRemotePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const device = accessory.context.device as RemoteDeviceContext | undefined;
    if (!device?.baseUrl || !Array.isArray(device.buttons) || device.buttons.length === 0) {
      platform.log.warn('Accessory missing device config:', accessory.displayName);
      return;
    }

    const config = this.platform.config as BetterHttpRemotePlatformConfig;
    this.fireAndForget = typeof config.fireAndForget === 'boolean' ? config.fireAndForget : true;

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
      svc.setCharacteristic(this.platform.Characteristic.Name, button.buttonName);
      svc
        .getCharacteristic(this.platform.Characteristic.On)
        .onSet((value) => this.setOn(button, svc, value))
        .onGet(() => this.getOn(button.uniqueId));
    }
  }

  private getOn(buttonUniqueId: string): boolean {
    if (this.fireAndForget) {
      return false;
    }
    return this.onState.get(buttonUniqueId) ?? false;
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
      const res = await fetch(url, { method: 'POST', body: '' });
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
      if (!this.fireAndForget) {
        this.onState.set(button.uniqueId, true);
      }
      await this.firePress(button);

      if (button.repeatIntervalMs > 0) {
        this.repeatTimers.set(
          button.uniqueId,
          setInterval(() => this.firePress(button), button.repeatIntervalMs),
        );
      } else if (this.fireAndForget) {
        setImmediate(() => service.updateCharacteristic(this.platform.Characteristic.On, false));
      }
    } else {
      this.stopRepeat(button.uniqueId);
      if (!this.fireAndForget) {
        this.onState.set(button.uniqueId, false);
      }
      service.updateCharacteristic(this.platform.Characteristic.On, false);
    }
  }
}
