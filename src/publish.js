import fs from "fs";
import path from "path";
import { glob } from "glob";
import { finalizeEvent } from "nostr-tools/pure";
import * as nip19 from 'nostr-tools/nip19';
import { 
    publishToNostr, 
    ISO2Date, 
    normalizeTags, 
    normalizeDate, 
    getSummary, 
    parseFrontmatter, 
    updateFrontmatter, 
    sleep, 
    log, 
    logVerbose, 
    logError,
    resolveUrl,
    resolveContentUrls,
    convertFootnotes,
    uploadImage,
} from "./utils.js";
import * as config from "./init.js";
import { processShortcodes } from "./shortcodes.js";

export async function publish() {
    // Initialize for selected site
    config.init();
    
    const { POSTS_DIR, HUGO_ROOT, BLOG_URL, AUTHOR_ID, AUTHOR_PRIVATE_KEY, DRY_RUN, IMAGE_HOST, SITE_NAME } = config;
    
    logVerbose(`Site: ${SITE_NAME || 'default'}`);
    logVerbose(`Searching files in ${POSTS_DIR}`);
    logVerbose(`Hugo root: ${HUGO_ROOT || 'not found'}`);
    logVerbose(`Blog URL: ${BLOG_URL || 'not set'}`);
    
    const { RELAYS, options } = config;
    
    const files = glob.sync(`${POSTS_DIR}/*.md`).filter(f => !f.endsWith('_index.md'));
    
    // Stats tracking
    const stats = { total: files.length, published: 0, skipped: 0, drafts: 0, failed: 0 };
    
    log(`📚 Found ${files.length} posts`);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        const title = meta.title || "Untitled";
        const progress = `[${i + 1}/${files.length}]`;

        // Skip drafts
        if (meta.draft === true) {
            stats.drafts++;
            log(`${progress} ⏭️  Skipping draft: "${title}"`);
            continue;
        }

        // Skip already published (unless dry-run)
        const alreadyPublished = meta.nostr_id && meta.nostr_id.startsWith("nevent1");
        if (alreadyPublished && !DRY_RUN) {
            stats.skipped++;
            log(`${progress} ⏭️  Already published: "${title}"`);
            continue;
        }

        // Extract metadata with expanded frontmatter support
        const filename = file.replace(/^.*[\\\/]/, '').replace(/\.md$/, '');
        const slug = meta.slug || filename;
        
        // Image handling: check for cached nostr_image, otherwise upload
        let imageUrl = meta.nostr_image || null;
        const heroImage = meta.hero_image || meta.image || meta.featured_image;
        
        if (!imageUrl && heroImage && HUGO_ROOT) {
            // Find local image file
            const imagePath = path.join(HUGO_ROOT, 'assets', heroImage);
            if (fs.existsSync(imagePath)) {
                if (DRY_RUN) {
                    logVerbose(`  Would upload: ${imagePath}`);
                    imageUrl = `https://${IMAGE_HOST}/[would-be-uploaded]/${path.basename(imagePath)}`;
                } else {
                    imageUrl = await uploadImage(imagePath);
                    if (imageUrl) {
                        // Cache the URL in frontmatter for future runs
                        updateFrontmatter(file, { nostr_image: imageUrl });
                    }
                }
            } else {
                logVerbose(`  Image not found: ${imagePath}`);
            }
        }
        
        // Merge tags and topics, dedupe
        const allTags = [
            ...normalizeTags(meta.tags),
            ...normalizeTags(meta.topics),
        ].filter((v, i, a) => a.indexOf(v) === i);
        
        // Summary preference: summary > description > auto-generated
        const summary = meta.summary || meta.description || "";

        // Process content
        let content = meta.body || "";
        
        // 1. Strip Hugo markers
        content = content.replace(/<!--more-->/g, "").trim();
        
        // 2. Process shortcodes
        log(`${progress} Processing "${title}"...`);
        const shortcodeResult = await processShortcodes(content, HUGO_ROOT, BLOG_URL);
        if (!shortcodeResult.ok) {
            stats.failed++;
            log(`${progress} ❌ Skipped due to shortcode error`);
            continue;
        }
        content = shortcodeResult.content;
        
        // 3. Resolve relative URLs
        content = resolveContentUrls(content, BLOG_URL);
        
        // 4. Convert footnotes to superscript format
        content = convertFootnotes(content);
        
        // Get auto-summary from processed content if not set
        const finalSummary = summary || getSummary(content);

        // Timestamps
        const now = Math.floor(Date.now() / 1000);
        const publishedAt = Math.floor(new Date(normalizeDate(meta.date)).getTime() / 1000);

        // Build canonical URL
        const canonicalUrl = BLOG_URL ? `${BLOG_URL.replace(/\/$/, '')}/${slug}/` : null;

        // Build tags array (NIP-23 compliant)
        const tagsArray = [
            ["d", slug],
            ["title", title],
        ];
        
        if (AUTHOR_ID) {
            tagsArray.push(["author", AUTHOR_ID]);
        }
        
        if (canonicalUrl) {
            tagsArray.push(["r", canonicalUrl]);
        }
        
        if (imageUrl) {
            tagsArray.push(["image", imageUrl]);
        }
        
        if (finalSummary) {
            tagsArray.push(["summary", finalSummary]);
        }
        
        tagsArray.push(["published_at", String(publishedAt)]);
        
        // Add updated_at only for re-publishing
        if (alreadyPublished) {
            tagsArray.push(["updated_at", String(now)]);
        }
        
        // Add all topic/tag entries
        for (const tag of allTags) {
            tagsArray.push(["t", tag]);
        }

        const nostrEvent = {
            kind: 30023,
            created_at: now,
            tags: tagsArray,
            content,
        };
        const signedEvent = finalizeEvent(nostrEvent, AUTHOR_PRIVATE_KEY);

        if (DRY_RUN) {
            stats.published++;
            log(`${progress} 📝 "${title}"`);
            logVerbose(JSON.stringify(signedEvent, null, 2));
        } else {
            log(`${progress} 🚀 "${title}"`);
            try {
                const relays = await publishToNostr(signedEvent);
                if (relays.length > 0) {
                    stats.published++;
                    updateFrontmatter(file, {
                        nostr_id: nip19.neventEncode({ id: signedEvent.id, relays: RELAYS, kind: 30023 }),
                    });
                } else {
                    stats.failed++;
                }
                
                // Delay between publishes (skip on last item)
                if (i < files.length - 1 && options.delay > 0) {
                    await sleep(options.delay);
                }
            } catch (err) {
                stats.failed++;
                logError(`  ❌ Failed: ${err.message}`);
            }
        }
    }

    await config.closePool();

    // Summary
    const mode = DRY_RUN ? " (dry-run)" : "";
    console.log(`\n🎉 Done${mode}: ${stats.published} published, ${stats.skipped} skipped, ${stats.drafts} drafts, ${stats.failed} failed`);

    // Exit codes: 0 = success, 1 = partial failure, 2 = complete failure
    if (stats.failed > 0 && stats.published === 0) return 2;
    if (stats.failed > 0) return 1;
    return 0;
}
