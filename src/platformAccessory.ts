import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { BetterHttpRemotePlatform, RemoteButtonConfig } from './platform.js';

/**
 * One accessory per ESPHome button. Exposes a Switch service:
 * - Turn ON: send one press immediately, then while the switch stays on, send a press every repeatIntervalMs (hold-to-repeat for brightness/fan).
 * - Turn OFF: stop repeating.
 * - repeatIntervalMs 0 = single press only (no repeat), then switch resets to off.
 */
export class RemoteButtonAccessory {
  private service!: Service;
  private repeatTimer: ReturnType<typeof setInterval> | null = null;
  private isOn = false;

  constructor(
    private readonly platform: BetterHttpRemotePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const button = accessory.context.button as RemoteButtonConfig;
    if (!button?.baseUrl || !button?.buttonId) {
      platform.log.warn('Accessory missing button config:', accessory.displayName);
      return;
    }

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ESPHome')
      .setCharacteristic(this.platform.Characteristic.Model, 'HTTP Remote Button')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, button.uniqueId);

    this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
    this.service.setCharacteristic(this.platform.Characteristic.Name, button.buttonName);

    this.service.getCharacteristic(this.platform.Characteristic.On).onSet(this.setOn.bind(this)).onGet(this.getOn.bind(this));
  }

  private stopRepeat() {
    if (this.repeatTimer !== null) {
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
    this.isOn = false;
  }

  private async firePress(): Promise<void> {
    const button = this.accessory.context.button as RemoteButtonConfig | undefined;
    if (!button?.baseUrl || !button?.buttonId) {
      return;
    }
    const url = `${button.baseUrl}/button/${encodeURIComponent(button.buttonId)}/press`;
    this.platform.log.debug('Triggering button:', button.buttonName);
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        this.platform.log.warn('Button request failed:', button.buttonName, res.status, res.statusText);
      }
    } catch (err) {
      this.platform.log.error('Button request error:', button.buttonName, err);
    }
  }

  async setOn(value: CharacteristicValue) {
    const button = this.accessory.context.button as RemoteButtonConfig | undefined;
    if (!button?.baseUrl || !button?.buttonId) {
      return;
    }

    if (value === true) {
      this.stopRepeat();
      this.isOn = true;
      await this.firePress();

      if (button.repeatIntervalMs > 0) {
        this.repeatTimer = setInterval(() => this.firePress(), button.repeatIntervalMs);
      } else {
        this.isOn = false;
        this.service.updateCharacteristic(this.platform.Characteristic.On, false);
      }
    } else {
      this.stopRepeat();
      this.service.updateCharacteristic(this.platform.Characteristic.On, false);
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    return this.isOn;
  }
}
