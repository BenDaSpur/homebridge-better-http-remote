declare module 'multicast-dns' {
  interface ResponsePacket {
    answers?: Array<{ name?: string; type?: string; data?: unknown }>;
    additionals?: Array<{ name?: string; type?: string; data?: unknown }>;
  }

  function mdns(options?: { multicast?: boolean; port?: number; ip?: string }): {
    on(event: 'response', handler: (response: ResponsePacket) => void): void;
    query(name: string, type: string): void;
    destroy(): void;
  };

  export default mdns;
}
