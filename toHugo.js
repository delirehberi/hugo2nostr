import fs from "fs";
import matter from "gray-matter";
import toml from "toml";
import { glob } from "glob";
import * as nostr from "nostr-tools";
import { bytesToHex} from '@noble/hashes/utils' // already an installed dependency
import * as nip19 from "nostr-tools/nip19";
import { SimplePool } from "nostr-tools/pool";
import { useWebSocketImplementation } from "nostr-tools/pool";
import WebSocket from "ws";
import {getPublicKey} from "nostr-tools/pure";

useWebSocketImplementation(WebSocket);

// CONFIG
const POSTS_DIR = process.env.POSTS_DIR || "./posts";
const RELAYS = process.env.RELAY_LIST.split(",");
const NOSTR_PRIVATE_KEY = process.env.NOSTR_PRIVATE_KEY; 
let { type, data } = nip19.decode(NOSTR_PRIVATE_KEY);
const AUTHOR_PRIVATE_KEY = bytesToHex(data);
const pubkey = getPublicKey(AUTHOR_PRIVATE_KEY);
console.log("Using relays:", RELAYS);

// --- helpers ---
function parseFrontmatter(content) {
    if (content.startsWith("---")) {
        const parsed = matter(content);
        return { ...parsed.data, body: parsed.content };
    } else if (content.startsWith("+++")) {
        const fm = content.substring(3, content.indexOf("+++", 3));
        const body = content.substring(content.indexOf("+++", 3) + 3).trim();
        const data = toml.parse(fm);
        return { ...data, body };
    } else {
        return { title: "Untitled", body: content };
    }
}

function getAllLocalNostrIds() {
    const files = glob.sync(`${POSTS_DIR}/*.md`);
    const ids = new Map();

    for (const file of files) {
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        if (meta.nostr_id) {
            ids.set(meta.nostr_id, file);
        }
    }
    return ids;
}

function ISO2Date(isoString) {
    const date = new Date(isoString);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    const offset = -date.getTimezoneOffset(); // in minutes
    const sign = offset >= 0 ? "+" : "-";
    const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
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

function savePost(event) {
    const nevent = nip19.neventEncode({
        id: event.id,
        relays: RELAYS,
        kind: event.kind,
    });

    const fm = buildFrontmatter(event, nevent);

    const slug =
        event.tags.find((t) => t[0] === "d")?.[1] ||
        `nostr-${event.id.slice(0, 8)}`;

    const file = `${POSTS_DIR}/${slug}.md`;
    fs.writeFileSync(file, fm, "utf-8");
    console.log(`✅ Saved new post: ${file}`);
}

async function sync() {
    console.log("🔄 Starting sync from Nostr…");

    const pool = new SimplePool();
    pool.trackRelays = true;

    const localIds = getAllLocalNostrIds();
    console.log(`📚 Found ${localIds.size} local nostr_ids`);

    const since = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60; // last 5 years
    const events = await pool.querySync(RELAYS, { kinds: [30023] , authors: [pubkey], since})

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

sync();

