/**
 * Discover button entities from an ESPHome device by connecting to its /events
 * Server-Sent Events stream. The device sends state events with id "button/..."
 * or "button-..." and optional "name". We use the entity name as the button id
 * when present so the REST URL matches the web UI (e.g. "Fan on⁄off").
 */

const DISCOVERY_TIMEOUT_MS = 8000;
const DISCOVERY_IDLE_MS = 1500;

export interface DiscoveredButton {
  id: string;
  name: string;
}

/**
 * Fetch the /events SSE stream, parse button state events, and return the list
 * of buttons. Button id is the entity name when available (so POST
 * /button/{encodeURIComponent(id)}/press matches the web UI); otherwise the
 * object_id from legacy id or name_id. Resolves after DISCOVERY_TIMEOUT_MS or
 * DISCOVERY_IDLE_MS with no new data.
 */
export async function discoverButtonsFromDevice(baseUrl: string): Promise<DiscoveredButton[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/events`;
  const seen = new Map<string, DiscoveredButton>(); // canonical key -> { id, name }

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
    return Array.from(seen.values());
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
        const dataLines = block
          .split(/\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim());
        const jsonStr = dataLines.join('\n');
        if (jsonStr === '[DONE]' || !jsonStr) {
          continue;
        }
        try {
          const data = JSON.parse(jsonStr) as { id?: string; name_id?: string; name?: string };
          const rawId = data?.id ?? data?.name_id;
          if (typeof rawId !== 'string') {
            continue;
          }
          let objectId: string | null = null;
          if (rawId.startsWith('button/')) {
            objectId = rawId.slice(7);
          } else if (rawId.startsWith('button-')) {
            objectId = rawId.slice(7);
          }
          if (!objectId) {
            continue;
          }
          const canonicalKey = rawId;
          if (seen.has(canonicalKey)) {
            continue;
          }
          // Use entity name as button id when present so REST URL matches web UI
          // (e.g. "Fan on⁄off" -> /button/Fan%20on%E2%81%84off/press).
          const restId = typeof data.name === 'string' ? data.name : objectId;
          const displayName = typeof data.name === 'string' ? data.name : objectId;
          seen.set(canonicalKey, { id: restId, name: displayName });
          resetIdle();
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
