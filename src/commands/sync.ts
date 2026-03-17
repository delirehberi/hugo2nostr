import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as nip19 from 'nostr-tools/nip19';
import matter from 'gray-matter';
import { Event } from 'nostr-tools/pure';
import { ConfigManager } from '../core/config.js';
import { getPool, closePool, listEvents } from '../lib/nostr.js';
import { parseFrontmatter, ISO2Date, Frontmatter } from '../lib/fs.js';

function buildFrontmatter(event: Event, nevent: string): string {
    const tags = event.tags || [];
    const title = tags.find((t) => t[0] === "title")?.[1] || "Untitled";
    const summary = tags.find((t) => t[0] === "summary")?.[1] || "";
    const image = tags.find((t) => t[0] === "image")?.[1];
    const publishedAt = tags.find((t) => t[0] === "published_at")?.[1];
    const slug = tags.find((t) => t[0] === "d")?.[1];
    const tagValues = tags.filter((t) => t[0] === "t").map((t) => t[1]);

    // Use published_at if available, otherwise fall back to created_at
    const timestamp = publishedAt
        ? parseInt(publishedAt, 10) * 1000
        : event.created_at * 1000;
    const hugoDate = ISO2Date(new Date(timestamp).toISOString());

    const frontmatter: Frontmatter = {
        title,
        date: hugoDate,
        ...(slug ? { slug } : {}),
        ...(image ? { hero_image: image } : {}),
        tags: tagValues,
        nostr_id: nevent,
    };

    if (summary) {
        frontmatter.description = summary;
    }

    return matter.stringify(event.content, frontmatter);
}

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}

export async function syncCommand(configManager: ConfigManager): Promise<number> {
    const config = configManager.config;
    // Resolve site to get relays and posts dir
    const siteConfig = configManager.resolveSiteConfig();
    const postsDir = siteConfig.posts_dir;
    const relays = siteConfig.relays || [];
    const siteConfigName = siteConfig.name; // resolved name

    // We need pubkey to fetch our posts. 
    // If we have private key, derive pubkey. 
    // If not, we might fail unless we allow author_id to be used (if it's a hex/npub)
    // The original code used `pubkey` exported from `init.js` which was derived from private key.
    // If no private key, sync might not work for "my posts" unless we support author_id.
    // Let's assume we need private key or author_id.

    let pubkey: string | null = null;
    const privateKey = configManager.getPrivateKey();

    if (privateKey) {
        const { getPublicKey } = await import('nostr-tools/pure');
        pubkey = getPublicKey(Uint8Array.from(Buffer.from(privateKey, 'hex')));
    } else if (siteConfig.author_id) {
        const id = siteConfig.author_id;
        if (id.startsWith('npub')) {
            try {
                const { data } = nip19.decode(id);
                pubkey = data as string;
            } catch { }
        } else if (id.includes('@')) {
            // NIP-05 identifier — resolve via HTTP
            try {
                const { queryProfile } = await import('nostr-tools/nip05');
                const profile = await queryProfile(id);
                pubkey = profile?.pubkey ?? null;
                if (!pubkey) console.error(`❌ NIP-05 lookup returned no pubkey for: ${id}`);
            } catch (e: any) {
                console.error(`❌ NIP-05 lookup failed for ${id}: ${e.message}`);
            }
        } else {
            pubkey = id; // Assume hex
        }
    }

    if (!pubkey) {
        console.error("❌ No public key found. Configure 'author_id' in config or set private key.");
        return 1;
    }

    console.log("🔄 Syncing from Nostr...");

    if (!postsDir || !fs.existsSync(postsDir)) {
        console.error(`❌ Posts directory not found: ${postsDir}`);
        return 1;
    }

    // Get all local nostr IDs
    const files = glob.sync(`${postsDir}/*.md`).filter(f => !f.endsWith('_index.md'));
    const localIds = new Map<string, string>(); // event_id -> file
    for (const file of files) {
        try {
            const raw = fs.readFileSync(file, "utf-8");
            const meta = parseFrontmatter(raw);
            if (meta.nostr_id) {
                try {
                    const decoded = nip19.decode(meta.nostr_id);
                    if (decoded.type === 'nevent') {
                        localIds.set(decoded.data.id, file);
                    } else if (decoded.type === 'note') {
                        localIds.set(decoded.data as string, file);
                    }
                } catch {
                    localIds.set(meta.nostr_id, file); // fallback: treat as raw id
                }
            }
        } catch (e) {
            // ignore
        }
    }

    const pool = await getPool(configManager.options.verbose);
    if (configManager.options.verbose) console.log(`📚 Found ${localIds.size} local posts`);

    const since = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60; // 5 years

    let events: Event[] = [];
    try {
        // Query one relay at a time or all? Original code used RELAYS[0] ??
        // "pool.querySync([RELAYS[0]]..." 
        // Let's try to fetch from all configured relays
        if (relays.length === 0) {
            console.error("❌ No relays configured.");
            return 1;
        }

        // We use querySync which is not available in SimplePool of new nostr-tools versions typically?
        // Wait, `nostr-tools/pool` SimplePool doesn't have querySync usually. 
        // The original code used `pool.querySync[RELAYS, ...]`.
        // Let's check `src/init.js` in original code. 
        // It imported `SimplePool` from `nostr-tools/pool`.
        // SimplePool has `querySync` in older versions or some forks? 
        // In v2.7 (package.json says ^2.7.0), `querySync` might not be standard.
        // It has `query` usually.
        // `querySync` in original code (line 18 of debug.js) implies it waits for EOSE.
        // We should use `query` or `subscribeMany` and wait.
        // Or `querySync` if it exists.
        // Let's assume standard `query` returns a promise resolving to events in some versions or we collect them.

        // Actually SimplePool.querySync is likely `list` (which waits for EOSE).
        // Let's use `list` which is the standard method to "get all events matching filter".

        if (configManager.options.verbose) console.log(`Querying relays: ${relays.join(', ')} for pubkey: ${pubkey}`);

        events = await listEvents(pool, relays, [{
            kinds: [30023],
            authors: [pubkey],
            since
        }]);

        if (configManager.options.verbose) console.log(`Received ${events.length} events from relays.`);

        events.sort((a, b) => b.created_at - a.created_at);

    } catch (err: any) {
        console.error(`❌ Failed to fetch from relays: ${err.message}`);
        await closePool(relays);
        return 2;
    }

    if (events.length === 0) {
        console.warn("⚠️  No new events found on relays. Your local posts are up-to-date.");
    }

    console.log(`🌐 Found ${events.length} events on relays`);

    const stats = { synced: 0, skipped: 0 };

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const title = ev.tags.find((t) => t[0] === "title")?.[1] || "Untitled";
        const progress = `[${i + 1}/${events.length}]`;

        const nevent = nip19.neventEncode({
            id: ev.id,
            relays: relays,
            kind: ev.kind,
        });

        if (localIds.has(ev.id)) {
            if (configManager.options.verbose) console.log(`${progress} ⏭️  Already exists: "${title}"`);
            stats.skipped++;
            continue;
        }

        const fm = buildFrontmatter(ev, nevent);
        const slug =
            ev.tags.find((t) => t[0] === "d")?.[1] ||
            slugify(title) ||
            `nostr-${ev.id.slice(0, 8)}`;

        const file = path.join(postsDir, `${slug}.md`);
        fs.writeFileSync(file, fm, "utf-8");

        stats.synced++;
        console.log(`${progress} ✅ "${title}"`);
    }

    await closePool(relays);

    console.log(`\n🎉 Done: ${stats.synced} synced, ${stats.skipped} already existed`);
    return 0;
}
