import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { finalizeEvent, Event, UnsignedEvent } from 'nostr-tools/pure';
import { Filter } from 'nostr-tools';
import WebSocket from 'ws';
import net from 'net';

// Custom WebSocket wrapper to force IPv4 if IPv6 checks fail
class CustomWebSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions) {
        // Handle argument shifting to match WS signature
        if (protocols && !Array.isArray(protocols) && typeof protocols === 'object') {
            options = protocols as WebSocket.ClientOptions;
            protocols = undefined;
        }

        const newOptions = { ...options, family: 4 };
        super(url, protocols, newOptions);
    }
}

// Check for IPv6 connectivity
async function checkIPv6Connectivity(): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = net.createConnection({
            host: '2001:4860:4860::8888', // Google Public DNS IPv6
            port: 53,
            family: 6,
            timeout: 2000 // 2s timeout
        });

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
    });
}

// Global pool instance management
let pool: SimplePool | null = null;

export async function getPool(verbose: boolean = false): Promise<SimplePool> {
    if (pool) return pool;

    const hasIPv6 = await checkIPv6Connectivity();
    if (hasIPv6) {
        useWebSocketImplementation(WebSocket);
        if (verbose) console.log("🌐 IPv6 connectivity detected. Using standard WebSocket.");
    } else {
        useWebSocketImplementation(CustomWebSocket as any);
        if (verbose) console.log("⚠️  No IPv6 connectivity. Forcing IPv4.");
    }

    pool = new SimplePool();
    return pool;
}

export async function closePool(relays: string[]) {
    if (pool) {
        pool.close(relays);
        pool = null;
    }
}

export function listEvents(pool: SimplePool, relays: string[], filters: Filter[]): Promise<Event[]> {
    // SimplePool.subscribeMany is unimplemented in this version of nostr-tools.
    // Use querySync which subscribes, waits for EOSE from all relays, then resolves.
    if (filters.length === 1) {
        return (pool as any).querySync(relays, filters[0]);
    }
    return Promise.all(filters.map((f) => (pool as any).querySync(relays, f) as Promise<Event[]>))
        .then((results) => results.flat());
}

export async function publishToNostr(
    relays: string[],
    event: Event,
    verbose: boolean = false
): Promise<string[]> {
    const p = await getPool(verbose);
    const successRelays: string[] = [];

    const publishPromises = relays.map(async (relay) => {
        try {
            await p.publish([relay], event);
            if (verbose) console.log(`  ✅ Accepted by ${relay}`);
            successRelays.push(relay);
        } catch (err: any) {
            // Simple retry logic could affect typing, keep simple for now or implement retry similar to original
            if (verbose) console.log(`  ⚠️ Rejected by ${relay}: ${err.message || err}`);
        }
    });

    await Promise.all(publishPromises);
    return successRelays;
}

export async function deleteNote(
    relays: string[],
    privateKey: string,
    noteId: string,
    pubkey: string,
    dTag?: string,
    kind: number = 30023
): Promise<string[]> {
    const tags = [
        ["e", noteId],
        ["k", String(kind)],
    ];

    // For replaceable events (like kind:30023 articles), also include 'a' tag
    if (dTag) {
        tags.push(["a", `${kind}:${pubkey}:${dTag}`]);
    }

    const deleteEvent: UnsignedEvent = {
        kind: 5, // deletion event
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: "Deleted by the author",
        pubkey: pubkey,
    };

    const signedEvent = finalizeEvent(deleteEvent, Uint8Array.from(Buffer.from(privateKey, 'hex')));
    return await publishToNostr(relays, signedEvent);
}

export function createNip98Auth(url: string, method: string, privateKey: string): string {
    const event: UnsignedEvent = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['u', url],
            ['method', method],
        ],
        content: '',
        pubkey: '' // Request signing will fill this if using finalizeEvent correctly with key
    };
    // Note: finalizeEvent computes pubkey from private key
    const signedEvent = finalizeEvent(event, Uint8Array.from(Buffer.from(privateKey, 'hex')));
    return 'Nostr ' + btoa(JSON.stringify(signedEvent));
}
