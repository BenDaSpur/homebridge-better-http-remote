/**
 * Discover button entities from an ESPHome device by connecting to its /events
 * Server-Sent Events stream. The device sends state events with id "button/..."
 * and optional "name". We collect these to build the list of buttons.
 */

const DISCOVERY_TIMEOUT_MS = 8000;
const DISCOVERY_IDLE_MS = 1500;

export interface DiscoveredButton {
  id: string;
  name: string;
}

/**
 * Fetch the /events SSE stream, parse events whose data.id starts with "button/",
 * and return the list of buttons (id = part after "button/", name = data.name or id).
 * Resolves after DISCOVERY_TIMEOUT_MS or DISCOVERY_IDLE_MS with no new data.
 */
export async function discoverButtonsFromDevice(baseUrl: string): Promise<DiscoveredButton[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/events`;
  const seen = new Map<string, string>(); // id -> name

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let resolved = false;

  const finish = (): DiscoveredButton[] => {
    if (resolved) {
      return [];
    }
    resolved = true;
    clearTimeout(timeout);
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  };

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      return finish();
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const resetIdle = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        controller.abort();
      }, DISCOVERY_IDLE_MS);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\n\n+/);
      buffer = parts.pop() ?? '';

      for (const block of parts) {
        const line = block.split(/\n/).find((l) => l.startsWith('data:'));
        if (!line) {
          continue;
        }
        const jsonStr = line.slice(5).trim();
        if (jsonStr === '[DONE]' || !jsonStr) {
          continue;
        }
        try {
          const data = JSON.parse(jsonStr) as { id?: string; name?: string };
          const id = data?.id;
          if (typeof id === 'string' && id.startsWith('button/')) {
            const buttonId = id.slice(7);
            const name = typeof data.name === 'string' ? data.name : buttonId;
            if (buttonId && !seen.has(buttonId)) {
              seen.set(buttonId, name);
            }
            resetIdle();
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  } catch {
    // fetch error or abort
  }

  return finish();
}
