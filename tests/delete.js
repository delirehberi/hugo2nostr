import { delete_marked } from "../delete_marked.js";
import fs from "fs";
import { glob } from "glob";
import * as nip19 from "nostr-tools/nip19";
import * as utils from "../utils.js";

// 🛠 mock dependencies
jest.mock("fs");
jest.mock("glob");
jest.mock("nostr-tools/nip19");
jest.mock("../utils.js", () => ({
  deleteNote: jest.fn(),
  removeFile: jest.fn(),
  parseFrontmatter: jest.fn(),
  sleep: jest.fn(() => Promise.resolve()), // prevent real delays
}));

describe("delete_marked", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("skips files without delete flag", async () => {
    glob.sync.mockReturnValue(["/posts/a.md"]);
    fs.readFileSync.mockReturnValue("mock content");

    utils.parseFrontmatter.mockReturnValue({ delete: false });

    await delete_marked();

    expect(utils.deleteNote).not.toHaveBeenCalled();
    expect(utils.removeFile).not.toHaveBeenCalled();
  });

  test("skips files without nostr_id", async () => {
    glob.sync.mockReturnValue(["/posts/a.md"]);
    fs.readFileSync.mockReturnValue("mock content");

    utils.parseFrontmatter.mockReturnValue({ delete: true });

    await delete_marked();

    expect(utils.deleteNote).not.toHaveBeenCalled();
    expect(utils.removeFile).not.toHaveBeenCalled();
  });

  test("skips invalid nostr_id type", async () => {
    glob.sync.mockReturnValue(["/posts/a.md"]);
    fs.readFileSync.mockReturnValue("mock content");

    utils.parseFrontmatter.mockReturnValue({
      delete: true,
      nostr_id: "invalid_nevent",
    });

    nip19.decode.mockReturnValue({ type: "nprofile", data: { id: "123" } });

    await delete_marked();

    expect(utils.deleteNote).not.toHaveBeenCalled();
    expect(utils.removeFile).not.toHaveBeenCalled();
  });

  test("deletes valid marked post", async () => {
    glob.sync.mockReturnValue(["/posts/a.md"]);
    fs.readFileSync.mockReturnValue("mock content");

    utils.parseFrontmatter.mockReturnValue({
      delete: true,
      nostr_id: "valid_nevent",
      title: "Test Post",
    });

    nip19.decode.mockReturnValue({ type: "nevent", data: { id: "12345" } });

    await delete_marked();

    expect(utils.deleteNote).toHaveBeenCalledWith("12345");
    expect(utils.removeFile).toHaveBeenCalledWith("/posts/a.md");
    expect(utils.sleep).toHaveBeenCalledWith(3000);
  });

  test("catches and logs error", async () => {
    glob.sync.mockReturnValue(["/posts/a.md"]);
    fs.readFileSync.mockImplementation(() => {
      throw new Error("FS fail");
    });

    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    await delete_marked();

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Error processing"),
      expect.any(Error)
    );

    spy.mockRestore();
  });
});

