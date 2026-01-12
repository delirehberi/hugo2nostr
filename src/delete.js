import fs from "fs";
import { glob } from "glob";
import * as nip19 from "nostr-tools/nip19";
import { deleteNote, removeFile, parseFrontmatter, sleep, confirm, log, logVerbose, logError } from "./utils.js";
import * as config from "./init.js";

export async function delete_marked() {
    config.init();
    const { POSTS_DIR, options } = config;
    
    const files = glob.sync(`${POSTS_DIR}/*.md`).filter(f => !f.endsWith('_index.md'));
    
    // Find posts marked for deletion
    const toDelete = [];
    for (const file of files) {
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        if (meta.delete === true && meta.nostr_id) {
            toDelete.push({ file, meta });
        }
    }
    
    if (toDelete.length === 0) {
        log("📚 No posts marked for deletion");
        return 0;
    }
    
    log(`📚 Found ${toDelete.length} posts marked for deletion`);
    
    // Confirmation
    const confirmed = await confirm(`Delete ${toDelete.length} posts from Nostr?`);
    if (!confirmed) {
        log("❌ Cancelled");
        return 0;
    }
    
    const stats = { deleted: 0, failed: 0 };
    
    for (let i = 0; i < toDelete.length; i++) {
        const { file, meta } = toDelete[i];
        const title = meta.title || "Untitled";
        const progress = `[${i + 1}/${toDelete.length}]`;
        
        try {
            const { type, data } = nip19.decode(meta.nostr_id);
            if (type !== "nevent") {
                logError(`${progress} ❌ Invalid nostr_id for "${title}"`);
                stats.failed++;
                continue;
            }
            
            const filename = file.replace(/^.*[\\\/]/, '').replace(/\.md$/, '');
            const slug = meta.slug || filename;
            log(`${progress} 🗑️  "${title}"`);
            const relays = await deleteNote(data.id, slug);
            
            if (relays.length > 0) {
                stats.deleted++;
                removeFile(file);
            } else {
                stats.failed++;
            }
            
            if (i < toDelete.length - 1 && options.delay > 0) {
                await sleep(options.delay);
            }
        } catch (e) {
            stats.failed++;
            logError(`${progress} ❌ Failed: ${e.message}`);
        }
    }
    
    await config.closePool();
    
    console.log(`\n🎉 Done: ${stats.deleted} deleted, ${stats.failed} failed`);
    
    if (stats.failed > 0 && stats.deleted === 0) return 2;
    if (stats.failed > 0) return 1;
    return 0;
}
