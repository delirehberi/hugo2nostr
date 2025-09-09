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



useWebSocketImplementation(WebSocket)
const RELAYS = process.env.RELAY_LIST.split(",") || ["wss://relay.damus.io", "wss://relay.nostr.band"];
console.log("Using relays:", RELAYS);
const NOSTR_PRIVATE_KEY = process.env.NOSTR_PRIVATE_KEY; 
let { type, data } = nip19.decode(NOSTR_PRIVATE_KEY);
const AUTHOR_PRIVATE_KEY = bytesToHex(data);
const POSTS_DIR = process.env.POSTS_DIR || "./posts";

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

const pubkey = getPublicKey(AUTHOR_PRIVATE_KEY);


let published = { posts: [] };
const files = glob.sync(`${POSTS_DIR}/*.md`);
    for (const file of files) {
        const raw = fs.readFileSync(file, "utf-8");
        const meta = parseFrontmatter(raw);
        const alreadyPublished = meta.nostr_id && meta.nostr_id.length === 63 && meta.nostr_id.startsWith("nevent1"); 
        if(alreadyPublished){
            published.posts.push({ 
                id: meta.nostr_id, 
                title: meta.title || "Untitled" ,
                file: file
            });
        }
    }

// delete a note by id
async function deleteNote(noteId) {
    const pool = new SimplePool();
    pool.trackRelays = true;

    const deleteEvent = {
        kind: 5, // deletion event
        created_at: Math.floor(Date.now() / 1000),
        tags: [["e", noteId]],
        content: ""
    };

    const signedEvent = finalizeEvent(deleteEvent, AUTHOR_PRIVATE_KEY);


    await Promise.all(pool.publish(RELAYS,signedEvent).map(async (promise) => {
        try {
            await promise;
            console.log(`✅ Event ${signedEvent.id} accepted by relay`);
        } catch (err) {
            console.warn(`⚠️ Event ${signedEvent.id} rejected by relay:`);
        }     
    }));
    let seenon = pool.seenOn.get(signedEvent.id);//Set<AbstractRelay>
    if(seenon){
        let relays = [];
        for (const r of seenon.values()) {
            relays.push(r.url);
            console.log(`✅ Event seen on relay: ${r.url}`);
        }
    }
  
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateFrontmatter(file) {
    let raw = fs.readFileSync(file, "utf-8");

    function updateData(data) {
        data.nostr_id = "";
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
// run script
for (const post of published.posts) {
    try{
        console.log(post.id, post.title); 

        let {eventType, data}= nip19.decode(post.id);
        if(eventType !== "nevent"){
            console.error("Invalid note id", post.id);
            continue;
        }

        await deleteNote(data.id);
        //update frontMatter 
        updateFrontmatter(post.file);
        await sleep(5000);
    }catch(e){
        console.error("Error deleting post", post.id, e);
        continue;
    }
}

console.log("All done!");
