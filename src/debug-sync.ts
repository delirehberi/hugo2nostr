/**
 * Debug script for sync fetch issues.
 * Run with: npx ts-node --esm src/debug-sync.ts
 *
 * Tests each part of the fetch chain independently to isolate
 * where the 0-events result is coming from.
 */

import WebSocket from 'ws';
import net from 'net';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { ConfigManager } from './core/config.js';
import * as nip19 from 'nostr-tools/nip19';
import { getPublicKey } from 'nostr-tools/pure';

// ── helpers ──────────────────────────────────────────────────────────────────

function pass(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`  ℹ️  ${msg}`); }
function sep(label: string) { console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`); }

async function checkIPv6(): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: '2001:4860:4860::8888', port: 53, family: 6, timeout: 2000 });
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('error',   () => { socket.destroy(); resolve(false); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
}

// Raw WebSocket ping — checks that the relay accepts connections at all
async function pingRelay(url: string, timeoutMs = 5000): Promise<{ ok: boolean; ms: number; error?: string }> {
    return new Promise((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (ok: boolean, error?: string) => {
            if (done) return;
            done = true;
            ws.terminate?.();
            resolve({ ok, ms: Date.now() - start, error });
        };

        const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
        const ws = new WebSocket(url);
        ws.on('open',  () => { clearTimeout(timer); finish(true); });
        ws.on('error', (e) => { clearTimeout(timer); finish(false, e.message); });
    });
}

// Raw subscription test — bypasses our listEvents wrapper entirely
function rawQuerySync(
    pool: SimplePool,
    relays: string[],
    filter: Record<string, any>,
    timeoutMs = 15000
): Promise<any[]> {
    return new Promise((resolve) => {
        const events: any[] = [];
        let resolved = false;

        const finish = () => {
            if (resolved) return;
            resolved = true;
            resolve(events);
        };

        // Use the pool's built-in querySync
        (pool as any).querySync(relays, filter).then((evs: any[]) => {
            if (!resolved) { resolved = true; resolve(evs); }
        }).catch((err: any) => {
            console.error('    querySync threw:', err);
            finish();
        });

        // Fallback timeout
        setTimeout(finish, timeoutMs);
    });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n🔍  hugo2nostr sync debug\n');

    // 1. Config
    sep('1. Configuration');
    const cm = new ConfigManager({ verbose: true });
    const siteConfig = cm.resolveSiteConfig();
    const relays: string[] = siteConfig.relays || [];
    info(`Site:      ${siteConfig.name}`);
    info(`Posts dir: ${siteConfig.posts_dir}`);
    info(`Relays:    ${relays.length ? relays.join(', ') : '(none)'}`);

    if (relays.length === 0) {
        fail('No relays configured — sync cannot proceed.');
        process.exit(1);
    }

    // 2. Pubkey
    sep('2. Pubkey resolution');
    let pubkey: string | null = null;
    const privateKey = cm.getPrivateKey();
    if (privateKey) {
        pubkey = getPublicKey(Uint8Array.from(Buffer.from(privateKey, 'hex')));
        pass(`Derived from private key: ${pubkey}`);
    } else if (siteConfig.author_id) {
        const id = siteConfig.author_id;
        if (id.startsWith('npub')) {
            const { data } = nip19.decode(id);
            pubkey = data as string;
            pass(`Decoded from npub: ${pubkey}`);
        } else if (id.includes('@')) {
            info(`Resolving NIP-05 identifier: ${id}`);
            const { queryProfile } = await import('nostr-tools/nip05');
            const profile = await queryProfile(id);
            pubkey = profile?.pubkey ?? null;
            if (pubkey) {
                pass(`NIP-05 resolved to hex pubkey: ${pubkey}`);
            } else {
                fail(`NIP-05 lookup returned no pubkey for: ${id}`);
                // Fetch the nostr.json to show what names are available
                const [name, domain] = id.split('@');
                try {
                    const res = await fetch(`https://${domain}/.well-known/nostr.json`);
                    const json = await res.json() as { names?: Record<string, string> };
                    const available = Object.keys(json.names ?? {});
                    if (available.length) {
                        info(`Available names on ${domain}: ${available.join(', ')}`);
                        info(`Try setting author_id to one of those, e.g. "${available[0]}@${domain}"`);
                        const firstPubkey = json.names![available[0]];
                        info(`Or use the hex pubkey directly: ${firstPubkey}`);
                    }
                } catch { /* ignore */ }
            }
        } else {
            pubkey = id;
            pass(`Using author_id as hex pubkey: ${pubkey}`);
        }
    }

    if (!pubkey) {
        fail('Could not resolve pubkey. Check your config or private key.');
        process.exit(1);
    }

    // 3. Network
    sep('3. Network — IPv6 check');
    const hasIPv6 = await checkIPv6();
    info(`IPv6 connectivity: ${hasIPv6 ? 'yes' : 'no'}`);
    if (!hasIPv6) {
        useWebSocketImplementation(WebSocket as any);
        info('Forcing IPv4 WebSocket');
    } else {
        useWebSocketImplementation(WebSocket);
    }

    // 4. Relay connectivity
    sep('4. Relay connectivity (raw WebSocket ping)');
    const reachable: string[] = [];
    for (const relay of relays) {
        const { ok, ms, error } = await pingRelay(relay);
        if (ok) {
            pass(`${relay}  (${ms}ms)`);
            reachable.push(relay);
        } else {
            fail(`${relay}  — ${error}`);
        }
    }

    if (reachable.length === 0) {
        fail('No relays are reachable. Check your network or relay list.');
        process.exit(1);
    }

    // 5. Broad query — no author filter, small limit
    sep('5. Broad query (kind:30023, no author, limit:5)');
    const pool = new SimplePool();
    info(`Querying relays: ${reachable.join(', ')}`);

    const broadEvents = await rawQuerySync(pool, reachable, { kinds: [30023], limit: 5 });
    info(`Events received: ${broadEvents.length}`);
    if (broadEvents.length > 0) {
        pass('Relay is serving kind:30023 events');
        for (const ev of broadEvents) {
            const title = ev.tags?.find((t: string[]) => t[0] === 'title')?.[1] || '(no title)';
            info(`  id=${ev.id.slice(0, 16)}…  author=${ev.pubkey.slice(0, 16)}…  title="${title}"`);
        }
    } else {
        fail('No kind:30023 events found at all — relay may be empty or not indexing articles');
    }

    // 6. Author-filtered query — the actual sync filter
    sep(`6. Author-filtered query (kind:30023, authors=[${pubkey.slice(0, 16)}…])`);
    const since5y = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 3600;
    const authorFilter = { kinds: [30023], authors: [pubkey], since: since5y };
    info(`Filter: ${JSON.stringify(authorFilter)}`);

    const authorEvents = await rawQuerySync(pool, reachable, authorFilter);
    info(`Events received: ${authorEvents.length}`);
    if (authorEvents.length > 0) {
        pass(`Found ${authorEvents.length} article(s) for this pubkey`);
        for (const ev of authorEvents) {
            const title = ev.tags?.find((t: string[]) => t[0] === 'title')?.[1] || '(no title)';
            info(`  created_at=${new Date(ev.created_at * 1000).toISOString()}  title="${title}"`);
        }
    } else {
        fail(`No articles found for pubkey ${pubkey}`);
        info('Possible causes:');
        info('  • Wrong pubkey (check your config / private key)');
        info('  • Events are not indexed on these relays');
        info('  • The "since" filter is too recent (unlikely with 5y window)');
        info('  • Relay requires auth (NIP-42) to query this pubkey');
    }

    // 7. No-since variant — rule out timestamp issues
    if (authorEvents.length === 0) {
        sep('7. Author query without "since" filter (rule out timestamp issue)');
        const noSinceFilter = { kinds: [30023], authors: [pubkey] };
        const noSinceEvents = await rawQuerySync(pool, reachable, noSinceFilter);
        info(`Events received: ${noSinceEvents.length}`);
        if (noSinceEvents.length > 0) {
            fail('"since" filter was excluding events — check your system clock or the event timestamps');
            for (const ev of noSinceEvents) {
                info(`  created_at=${ev.created_at}  (${new Date(ev.created_at * 1000).toISOString()})`);
            }
        } else {
            info('Still 0 events without "since" — the issue is not the timestamp filter');
        }
    }

    pool.close(reachable);
    console.log('\n🏁  Debug complete.\n');
}

main().catch((err) => {
    console.error('\n💥  Unhandled error:', err);
    process.exit(1);
});
