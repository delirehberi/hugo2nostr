import fs from "fs";
import { glob } from "glob";
import * as nip19 from "nostr-tools/nip19";
import { stringifyFrontmatter, parseFrontmatter, log, logVerbose, logError } from "./utils.js";
import * as config from "./init.js";

export async function update_nevents() {
    config.init();
    const { RELAYS, POSTS_DIR } = config;
    
    logVerbose(`🔄 Rewriting nevents in ${POSTS_DIR}`);
    const files = glob.sync(`${POSTS_DIR}/*.md`).filter(f => !f.endsWith('_index.md'));
    
    const stats = { updated: 0, skipped: 0, failed: 0 };
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        const title = meta.title || file.replace(/^.*[\\\/]/, '');
        const progress = `[${i + 1}/${files.length}]`;
        
        if (!meta.nostr_id) {
            logVerbose(`${progress} ⏭️  No nostr_id: "${title}"`);
            stats.skipped++;
            continue;
        }
        
        try {
            const decoded = nip19.decode(meta.nostr_id);
            if (decoded.type !== "nevent") {
                logVerbose(`${progress} ⏭️  Not an nevent: "${title}"`);
                stats.skipped++;
                continue;
            }
            
            const newNevent = nip19.neventEncode({
                id: decoded.data.id,
                relays: RELAYS,
                kind: decoded.data.kind || 30023,
            });
            
            if (meta.nostr_id === newNevent) {
                logVerbose(`${progress} ↔️  Up to date: "${title}"`);
                stats.skipped++;
                continue;
            }
            
            meta.nostr_id = newNevent;
            const updated = stringifyFrontmatter(meta, meta.body, meta.type);
            fs.writeFileSync(file, updated, "utf-8");
            
            stats.updated++;
            log(`${progress} ✅ "${title}"`);
        } catch (err) {
            stats.failed++;
            logError(`${progress} ❌ "${title}": ${err.message}`);
        }
    }
    
    console.log(`\n🎉 Done: ${stats.updated} updated, ${stats.skipped} skipped, ${stats.failed} failed`);
    
    if (stats.failed > 0) return 1;
    return 0;
}

