import fs from "fs";
import matter from "gray-matter";
import toml from "toml";
import { glob } from "glob";
import * as nip19 from "nostr-tools/nip19";
import { bytesToHex } from "@noble/hashes/utils";
import { getPublicKey, finalizeEvent } from "nostr-tools/pure";
import { SimplePool, useWebSocketImplementation } from "nostr-tools/pool";
import WebSocket from "ws";

useWebSocketImplementation(WebSocket);

const RELAYS = process.env.RELAY_LIST?.split(",") || ["wss://relay.damus.io", "wss://relay.nostr.band"];
console.log("Using relays:", RELAYS);

const NOSTR_PRIVATE_KEY = process.env.NOSTR_PRIVATE_KEY;
let { data } = nip19.decode(NOSTR_PRIVATE_KEY);
const AUTHOR_PRIVATE_KEY = bytesToHex(data);
const POSTS_DIR = process.env.POSTS_DIR || "./posts";

// parse frontmatter
function parseFrontmatter(content) {
  if (content.startsWith("---")) {
    const parsed = matter(content);
    return { ...parsed.data, body: parsed.content };
  } else if (content.startsWith("+++")) {
    const fm = content.substring(3, content.indexOf("+++", 3));
    const body = content.substring(content.indexOf("+++", 3) + 3).trim();
    const data = toml.parse(fm);
    return { ...data, body };
  } else {
    return { title: "Untitled", date: new Date().toISOString(), body: content };
  }
}

// delete a note by id
async function deleteNote(noteId) {
  const pool = new SimplePool();
  const deleteEvent = {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", noteId]],
    content: "",
  };
  const signedEvent = finalizeEvent(deleteEvent, AUTHOR_PRIVATE_KEY);

  await Promise.all(
    pool.publish(RELAYS, signedEvent).map(async (p) => {
      try {
        await p;
        console.log(`✅ Event ${signedEvent.id} accepted by relay`);
      } catch {
        console.warn(`⚠️ Event ${signedEvent.id} rejected`);
      }
    })
  );
}

// sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// remove file
function removeFile(file) {
  try {
    fs.unlinkSync(file);
    console.log(`🗑️  Removed file: ${file}`);
  } catch (e) {
    console.error(`⚠️ Could not remove file ${file}:`, e);
  }
}

// run script
(async () => {
  const files = glob.sync(`${POSTS_DIR}/*.md`);

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const meta = parseFrontmatter(raw);

      if (meta.delete !== true) continue; // skip if delete not true
      if (!meta.nostr_id) {
        console.warn(`⚠️ No nostr_id found for ${file}, skipping deletion`);
        continue;
      }

      console.log(`Deleting: ${file} (${meta.title || "Untitled"})`);

      let { type , data } = nip19.decode(meta.nostr_id);
      if (type !== "nevent") {
        console.error("Invalid nostr_id:", meta.nostr_id);
        continue;
      }
        console.dir(type,data);

      await deleteNote(data.id);
      removeFile(file);
      await sleep(3000);
    } catch (e) {
      console.error(`Error processing ${file}:`, e);
    }
  }

  console.log("✅ Done processing all posts marked for deletion.");
})();

