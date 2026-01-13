import fs from "fs";
import matter from "gray-matter";
import { glob } from "glob";
import * as nip19 from "nostr-tools/nip19";
import { parseFrontmatter, ISO2Date, log, logVerbose, logError } from "./utils.js";
import * as config from "./init.js";

function buildFrontmatter(event, nevent) {
    const tags = event.tags || [];
    const title = tags.find((t) => t[0] === "title")?.[1] || "Untitled";
    const description = tags.find((t) => t[0] === "summary")?.[1] || "";
    const image = tags.find((t) => t[0] === "image")?.[1];
    const publishedAt = tags.find((t) => t[0] === "published_at")?.[1];
    const slug = tags.find((t) => t[0] === "d")?.[1];
    const tagValues = tags.filter((t) => t[0] === "t").map((t) => t[1]);
    
    // Use published_at if available, otherwise fall back to created_at
    const timestamp = publishedAt 
        ? parseInt(publishedAt, 10) * 1000 
        : event.created_at * 1000;
    const hugoDate = ISO2Date(new Date(timestamp).toISOString());

    const frontmatter = {
        title,
        description,
        date: hugoDate,
        ...(slug ? { slug } : {}),
        ...(image ? { hero_image: image } : {}),
        tags: tagValues,
        nostr_id: nevent,
    };

    return matter.stringify(event.content, frontmatter);
}

function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}

export async function sync() {
    config.init();
    const { RELAYS, POSTS_DIR, pubkey } = config;
    
    log("🔄 Syncing from Nostr...");
    
    // Get all local nostr IDs
    const files = glob.sync(`${POSTS_DIR}/*.md`).filter(f => !f.endsWith('_index.md'));
    const localIds = new Map();
    for (const file of files) {
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        if (meta.nostr_id) {
            localIds.set(meta.nostr_id, file);
        }
    }
    
    const pool = config.getPool();
    logVerbose(`📚 Found ${localIds.size} local posts`);

    const since = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60;
    
    let events;
    try {
        events = await pool.querySync(RELAYS, { kinds: [30023], authors: [pubkey], since });
    } catch (err) {
        logError(`❌ Failed to fetch from relays: ${err.message}`);
        await config.closePool();
        return 2;
    }
    
    log(`🌐 Found ${events.length} events on relays`);
    
    const stats = { synced: 0, skipped: 0 };
    
    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const title = ev.tags.find((t) => t[0] === "title")?.[1] || "Untitled";
        const progress = `[${i + 1}/${events.length}]`;
        
        const nevent = nip19.neventEncode({
            id: ev.id,
            relays: RELAYS,
            kind: ev.kind,
        });

        if (localIds.has(nevent)) {
            logVerbose(`${progress} ⏭️  Already exists: "${title}"`);
            stats.skipped++;
            continue;
        }

        const fm = buildFrontmatter(ev, nevent);
        const slug =
            ev.tags.find((t) => t[0] === "d")?.[1] ||
            slugify(title) ||
            `nostr-${ev.id.slice(0, 8)}`;

        const file = `${POSTS_DIR}/${slug}.md`;
        fs.writeFileSync(file, fm, "utf-8");
        
        stats.synced++;
        log(`${progress} ✅ "${title}"`);
    }

    await config.closePool();
    
    console.log(`\n🎉 Done: ${stats.synced} synced, ${stats.skipped} already existed`);
    return 0;
}
