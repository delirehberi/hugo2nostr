import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as nip19 from 'nostr-tools/nip19';
import matter from 'gray-matter';
import { Event } from 'nostr-tools/pure';
import { ConfigManager } from '../core/config.js';
import { getPool, closePool, listEvents } from '../lib/nostr.js';
import {
    parseFrontmatter,
    updateFrontmatter,
    ISO2Date,
    slugify,
    isHexOrId,
    Frontmatter
} from '../lib/fs.js';

interface LocalPostInfo {
    file: string;
    meta: Frontmatter;
    slug: string;
    title: string;
    eventId?: string;
}

function extractSlugFromUrl(urlStr: string): string | null {
    try {
        const u = new URL(urlStr);
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
            const lastPart = parts[parts.length - 1].replace(/\.html?$/, '');
            return slugify(lastPart);
        }
    } catch {
        const parts = urlStr.split('/').filter(Boolean);
        if (parts.length > 0) {
            const lastPart = parts[parts.length - 1].replace(/\.html?$/, '');
            return slugify(lastPart);
        }
    }
    return null;
}

export function deriveEventSlug(ev: Event, title: string, dTag?: string, rTag?: string): string {
    // 1. If canonical URL exists in 'r' tag, try to extract slug
    if (rTag) {
        const urlSlug = extractSlugFromUrl(rTag);
        if (urlSlug) return urlSlug;
    }

    // 2. If 'd' tag exists and is a readable slug (not a random hex/uuid/id)
    if (dTag && !isHexOrId(dTag)) {
        const dSlug = slugify(dTag);
        if (dSlug) return dSlug;
    }

    // 3. Derive from title
    if (title && title !== 'Untitled') {
        const titleSlug = slugify(title);
        if (titleSlug) return titleSlug;
    }

    // 4. Fallback to dTag if present
    if (dTag) {
        const dSlug = slugify(dTag);
        if (dSlug) return dSlug;
    }

    // 5. Ultimate fallback
    return `nostr-${ev.id.slice(0, 8)}`;
}

function buildFrontmatter(event: Event, nevent: string, targetSlug: string): string {
    const tags = event.tags || [];
    const title = tags.find((t) => t[0] === "title")?.[1] || "Untitled";
    const summary = tags.find((t) => t[0] === "summary")?.[1] || "";
    const image = tags.find((t) => t[0] === "image")?.[1];
    const publishedAt = tags.find((t) => t[0] === "published_at")?.[1];
    const tagValues = tags.filter((t) => t[0] === "t").map((t) => t[1]);

    // Use published_at if available, otherwise fall back to created_at
    const timestamp = publishedAt
        ? parseInt(publishedAt, 10) * 1000
        : event.created_at * 1000;
    const hugoDate = ISO2Date(new Date(timestamp).toISOString());

    const frontmatter: Frontmatter = {
        title,
        date: hugoDate,
        slug: targetSlug,
        ...(image ? { hero_image: image } : {}),
        tags: tagValues,
        nostr_id: nevent,
    };

    if (summary) {
        frontmatter.description = summary;
    }

    return matter.stringify(event.content, frontmatter);
}

