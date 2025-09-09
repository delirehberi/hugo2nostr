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
//convert iso to "2013-10-15T14:39:55-04:00"
function ISO2Date(isoString) {
    const date = new Date(isoString);
    const tzOffset = -date.getTimezoneOffset();
    const diff = tzOffset >= 0 ? '+' : '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${diff}${pad(Math.floor(Math.abs(tzOffset) / 60))}:${pad(Math.abs(tzOffset) % 60)}`;
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
    function updateData(data) {
        data.nostr_id = nip19.neventEncode({ id: nostrId, relays: [RELAYS[0],RELAYS[1]], kind: 30023 });
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

async function publishToNostr(event) {
    try{
        await sleep(4000);
        const pool = new SimplePool();
        pool.trackRelays = true;
        await Promise.all(pool.publish(RELAYS,event).map(async (promise) => {
            try {
                await promise;
                console.log(`✅ Event ${event.id} accepted by relay`);
            } catch (err) {
                console.warn(`⚠️ Event ${event.id} rejected by relay:`, err);
            }     
        }));
        let seenon = pool.seenOn.get(event.id);//Set<AbstractRelay>
        let relays = [];
        for (const r of seenon.values()) {
            relays.push(r.url);
            console.log(`✅ Event seen on relay: ${r.url}`);
        }
        console.log(`Event sent to all relays via SimplePool.`);
        return relays;
    }catch(err){
        console.log(err);
    }
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

            const alreadyPublished = meta.nostr_id && meta.nostr_id.length === 63 && meta.nostr_id.startsWith("nevent1"); 
            if (alreadyPublished) {
                console.log(`⚠️ Skipping already published post: ${file}`);
                continue; // skip this post
            }

            console.log(`🚀 Publishing "${title}" (${file})`);
            try{
                let xRelays = await publishToNostr(signedEvent);
                updateFrontmatter(file, raw, meta, signedEvent.id);

                published.posts.push({
                    title: title,
                    id: signedEvent.id,
                    relays: xRelays
                });

            }catch(err){
                console.error(`❌ Failed to publish "${title}":`, err);
            }
        }
    }
}

main();

