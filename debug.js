import fs from "fs";
import {getPublicKey} from "nostr-tools/pure";
import { bytesToHex} from '@noble/hashes/utils' // already an installed dependency
import * as nip19 from 'nostr-tools/nip19'
import {SimplePool} from "nostr-tools/pool";


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

async function fetchArticles() {
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
  published.posts = events;
  fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(published, null, 2));
  console.log(`💾 Saved ${events.length} events to ${PUBLISHED_FILE}`);
}


// run script
const events = await fetchArticles();
savePublished(events);
  

