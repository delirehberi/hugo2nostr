import fs from "fs";
import matter from "gray-matter";
import toml from "toml";
import {glob} from "glob";
import * as nostr from "nostr-tools";
import {finalizeEvent} from "nostr-tools/pure";
import * as nip19 from 'nostr-tools/nip19'
import { publishToNostr, ISO2Date, normalizeTags,normalizeDate,getSummary } from "./utils.js";
import { RELAYS, POSTS_DIR, NOSTR_PRIVATE_KEY, AUTHOR_PRIVATE_KEY, DRY_RUN , pubkey,init} from "./init.js";

init();

function updateFrontmatter(file, raw, meta, nostrId) {
    function updateData(data) {
        data.nostr_id = nip19.neventEncode({ id: nostrId, relays: RELAYS, kind: 30023 });
        data.date = ISO2Date(meta.date || new Date().toISOString());
        return data;
    }
    if (raw.startsWith("---")) {
        // YAML frontmatter
        const parsed = matter(raw);
        parsed.data=updateData(parsed.data);
        const updated = matter.stringify(parsed.content, parsed.data);
        fs.writeFileSync(file, updated, "utf-8");

    } else if (raw.startsWith("+++")) {
        // TOML frontmatter
        const fm = raw.substring(3, raw.indexOf("+++", 3));
        const body = raw.substring(raw.indexOf("+++", 3) + 3).trim();

        let data = toml.parse(fm);
        data = updateData(data);

        // Reconstruct TOML + body
        let newFm = Object.entries(data)
            .map(([k, v]) => {
                if (Array.isArray(v)) return `${k} = [${v.map(x => `"${x}"`).join(", ")}]`;
                if (typeof v === "string") return `${k} = "${v}"`;
                return `${k} = ${v}`;
            })
            .join("\n");

        const updated = `+++\n${newFm}\n+++\n\n${body}\n`;
        fs.writeFileSync(file, updated, "utf-8");
    } else {
        console.warn(`⚠️ Could not update frontmatter for ${file}, unknown format`);
    }
}

function parseFrontmatter(content) {
    if (content.startsWith("---")) {
        // YAML-like frontmatter
        const parsed = matter(content);
        return {
            ...parsed.data,
            body: parsed.content,
        };
    } else if (content.startsWith("+++")) {
        // TOML-like frontmatter
        const fm = content.substring(3, content.indexOf("+++", 3));
        const body = content.substring(content.indexOf("+++", 3) + 3).trim();
        const data = toml.parse(fm);
        return { ...data, body };
    } else {
        return { title: "Untitled", date: new Date().toISOString(), body: content };
    }
}



export async function publish() {
    console.log(`Searching files in ${POSTS_DIR}`);
    const files = glob.sync(`${POSTS_DIR}/*.md`);
    console.log(`📚 Found ${files.length} posts`);

    for (const file of files) {
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);

        const title = meta.title || "Untitled";
        const description = meta.description || "";
        const tags = normalizeTags(meta.tags || "");
        const date = normalizeDate(meta.date || new Date().toISOString());
        let tagsArray = [
                ["title", title],
                ["author", "z@emre.xyz"],
                ["blog_url", `https://emre.xyz/posts/${file.replace(/^.*[\\\/]/, '').replace(/\.md$/, '')}`],
                ["d", file.replace(/^.*[\\\/]/, '').replace(/\.md$/, '')],
                ...tags.map((t) => ["t", t]),
            ];
        if (description!=="") {
            tagsArray.push(["summary", description]);
        }
        let content = meta.body || "";
        content = content.replace(/<!--more-->/g, "").trim();
        const summary = getSummary(content);

        let created_at = Math.floor(new Date(date).getTime() / 1000);
        const now = Math.floor(Date.now() / 1000);

        const twoYearsAgo = now - (365*2) * 24 * 60 * 60;
        if (created_at < twoYearsAgo) {
            created_at = twoYearsAgo;
            content = `*Original date ${date}* \n\n` + content;
        }

        const nostrEvent = {
            kind: 30023, // Article
            created_at: created_at,
            tags: tagsArray,
            content: content,
            summary: summary
        };
        const signedEvent = finalizeEvent(nostrEvent, AUTHOR_PRIVATE_KEY);

        if (DRY_RUN) {
            console.log("📝 Dry-run event:", JSON.stringify(signedEvent, null, 2));
        } else {

            const alreadyPublished = meta.nostr_id && meta.nostr_id.startsWith("nevent1"); 
            console.dir(alreadyPublished)

            if (alreadyPublished) {
                console.log(`⚠️ Skipping already published post: ${file}`);
                continue; // skip this post
            }

            console.log(`🚀 Publishing "${title}" (${file})`);
            try{
                await publishToNostr(signedEvent);
                updateFrontmatter(file, raw, meta, signedEvent.id);

            }catch(err){
                console.error(`❌ Failed to publish "${title}":`, err);
            }
        }
    }
}