export async function syncCommand(configManager: ConfigManager): Promise<number> {
    const config = configManager.config;
    // Resolve site to get relays and posts dir
    const siteConfig = configManager.resolveSiteConfig();
    const postsDir = siteConfig.posts_dir;
    const relays = siteConfig.relays || [];

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

    // Build multi-index map of existing local posts
    const files = glob.sync(`${postsDir}/*.md`).filter(f => !f.endsWith('_index.md'));
    const localByEventId = new Map<string, LocalPostInfo>();
    const localBySlug = new Map<string, LocalPostInfo>();
    const localByTitle = new Map<string, LocalPostInfo>();

    for (const file of files) {
        try {
            const raw = fs.readFileSync(file, "utf-8");
            const meta = parseFrontmatter(raw);
            const filename = path.basename(file, '.md');
            const metaSlug = meta.slug ? slugify(meta.slug) : '';
            const fileSlug = slugify(filename);
            const effectiveSlug = metaSlug || fileSlug;
            const title = meta.title ? meta.title.trim() : '';
            const normalizedTitle = slugify(title);

            let eventId: string | undefined;
            if (meta.nostr_id) {
                try {
                    const decoded = nip19.decode(meta.nostr_id);
                    if (decoded.type === 'nevent') {
                        eventId = decoded.data.id;
                    } else if (decoded.type === 'note') {
                        eventId = decoded.data as string;
                    }
                } catch {
                    eventId = meta.nostr_id;
                }
            }

            const postInfo: LocalPostInfo = {
                file,
                meta,
                slug: effectiveSlug,
                title,
                eventId
            };

            if (eventId) {
                localByEventId.set(eventId, postInfo);
            }
            if (effectiveSlug) {
                localBySlug.set(effectiveSlug, postInfo);
            }
            if (fileSlug) {
                localBySlug.set(fileSlug, postInfo);
            }
            if (metaSlug) {
                localBySlug.set(metaSlug, postInfo);
            }
            if (normalizedTitle) {
                localByTitle.set(normalizedTitle, postInfo);
            }
        } catch {
            // Ignore parse errors on individual files
        }
    }

    const pool = await getPool(configManager.options.verbose);
    if (configManager.options.verbose) console.log(`📚 Found ${files.length} local posts`);

    const since = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60; // 5 years

    let events: Event[] = [];
    try {
        if (relays.length === 0) {
            console.error("❌ No relays configured.");
            return 1;
        }

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
        const dTag = ev.tags.find((t) => t[0] === "d")?.[1];
        const rTag = ev.tags.find((t) => t[0] === "r")?.[1];
        const progress = `[${i + 1}/${events.length}]`;

        const targetSlug = deriveEventSlug(ev, title, dTag, rTag);
        const normTitle = slugify(title);
        const dSlug = dTag ? slugify(dTag) : '';

        const nevent = nip19.neventEncode({
            id: ev.id,
            relays: relays,
            kind: ev.kind,
        });

        // Check if matching local post exists
        let existing: LocalPostInfo | undefined;

        // 1. Direct event ID match
        if (localByEventId.has(ev.id)) {
            existing = localByEventId.get(ev.id);
        }
        // 2. Slug match (targetSlug or dTag slug)
        if (!existing && targetSlug && localBySlug.has(targetSlug)) {
            existing = localBySlug.get(targetSlug);
        }
        if (!existing && dSlug && localBySlug.has(dSlug)) {
            existing = localBySlug.get(dSlug);
        }
        // 3. Canonical URL path match
        if (!existing && rTag) {
            const urlSlug = extractSlugFromUrl(rTag);
            if (urlSlug && localBySlug.has(urlSlug)) {
                existing = localBySlug.get(urlSlug);
            }
        }
        // 4. Normalized title match
        if (!existing && normTitle && localByTitle.has(normTitle)) {
            existing = localByTitle.get(normTitle);
        }

        if (existing) {
            // Update nostr_id in frontmatter if missing or outdated
            if (existing.meta.nostr_id !== nevent) {
                try {
                    updateFrontmatter(existing.file, { nostr_id: nevent });
                    existing.meta.nostr_id = nevent;
                    existing.eventId = ev.id;
                    localByEventId.set(ev.id, existing);
                } catch (e: any) {
                    if (configManager.options.verbose) {
                        console.warn(`  ⚠️ Could not update nostr_id for ${existing.file}: ${e.message}`);
                    }
                }
            }

            if (configManager.options.verbose) console.log(`${progress} ⏭️  Already exists: "${title}"`);
            stats.skipped++;
            continue;
        }

        // Truly new post — write to disk
        const fm = buildFrontmatter(ev, nevent, targetSlug);
        const file = path.join(postsDir, `${targetSlug}.md`);
        fs.writeFileSync(file, fm, "utf-8");

        // Register in local maps to avoid duplicates within the same sync run
        const newPostInfo: LocalPostInfo = {
            file,
            meta: { title, slug: targetSlug, nostr_id: nevent },
            slug: targetSlug,
            title,
            eventId: ev.id
        };
        localByEventId.set(ev.id, newPostInfo);
        localBySlug.set(targetSlug, newPostInfo);
        if (normTitle) localByTitle.set(normTitle, newPostInfo);

        stats.synced++;
        console.log(`${progress} ✅ "${title}"`);
    }

    await closePool(relays);

    console.log(`\n🎉 Done: ${stats.synced} synced, ${stats.skipped} already existed`);
    return 0;
}

