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

const PUBLISHED_FILE = "./published.json";
const pubkey = getPublicKey(AUTHOR_PRIVATE_KEY);

let published = { posts: [] };
if (fs.existsSync(PUBLISHED_FILE)) {
  published = JSON.parse(fs.readFileSync(PUBLISHED_FILE, "utf-8"));
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
// run script
for (const post of published.posts) {
    try{
        console.log(post.id, post.title); 
        await deleteNote(post.id);
        published.posts = published.posts.filter(p => p.id !== post.id);
        fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(published, null, 2));
        await sleep(5000);
    }catch(e){
        console.error("Error deleting post", post.id, e);
        continue;
    }
}

console.log("All done!");
