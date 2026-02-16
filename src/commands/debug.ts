import { ConfigManager } from '../core/config.js';
import { getPool, closePool, listEvents } from '../lib/nostr.js';
import * as nip19 from 'nostr-tools/nip19';

export async function debugCommand(configManager: ConfigManager): Promise<number> {
    const config = configManager.config;
    const siteConfig = configManager.resolveSiteConfig();
    const relays = siteConfig.relays || [];

    // Determine pubkey
    let pubkey: string | null = null;
    const privateKey = configManager.getPrivateKey();

    if (privateKey) {
        const { getPublicKey } = await import('nostr-tools/pure');
        pubkey = getPublicKey(Uint8Array.from(Buffer.from(privateKey, 'hex')));
    } else if (siteConfig.author_id) {
        if (siteConfig.author_id.startsWith('npub')) {
            try {
                const { data } = nip19.decode(siteConfig.author_id);
                pubkey = data as string;
            } catch { }
        } else {
            pubkey = siteConfig.author_id;
        }
    }

    if (!pubkey) {
        console.error("❌ No public key found (configure private key or author_id).");
        return 1;
    }

    console.log(`\n🔍 Debug: Fetching recent posts for ${pubkey}\n`);
    console.log(`Relays: ${relays.join(', ')}`);

    const pool = await getPool(true);

    try {
        const events = await listEvents(pool, relays, [{
            kinds: [30023],
            authors: [pubkey],
            limit: 10
        }]);

        console.log(`\nFound ${events.length} events:\n`);

        events.sort((a, b) => b.created_at - a.created_at);

        events.forEach(ev => {
            const title = ev.tags.find((t) => t[0] === "title")?.[1] || "Untitled";
            const d = ev.tags.find((t) => t[0] === "d")?.[1];
            const date = new Date(ev.created_at * 1000).toISOString();
            console.log(`- ${date} | ${title} (d: ${d})`);
            console.log(`  ID: ${ev.id}`);
            try {
                const nevent = nip19.neventEncode({ id: ev.id, relays, kind: 30023 });
                console.log(`  NIP-19: ${nevent}`);
            } catch { }
            console.log('');
        });

    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }

    await closePool(relays);
    return 0;
}
