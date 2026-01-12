import fs from "fs";
import { log, logError } from "./utils.js";
import * as config from "./init.js";

const PUBLISHED_FILE = "published.json";

export async function debug() {
    config.init();
    const { RELAYS, pubkey } = config;
    
    log("🔍 Fetching articles from Nostr...");
    
    const pool = config.getPool();
    const since = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60;
    
    let events;
    try {
        events = await pool.querySync(RELAYS, { kinds: [30023], authors: [pubkey], since });
    } catch (err) {
        logError(`❌ Failed to fetch: ${err.message}`);
        await config.closePool();
        return 2;
    }
    
    if (events.length === 0) {
        log("📚 No articles found");
        await config.closePool();
        return 0;
    }
    
    const simplified = events.map(ev => {
        const titleTag = ev.tags.find(t => t[0] === "title");
        return {
            id: ev.id,
            title: titleTag?.[1] || ev.content?.slice(0, 50) || "Untitled",
        };
    });
    
    // Display
    log(`📚 Found ${events.length} articles:\n`);
    for (const ev of simplified) {
        console.log(`  • ${ev.title}`);
        console.log(`    ${ev.id}\n`);
    }
    
    // Save to file
    fs.writeFileSync(PUBLISHED_FILE, JSON.stringify({ posts: simplified }, null, 2));
    log(`💾 Saved to ${PUBLISHED_FILE}`);
    
    await config.closePool();
    return 0;
}
