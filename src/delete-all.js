import fs from "fs";
import { glob } from "glob";
import * as nip19 from 'nostr-tools/nip19';
import { deleteNote, parseFrontmatter, updateFrontmatter, sleep, confirm, log, logVerbose, logError } from "./utils.js";
import * as config from "./init.js";

export async function delete_all() {
    config.init();
    const { POSTS_DIR, options } = config;
    
    const files = glob.sync(`${POSTS_DIR}/*.md`).filter(f => !f.endsWith('_index.md'));
    const posts = [];
    
    for (const file of files) {
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        if (meta.nostr_id && meta.nostr_id.startsWith("nevent1")) {
            posts.push({ 
                id: meta.nostr_id, 
                title: meta.title || "Untitled",
                file
            });
        }
    }
    
    if (posts.length === 0) {
        log("📚 No published posts found");
        return 0;
    }
    
    log(`📚 Found ${posts.length} published posts`);
    
    // Confirmation (this is destructive!)
    const confirmed = await confirm(`⚠️  Delete ALL ${posts.length} posts from Nostr? This cannot be undone.`);
    if (!confirmed) {
        log("❌ Cancelled");
        return 0;
    }
    
    const stats = { deleted: 0, failed: 0 };
    
    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const progress = `[${i + 1}/${posts.length}]`;
        
        try {
            const { type, data } = nip19.decode(post.id);
            if (type !== "nevent") {
                logError(`${progress} ❌ Invalid nostr_id for "${post.title}"`);
                stats.failed++;
                continue;
            }
            
            log(`${progress} 🗑️  "${post.title}"`);
            const relays = await deleteNote(data.id);
            
            if (relays.length > 0) {
                stats.deleted++;
                updateFrontmatter(post.file, { nostr_id: "" });
            } else {
                stats.failed++;
            }
            
            if (i < posts.length - 1 && options.delay > 0) {
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
