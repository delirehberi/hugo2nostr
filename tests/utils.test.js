import fs from "fs";
import * as utils from "../src/utils.js";

// ----- Mocks -----
jest.mock("fs", () => ({
    unlinkSync: jest.fn(),
}));

jest.mock("nostr-tools/pool", () => ({
    SimplePool: jest.fn().mockImplementation(() => ({
        publish: jest.fn().mockReturnValue([]),
        seenOn: new Map(),
    })),
}));

jest.mock("crypto", () => ({
    randomBytes: jest.fn().mockReturnValue(Buffer.from("deadbeef", "hex")),
}));

describe("utils.js functions", () => {

    test("ISO2Date converts ISO string to formatted date", () => {
        const result = utils.ISO2Date("Thu Jan 02 2025 18:27:53 GMT-0500 (Eastern Standard Time)");
        expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/);
    });

    test("parseFrontmatter parses YAML frontmatter", () => {
        const content = `---
title: "Test"
draft: false
nostr_id: "nevent1q..."
tags: ["tag1", "tag2"]
---
Body content`
        const result = utils.parseFrontmatter(content);
        expect(result.type).toBe("yaml");
        expect(result.title).toBe("Test");
        expect(result.tags).toEqual(["tag1", "tag2"]);
        expect(result.body).toBe("Body content");
    });

    test("parseFrontmatter parses TOML frontmatter", () => {
        const content = `+++
title = "Test"
draft = false
nostr_id = "nevent1q..."
tags = ["tag1", "tag2"]
+++
Body content`;
        const result = utils.parseFrontmatter(content);
        expect(result.type).toBe("toml");
        expect(result.title).toBe("Test");
        expect(result.tags).toEqual(["tag1", "tag2"]);
        expect(result.body).toBe("Body content");
    });

    test("parseFrontmatter handles plain content", () => {
        const content = "Just some text";
        const result = utils.parseFrontmatter(content);
        expect(result.type).toBe("plain");
        expect(result.body).toBe("Just some text");
    });

    // ---- normalizeTags ----
    test("normalizeTags returns empty array if null", () => {
        expect(utils.normalizeTags(null)).toEqual([]);
    });

    test("normalizeTags handles array of tags", () => {
        expect(utils.normalizeTags(["#tag1", "tag2"])).toEqual(["tag1", "tag2"]);
    });

    test("normalizeTags handles string of tags", () => {
        expect(utils.normalizeTags("#tag1, tag2 tag3")).toEqual(["tag1", "tag2", "tag3"]);
    });

    // ---- normalizeDate ----
    test("normalizeDate returns ISO string with default time", () => {
        const result = utils.normalizeDate("2025-09-10");
        const date = new Date(result);

        expect(date.getFullYear().toString()).toMatch(/\d{4}/);
        expect(date.getMonth().toString()).toMatch(/\d{1,2}/);
        expect(date.getDate().toString()).toMatch(/\d{1,2}/);
        expect(date.getHours()).toBe(8);
        expect(date.getMinutes()).toBe(0);
    });

    test("normalizeDate parses ISO with time", () => {
        const result = utils.normalizeDate("2025-09-10T15:30:00");

        const date = new Date(result);

        expect(date.getFullYear()).toBe(2025);
        expect(date.getMonth()).toBe(8); // months are 0-based
        expect(date.getDate()).toBe(10);
        expect(date.getHours()).toBe(15);
        expect(date.getMinutes()).toBe(30);
    });

    test("normalizeDate returns current ISO for invalid input", () => {
        const result = utils.normalizeDate("invalid-date");
        expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    // ---- sleep ----
    test("sleep resolves after given time", async () => {
        const start = Date.now();
        await utils.sleep(50);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    // ---- getSummary ----
    test("getSummary returns first paragraph", () => {
        const text = "First line\n\nSecond paragraph";
        expect(utils.getSummary(text)).toBe("First line");
    });

    test("getSummary returns empty string for empty content", () => {
        expect(utils.getSummary("")).toBe("");
    });

    // ---- removeFile ----
    test("removeFile calls fs.unlinkSync", () => {
        utils.removeFile("dummy.txt");
        expect(fs.unlinkSync).toHaveBeenCalledWith("dummy.txt");
    });

    // ---- stringifyFrontmatter ----
    test("stringifyFrontmatter returns plain body for unknown type", () => {
        expect(utils.stringifyFrontmatter({title: "x"}, "body", "plain")).toBe("body");
    });

    test("stringifyFrontmatter returns YAML formatted string", () => {
        const yamlStr = utils.stringifyFrontmatter({title: "x"}, "body", "yaml");
        expect(yamlStr).toMatch(/title: x/);
    });

    test("stringifyFrontmatter returns TOML formatted string", () => {
        const tomlStr = utils.stringifyFrontmatter({title: "x"}, "body", "toml");
        expect(tomlStr).toMatch(/\+\+\+/);
        expect(tomlStr).toMatch(/title = "x"/);
    });
});

