
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Define Mock Functions
const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();

// Mock fs module
jest.unstable_mockModule('fs', () => ({
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
    statSync: mockStatSync,
    default: {
        readFileSync: mockReadFileSync,
        existsSync: mockExistsSync,
        statSync: mockStatSync,
    }
}));

// Mock gray-matter
const mockMatter = jest.fn((content: string) => {
    if (content.includes('title: Hello')) {
        return { data: { title: 'Hello' }, content: 'Content' };
    }
    if (content.includes('"title": "Hello"')) {
        return { data: { title: 'Hello' }, content: 'Content' };
    }
    return { data: {}, content: '' };
});

(mockMatter as any).stringify = jest.fn((body: string, data: any) => {
    return `---\ntitle: ${data.title}\n---\n${body}`;
});

jest.unstable_mockModule('gray-matter', () => ({
    default: mockMatter
}));

// Mock toml
jest.unstable_mockModule('toml', () => ({
    parse: jest.fn().mockReturnValue({ title: 'Hello' }),
    default: {
        parse: jest.fn().mockReturnValue({ title: 'Hello' }),
    }
}));


// Import module under test DYNAMICALLY
const { parseFrontmatter, stringifyFrontmatter, normalizeTags, normalizeDate } = await import('../../lib/fs.js');

describe('FS Library', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockReadFileSync.mockReset();
        mockExistsSync.mockReset();
        mockStatSync.mockReset();
    });

    describe('parseFrontmatter', () => {
        it('should parse YAML frontmatter', () => {
            const content = '---\ntitle: Hello\n---\nContent';

            const result = parseFrontmatter(content);
            expect(result.title).toBe('Hello');
            expect(result.body?.trim()).toBe('Content');
            expect(result.type).toBe('yaml');
        });

        it('should parse plain content (no frontmatter)', () => {
            const content = 'Just plain content';

            const result = parseFrontmatter(content);
            expect(result.body).toBe(content);
            expect(result.type).toBe('plain');
        });

        it('should parse TOML frontmatter', () => {
            const content = '+++\ntitle = "Hello"\n+++\nContent';

            const result = parseFrontmatter(content);
            expect(result.title).toBe('Hello');
            expect(result.body?.trim()).toBe('Content');
            expect(result.type).toBe('toml');
        });
    });

    describe('stringifyFrontmatter', () => {
        it('should stringify to YAML', () => {
            const data = { title: 'Hello' };
            const content = 'Content';
            const result = stringifyFrontmatter(data, content);
            expect(result).toContain('title: Hello');
            expect(result).toContain('---');
            expect(result).toContain('Content');
        });
    });

    describe('normalizeTags', () => {
        it('should return array of strings', () => {
            expect(normalizeTags(['a', 'b'])).toEqual(['a', 'b']);
            expect(normalizeTags('a')).toEqual(['a']);
            expect(normalizeTags(undefined)).toEqual([]);
        });
    });

    describe('normalizeDate', () => {
        it('should return date object', () => {
            const d = new Date('2023-01-01T00:00:00.000Z');
            const result = normalizeDate(d);
            expect(typeof result).toBe('string');
            expect(result).toBe(d.toISOString());
        });

        it('should parse date string', () => {
            const d = '2023-01-01';
            const result = normalizeDate(d);
            expect(typeof result).toBe('string');
        });
    });
});
