import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { finalizeEvent, Event, UnsignedEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { ConfigManager } from '../core/config.js';
import { publishToNostr, closePool } from '../lib/nostr.js';
import {
    parseFrontmatter,
    updateFrontmatter,
    normalizeTags,
    normalizeDate
} from '../lib/fs.js';
import {
    processShortcodes,
    resolveContentUrls,
    convertFootnotes,
    convertSmartPunctuation,
    getSummary
} from '../lib/markdown.js';
import { uploadImage } from '../lib/media.js';

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function publishCommand(configManager: ConfigManager): Promise<number> {
    const config = configManager.config;
    const options = configManager.options;

    // Resolve site config
    const siteConfig = configManager.resolveSiteConfig();
    const siteName = siteConfig.name;
    const postsDir = siteConfig.posts_dir;
    const blogUrl = siteConfig.blog_url || '';
    const authorId = siteConfig.author_id || '';
    const relays = siteConfig.relays || [];
    const imageHost = siteConfig.image_host || 'nostr.build';
    const hugoRoot = configManager.getHugoRoot(postsDir);
    const privateKey = configManager.getPrivateKey();
    const dryRun = process.env.DRY_RUN === '1';

    if (options.verbose) {
        console.log(`Site: ${siteName}`);
        console.log(`Searching files in ${postsDir}`);
        console.log(`Hugo root: ${hugoRoot || 'not found'}`);
        console.log(`Blog URL: ${blogUrl || 'not set'}`);
        console.log(`Relays: ${relays.join(', ')}`);
    }

    if (!postsDir || !fs.existsSync(postsDir)) {
        console.error(`❌ Posts directory not found: ${postsDir}`);
        return 1;
    }

    if (!privateKey && !dryRun) {
        console.error("❌ No private key found. Run `hugo2nostr init` or set NOSTR_PRIVATE_KEY.");
        return 1;
    }

    const files = glob.sync(`${postsDir}/*.md`).filter(f => !f.endsWith('_index.md'));

    console.log(`📚 Found ${files.length} posts`);

    const stats = { total: files.length, published: 0, skipped: 0, drafts: 0, failed: 0 };

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        const title = meta.title || "Untitled";
        const progress = `[${i + 1}/${files.length}]`;

        // Skip drafts
        if (meta.draft === true) {
            stats.drafts++;
            if (!options.quiet) console.log(`${progress} ⏭️  Skipping draft: "${title}"`);
            continue;
        }

        // Skip already published (unless dry-run)
        const alreadyPublished = meta.nostr_id && meta.nostr_id.startsWith("nevent1");
        if (alreadyPublished && !dryRun) {
            stats.skipped++;
            if (!options.quiet) console.log(`${progress} ⏭️  Already published: "${title}"`);
            continue;
        }

        // Processing
        const filename = path.basename(file, '.md');
        const slug = meta.slug || filename;

        // Image handling
        let imageUrl = meta.nostr_image || null;
        const heroImage = meta.hero_image || meta.image || meta.featured_image;

        if (!imageUrl && heroImage && hugoRoot) {
            // Find local image
            let imagePath = path.join(hugoRoot, 'assets', heroImage);
            if (!fs.existsSync(imagePath)) {
                imagePath = path.join(hugoRoot, 'static', heroImage);
            }

            if (fs.existsSync(imagePath)) {
                if (dryRun) {
                    if (options.verbose) console.log(`  Would upload: ${imagePath}`);
                    imageUrl = `https://${imageHost}/[would-be-uploaded]/${path.basename(imagePath)}`;
                } else if (privateKey) {
                    imageUrl = await uploadImage(imagePath, imageHost, privateKey, options.verbose);
                    if (imageUrl) {
                        updateFrontmatter(file, { nostr_image: imageUrl });
                    }
                }
            } else {
                if (heroImage.startsWith('http://') || heroImage.startsWith('https://')) {
                    imageUrl = heroImage;
                } else if (options.verbose) {
                    console.log(`  Image not found: ${imagePath}`);
                }
            }
        }

        const allTags = [
            ...normalizeTags(meta.tags),
            ...normalizeTags(meta.topics),
        ].filter((v, i, a) => a.indexOf(v) === i);

        const summary = meta.summary || meta.description || "";
        let content = meta.body || "";
        content = content.replace(/<!--more-->/g, "").trim();

        if (!options.quiet) console.log(`${progress} Processing "${title}"...`);

        const shortcodeResult = await processShortcodes(content, hugoRoot, blogUrl, !options.yes);
        if (!shortcodeResult.ok) {
            stats.failed++;
            console.error(`${progress} ❌ Skipped due to shortcode error`);
            continue;
        }
        content = shortcodeResult.content;

        content = resolveContentUrls(content, blogUrl);
        content = convertFootnotes(content);
        content = convertSmartPunctuation(content);

        const finalSummary = summary || getSummary(content);
        const now = Math.floor(Date.now() / 1000);
        const publishedAt = Math.floor(new Date(normalizeDate(meta.date)).getTime() / 1000);

        const canonicalUrl = blogUrl ? `${blogUrl.replace(/\/$/, '')}/${slug}/` : null;

        const tagsArray: string[][] = [
            ["d", slug],
            ["title", title],
        ];

        if (authorId) tagsArray.push(["author", authorId]);
        if (canonicalUrl) tagsArray.push(["r", canonicalUrl]);
        if (imageUrl) tagsArray.push(["image", imageUrl]);
        if (finalSummary) tagsArray.push(["summary", finalSummary]);
        tagsArray.push(["published_at", String(publishedAt)]);

        if (alreadyPublished) {
            tagsArray.push(["updated_at", String(now)]);
        }

        for (const tag of allTags) {
            tagsArray.push(["t", tag]);
        }

        const nostrEvent: UnsignedEvent = {
            kind: 30023,
            created_at: now,
            tags: tagsArray,
            content,
            pubkey: '' // Filled by finalizeEvent
        };

        if (dryRun) {
            stats.published++;
            console.log(`${progress} 📝 "${title}" (dry-run)`);
            if (options.verbose) console.log(JSON.stringify(nostrEvent, null, 2));
        } else if (privateKey) {
            try {
                const signedEvent = finalizeEvent(nostrEvent, Uint8Array.from(Buffer.from(privateKey, 'hex')));
                if (!options.quiet) console.log(`${progress} 🚀 "${title}"`);

                const successRelays = await publishToNostr(relays, signedEvent, options.verbose);
                if (successRelays.length > 0) {
                    stats.published++;
                    updateFrontmatter(file, {
                        nostr_id: nip19.neventEncode({
                            id: signedEvent.id,
                            relays: relays,
                            kind: 30023
                        }),
                    });
                } else {
                    stats.failed++;
                }

                if (i < files.length - 1 && (options.delay || 3000) > 0) {
                    await sleep(options.delay || 3000);
                }
            } catch (err: any) {
                stats.failed++;
                console.error(`  ❌ Failed: ${err.message}`);
            }
        }
    }

    await closePool(relays);

    const mode = dryRun ? " (dry-run)" : "";
    console.log(`\n🎉 Done${mode}: ${stats.published} published, ${stats.skipped} skipped, ${stats.drafts} drafts, ${stats.failed} failed`);

    if (stats.failed > 0 && stats.published === 0) return 2;
    if (stats.failed > 0) return 1;
    return 0;
}
