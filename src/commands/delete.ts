import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as nip19 from 'nostr-tools/nip19';
import { ConfigManager } from '../core/config.js';
import { deleteNote, closePool } from '../lib/nostr.js';
import {
    parseFrontmatter,
    updateFrontmatter,
    removeFile,
    Frontmatter
} from '../lib/fs.js';

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function confirm(message: string, yes: boolean): Promise<boolean> {
    if (yes) return true;

    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(`${message} [y/N] `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

export async function deleteCommand(configManager: ConfigManager): Promise<number> {
    const siteConfig = configManager.resolveSiteConfig();
    const postsDir = siteConfig.posts_dir;
    const relays = siteConfig.relays || [];
    const privateKey = configManager.getPrivateKey();
    const options = configManager.options;

    if (!postsDir || !fs.existsSync(postsDir)) {
        console.error(`❌ Posts directory not found: ${postsDir}`);
        return 1;
    }

    if (!privateKey) {
        console.error("❌ No private key found.");
        return 1;
    }

    // Derive pubkey for 'a' tag in deletion
    const { getPublicKey } = await import('nostr-tools/pure');
    const pubkey = getPublicKey(Uint8Array.from(Buffer.from(privateKey, 'hex')));

    const files = glob.sync(`${postsDir}/*.md`).filter(f => !f.endsWith('_index.md'));

    // Find posts marked for deletion
    interface DeletionCandidate {
        file: string;
        meta: Frontmatter;
    }

    const toDelete: DeletionCandidate[] = [];
    for (const file of files) {
        try {
            const raw = fs.readFileSync(file, "utf-8");
            const meta = parseFrontmatter(raw);
            if (meta.delete === true && meta.nostr_id) {
                toDelete.push({ file, meta });
            }
        } catch { }
    }

    if (toDelete.length === 0) {
        console.log("📚 No posts marked for deletion");
        return 0;
    }

    console.log(`📚 Found ${toDelete.length} posts marked for deletion`);

    // Confirmation
    const confirmed = await confirm(`Delete ${toDelete.length} posts from Nostr?`, !!options.yes);
    if (!confirmed) {
        console.log("❌ Cancelled");
        return 0;
    }

    const stats = { deleted: 0, failed: 0 };

    for (let i = 0; i < toDelete.length; i++) {
        const { file, meta } = toDelete[i];
        const title = meta.title || "Untitled";
        const progress = `[${i + 1}/${toDelete.length}]`;

        try {
            const decoded = nip19.decode(meta.nostr_id!);
            if (decoded.type !== "nevent") {
                console.error(`${progress} ❌ Invalid nostr_id for "${title}"`);
                stats.failed++;
                continue;
            }

            const data = decoded.data as nip19.EventPointer;
            const filename = path.basename(file, '.md');
            const slug = meta.slug || filename;

            console.log(`${progress} 🗑️  "${title}"`);
            const successRelays = await deleteNote(relays, privateKey, data.id, pubkey, slug);

            if (successRelays.length > 0) {
                stats.deleted++;
                removeFile(file, options.verbose);
            } else {
                stats.failed++;
            }

            if (i < toDelete.length - 1 && (options.delay || 3000) > 0) {
                await sleep(options.delay || 3000);
            }
        } catch (e: any) {
            stats.failed++;
            console.error(`${progress} ❌ Failed: ${e.message}`);
        }
    }

    await closePool(relays);

    console.log(`\n🎉 Done: ${stats.deleted} deleted, ${stats.failed} failed`);

    if (stats.failed > 0 && stats.deleted === 0) return 2;
    if (stats.failed > 0) return 1;
    return 0;
}

export async function deleteAllCommand(configManager: ConfigManager): Promise<number> {
    const siteConfig = configManager.resolveSiteConfig();
    const postsDir = siteConfig.posts_dir;
    const relays = siteConfig.relays || [];
    const privateKey = configManager.getPrivateKey();
    const options = configManager.options;

    if (!postsDir || !fs.existsSync(postsDir)) {
        console.error(`❌ Posts directory not found: ${postsDir}`);
        return 1;
    }

    if (!privateKey) {
        console.error("❌ No private key found.");
        return 1;
    }

    const { getPublicKey } = await import('nostr-tools/pure');
    const pubkey = getPublicKey(Uint8Array.from(Buffer.from(privateKey, 'hex')));

    const files = glob.sync(`${postsDir}/*.md`).filter(f => !f.endsWith('_index.md'));

    interface DeletionCandidate {
        id: string; // nostr_id
        title: string;
        slug: string;
        file: string;
    }

    const posts: DeletionCandidate[] = [];

    for (const file of files) {
        try {
            const raw = fs.readFileSync(file, "utf-8");
            const meta = parseFrontmatter(raw);
            if (meta.nostr_id && meta.nostr_id.startsWith("nevent1")) {
                const filename = path.basename(file, '.md');
                posts.push({
                    id: meta.nostr_id,
                    title: meta.title || "Untitled",
                    slug: meta.slug || filename,
                    file
                });
            }
        } catch { }
    }

    if (posts.length === 0) {
        console.log("📚 No published posts found");
        return 0;
    }

    console.log(`📚 Found ${posts.length} published posts`);

    // Confirmation (this is destructive!)
    const confirmed = await confirm(`⚠️  Delete ALL ${posts.length} posts from Nostr? This cannot be undone.`, !!options.yes);
    if (!confirmed) {
        console.log("❌ Cancelled");
        return 0;
    }

    const stats = { deleted: 0, failed: 0 };

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const progress = `[${i + 1}/${posts.length}]`;

        try {
            const decoded = nip19.decode(post.id);
            if (decoded.type !== "nevent") {
                console.error(`${progress} ❌ Invalid nostr_id for "${post.title}"`);
                stats.failed++;
                continue;
            }

            const data = decoded.data as nip19.EventPointer;

            console.log(`${progress} 🗑️  "${post.title}"`);
            const successRelays = await deleteNote(relays, privateKey, data.id, pubkey, post.slug);

            if (successRelays.length > 0) {
                stats.deleted++;
                // Instead of deleting file, just remove nostr_id
                updateFrontmatter(post.file, { nostr_id: "" });
            } else {
                stats.failed++;
            }

            if (i < posts.length - 1 && (options.delay || 3000) > 0) {
                await sleep(options.delay || 3000);
            }
        } catch (e: any) {
            stats.failed++;
            console.error(`${progress} ❌ Failed: ${e.message}`);
        }
    }

    await closePool(relays);

    console.log(`\n🎉 Done: ${stats.deleted} deleted, ${stats.failed} failed`);

    if (stats.failed > 0 && stats.deleted === 0) return 2;
    if (stats.failed > 0) return 1;
    return 0;
}
