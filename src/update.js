import fs from "fs";
import { glob } from "glob";
import * as nip19 from "nostr-tools/nip19";
import {stringifyFrontmatter,  parseFrontmatter} from "./utils.js";
import { RELAYS, POSTS_DIR, init} from "./init.js";

init()

function rewriteNevent(file) {
  const raw = fs.readFileSync(file, "utf-8");
  const meta = parseFrontmatter(raw);

  if (!meta.nostr_id) {
    console.log(`⚠️ No nostr_id found in ${file}, skipping`);
    return;
  }

  try {
    const decoded = nip19.decode(meta.nostr_id);
    if (decoded.type !== "nevent") {
      console.log(`⚠️ Not an nevent in ${file}, skipping`);
      return;
    }

    const newNevent = nip19.neventEncode({
      id: decoded.data.id,
      relays: RELAYS,
      kind: decoded.data.kind || 30023,
    });

    if (meta.nostr_id === newNevent) {
      console.log(`↔️ Already up to date: ${file}`);
      return;
    }

    meta.nostr_id = newNevent;
    const updated = stringifyFrontmatter(meta, meta.body, meta.type);
    fs.writeFileSync(file, updated, "utf-8");

    console.log(`✅ Updated nostr_id in ${file}`);
  } catch (err) {
    console.error(`❌ Failed to decode nostr_id in ${file}:`, err.message);
  }
}

export async function update_nevents() {
  console.log(`🔄 Rewriting nevents in ${POSTS_DIR}`);
  const files = glob.sync(`${POSTS_DIR}/*.md`);
  for (const file of files) {
    rewriteNevent(file);
  }
  console.log("🎉 Done");
}

