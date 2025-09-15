import fs from "fs";
import {getPublicKey} from "nostr-tools/pure";
import { bytesToHex} from '@noble/hashes/utils' // already an installed dependency
import * as nip19 from 'nostr-tools/nip19'
import {SimplePool} from "nostr-tools/pool";
import { deleteNote, removeFile, parseFrontmatter} from "./utils.js";
import { init, POSTS_DIR, AUTHOR_PRIVATE_KEY } from "./init.js";

init();

const PUBLISHED_FILE = "../published.json";

export async function fetchArticles() {
    let pool = new SimplePool();
    const since = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60; // last 5 years
    let events = await pool.querySync(RELAYS, { kinds: [30023] , authors: [pubkey], since})
    if(events.length === 0){
        console.log("No events found");
        return [];
    }
    const simplified = events.map(ev => {
        let key, title;
    try {
      [key,title] = ev.tags.filter(t => t[0] === "title")[0];
       
    } catch {
      title = ev.content?.slice(0, 100) || ""; // fallback: first 100 chars
    }
    return {
      id: ev.id,
      relays: ev.relays || [], // relays where found
      title,
    };
  });

  return simplified;
}

// fetch articles by pubkey

// save to published.json
function savePublished(events) {
    let published = { posts: [] };
  published.posts = events;
  fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(published, null, 2));
  console.log(`💾 Saved ${events.length} events to ${PUBLISHED_FILE}`);
}


// run script
export async function debug() {
    const events = await fetchArticles();
    savePublished(events);
}
  

