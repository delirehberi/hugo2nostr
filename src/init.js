import { bytesToHex} from '@noble/hashes/utils' // already an installed dependency
import {getPublicKey} from "nostr-tools/pure";
import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'

function init(){
    useWebSocketImplementation(WebSocket);
}

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


export {pubkey, AUTHOR_PRIVATE_KEY, RELAYS, DRY_RUN, POSTS_DIR, NOSTR_PRIVATE_KEY,init};
