import fs from "fs";
import matter from "gray-matter";
import toml from "toml";
import { glob } from "glob";
import * as nostr from "nostr-tools";
import { bytesToHex } from '@noble/hashes/utils' // already an installed dependency
import * as nip19 from "nostr-tools/nip19";
import { SimplePool } from "nostr-tools/pool";
import { useWebSocketImplementation } from "nostr-tools/pool";
import WebSocket from "ws";
import { getPublicKey } from "nostr-tools/pure";
import { parseFrontmatter, publishToNostr, ISO2Date, normalizeTags, normalizeDate, getSummary } from "./utils.js";
import { RELAYS, POSTS_DIR, NOSTR_PRIVATE_KEY, AUTHOR_PRIVATE_KEY, DRY_RUN, pubkey, init } from "./init.js";

init();


function getAllLocalNostrIds() {
    const files = glob.sync(`${POSTS_DIR}/*.md`);
    const ids = new Map();

    for (const file of files) {
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        delete meta.body;
        delete meta.type;

        if (meta.nostr_id) {
            ids.set(meta.nostr_id, file);
        }
    }
    return ids;
}


function buildFrontmatter(event, nevent) {
    const tags = event.tags || [];
    const title = tags.find((t) => t[0] === "title")?.[1] || "Untitled";
    const description = tags.find((t) => t[0] === "summary")?.[1] || "";
    const date = new Date(event.created_at * 1000).toISOString();
    const hugoDate = ISO2Date(date);
    const tagValues = tags.filter((t) => t[0] === "t").map((t) => t[1]);

    const data = {
        title,
        description,
        date: hugoDate,
        tags: tagValues,
        nostr_id: nevent,
    };

    return matter.stringify(event.content, data);
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

function savePost(event) {
    const nevent = nip19.neventEncode({
        id: event.id,
        relays: RELAYS,
        kind: event.kind,
    });

    const fm = buildFrontmatter(event, nevent);

    const title = event.tags.find((t) => t[0] === "title")?.[1];
    const slug =
        event.tags.find((t) => t[0] === "d")?.[1] ||
        (title && slugify(title)) ||
        `nostr-${event.id.slice(0, 8)}`;

    const file = `${POSTS_DIR}/${slug}.md`;
    fs.writeFileSync(file, fm, "utf-8");
    console.log(`✅ Saved new post: ${file}`);
}

export async function sync() {
    console.log("🔄 Starting sync from Nostr…");

    const pool = new SimplePool();
    pool.trackRelays = true;

    const localIds = getAllLocalNostrIds();
    console.log(`📚 Found ${localIds.size} local nostr_ids`);

    const since = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60; // last 5 years
    const events = await pool.querySync(RELAYS, { kinds: [30023], authors: [pubkey], since })

    console.log(`🌐 Fetched ${events.length} events from relays`);


    for (const ev of events) {
        let seenon = pool.seenOn.get(ev.id);//Set<AbstractRelay>
        let relays = [];
        for (const r of seenon.values()) {
            relays.push(r.url);
            console.log(`✅ Event seen on relay: ${r.url}`);
        }
        const nevent = nip19.neventEncode({
            id: ev.id,
            relays: RELAYS,
            kind: ev.kind,
        });

        if (localIds.has(nevent)) {
            console.log(`↔️ Already exists, skipping: ${nevent}`);
            continue;
        }

        savePost(ev);
    }

    console.log("✅ Sync finished");
}


