/**
 * Discover ESPHome devices on the local network via mDNS.
 * ESPHome devices advertise the service type _esphomelib._tcp.
 */

import mdns from 'multicast-dns';

const SERVICE_TYPE = '_esphomelib._tcp.local';
const DISCOVERY_TIMEOUT_MS = 6000;

export interface DiscoveredESPHomeDevice {
  /** Friendly name (from mDNS service instance, e.g. mainbedroom) */
  name: string;
  /** Hostname (e.g. mainbedroom.local) */
  hostname: string;
  /** IPv4 address for baseUrl */
  ip: string;
}

/**
 * Browse for _esphomelib._tcp services and return devices with name, hostname, and IP.
 * Uses IP for baseUrl so we don't rely on .local resolution for fetch.
 */
export function discoverESPHomeDevicesOnNetwork(): Promise<DiscoveredESPHomeDevice[]> {
  return new Promise((resolve) => {
    const byService = new Map<string, string>(); // service instance name -> short name
    const srvTarget = new Map<string, string>(); // service instance name -> target hostname
    const aRecords = new Map<string, string>(); // hostname (lowercase) -> ip
    const results = new Map<string, DiscoveredESPHomeDevice>();

    const mdnsInstance = mdns();

    setTimeout(() => {
      mdnsInstance.destroy();
      // Build results: for each service we have short name; get SRV target then A record
      for (const [serviceName, shortName] of byService.entries()) {
        const target = srvTarget.get(serviceName);
        if (!target) {
          continue;
        }
        const targetNorm = target.toLowerCase().replace(/\.$/, '');
        const ip = aRecords.get(targetNorm) || aRecords.get(targetNorm + '.local');
        if (ip) {
          results.set(ip, { name: shortName, hostname: target.endsWith('.') ? target.slice(0, -1) : target, ip });
        }
      }
      resolve(Array.from(results.values()));
    }, DISCOVERY_TIMEOUT_MS);

    mdnsInstance.on('response', (response) => {
      const answers = response.answers ?? [];
      const additionals = response.additionals ?? [];
      const all = [...answers, ...additionals];

      for (const rr of all) {
        const rtype = rr.type;
        const name = (rr.name || '').toLowerCase();
        if (rtype === 'PTR' && name === SERVICE_TYPE) {
          const data = rr.data as string | undefined;
          if (data) {
            const full = data.toLowerCase().replace(/\.$/, '');
            const shortName = full.replace(/\._esphomelib\._tcp\.local\.?$/i, '');
            byService.set(full, shortName);
          }
        }
        if (rtype === 'SRV') {
          const target = (rr.data as { target?: string } | undefined)?.target;
          if (target && rr.name) {
            const key = rr.name.toLowerCase().replace(/\.$/, '');
            srvTarget.set(key, target.endsWith('.') ? target.slice(0, -1) : target);
          }
        }
        if (rtype === 'A') {
          const data = rr.data as string | undefined;
          if (typeof data === 'string') {
            const key = name.replace(/\.$/, '');
            aRecords.set(key, data);
          }
        }
      }
    });

    mdnsInstance.query(SERVICE_TYPE, 'PTR');
  });
}
