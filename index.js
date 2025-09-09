import fs from "fs";
import matter from "gray-matter";
import toml from "toml";
import {glob} from "glob";
import * as nostr from "nostr-tools";
import crypto from "crypto";
import {getPublicKey,finalizeEvent} from "nostr-tools/pure";
import {Relay} from "nostr-tools/relay";
import { bytesToHex, hexToBytes } from '@noble/hashes/utils' // already an installed dependency
import * as nip19 from 'nostr-tools/nip19'
import {SimplePool} from "nostr-tools/pool";
import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'


const {  getEventHash } = nostr
useWebSocketImplementation(WebSocket)
// CONFIG
const POSTS_DIR = process.env.POSTS_DIR || "./posts";
const RELAYS = process.env.RELAY_LIST.split(",")
console.log("Using relays:", RELAYS);
const NOSTR_PRIVATE_KEY = process.env.NOSTR_PRIVATE_KEY; 
let { type, data } = nip19.decode(NOSTR_PRIVATE_KEY);
const AUTHOR_PRIVATE_KEY = bytesToHex(data);

const DRY_RUN = process.env.DRY_RUN === "1";
const pubkey = getPublicKey(AUTHOR_PRIVATE_KEY);

if (!DRY_RUN && !AUTHOR_PRIVATE_KEY) {
    console.error("❌ Please set NOSTR_PRIVATE_KEY env variable.");
    process.exit(1);
}

function normalizeDate(dateStr) {
    try {
        if (!dateStr) throw new Error("No date provided");

        // If the date is already ISO format with time, just use it
        const hasTime = /\d{2}:\d{2}/.test(dateStr);
        let d = new Date(dateStr);

        if (isNaN(d)) throw new Error("Invalid date");

        // If no time, set default 08:00
        if (!hasTime) {
            d.setHours(8, 0, 0, 0);
        }

        return d.toISOString();
    } catch {
        console.warn("⚠️ Could not parse date:", dateStr);
        return new Date().toISOString();
    }
}

function normalizeTags(tags) {
  if (!tags) return [];

  if (Array.isArray(tags)) {
    // Hugo sometimes parses YAML/TOML arrays automatically
    return tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  }

  // Split by commas or spaces (one or more)
  return tags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
}

function updateFrontmatter(file, raw, meta, nostrId) {
    if (raw.startsWith("---")) {
        // YAML frontmatter
        const parsed = matter(raw);
        parsed.data.nostr_id = nostrId; // add or update
        const updated = matter.stringify(parsed.content, parsed.data);
        fs.writeFileSync(file, updated, "utf-8");

    } else if (raw.startsWith("+++")) {
        // TOML frontmatter
        const fm = raw.substring(3, raw.indexOf("+++", 3));
        const body = raw.substring(raw.indexOf("+++", 3) + 3).trim();

        let data = toml.parse(fm);
        data.nostr_id = nostrId;

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

async function publishToNostr(event) {
    await sleep(4000);
    const pool = new SimplePool();

    await Promise.all(pool.publish(RELAYS,event));
    console.log(`Event sent to all relays via SimplePool.`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function getSummary(content) {
  if (!content) return "";

  // Normalize line endings
  const text = content.replace(/\r\n/g, "\n").trim();

  // Split by blank lines
  const paragraphs = text.split(/\n/);

  // Return the first non-empty paragraph
  return paragraphs.length > 0 ? paragraphs[0].trim() : "";
}

async function main() {
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

        const oneYearAgo = now - 365 * 24 * 60 * 60;
        if (created_at < oneYearAgo) {
            created_at = oneYearAgo;
            content = `*Original date ${date}*\n\n` + content;
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
            console.log("📝 Dry-run event:", JSON.stringify(nostrEvent, null, 2));
        } else {
            const published = JSON.parse(fs.readFileSync("published.json", "utf-8"));


            const alreadyPublished = published.posts.find(
                (p) => p.title === title
            );

            if (alreadyPublished) {
                console.log(`⚠️ Skipping already published post: ${file}`);
                continue; // skip this post
            }

            console.log(`🚀 Publishing "${title}" (${file})`);
            try{
                await publishToNostr(signedEvent);
                updateFrontmatter(file, raw, meta, signedEvent.id);

                published.posts.push({
                    title: title,
                    id: signedEvent.id,
                    relays: RELAYS,
                });

                fs.writeFileSync("published.json", JSON.stringify(published, null, 2));
            }catch(err){
                console.error(`❌ Failed to publish "${title}":`, err);
            }
        }
    }
}

main();

