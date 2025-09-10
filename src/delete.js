import fs from "fs";
import { glob } from "glob";
import * as nip19 from "nostr-tools/nip19";
import { deleteNote, removeFile, parseFrontmatter} from "./utils.js";
import { init, POSTS_DIR, AUTHOR_PRIVATE_KEY } from "./init.js";

init();

export async function delete_marked() {
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

      await deleteNote(data.id);
      removeFile(file);
      await sleep(3000);
    } catch (e) {
      console.error(`Error processing ${file}:`, e);
    }
  }
  console.log("✅ Done processing all posts marked for deletion.");
}

