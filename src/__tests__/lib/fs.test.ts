
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
const { parseFrontmatter, stringifyFrontmatter, normalizeTags, normalizeDate, slugify, isHexOrId } = await import('../../lib/fs.js');

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

    describe('slugify', () => {
        it('should handle Turkish characters correctly', () => {
            expect(slugify('Yazmak Zorundayım')).toBe('yazmak-zorundayim');
            expect(slugify('Nostr Nasıl Gidiyor?')).toBe('nostr-nasil-gidiyor');
            expect(slugify('İleri Düzey Şiirler & Çağdaş Öyküler')).toBe('ileri-duzey-siirler-cagdas-oykuler');
            expect(slugify('ılık süt ve çikolatalı çörek')).toBe('ilik-sut-ve-cikolatali-corek');
        });

        it('should handle English and special characters', () => {
            expect(slugify('Cloudflare OS, is it worth?')).toBe('cloudflare-os-is-it-worth');
            expect(slugify('Hello World! 123')).toBe('hello-world-123');
            expect(slugify('Café & Restaurant')).toBe('cafe-restaurant');
        });

        it('should trim and collapse hyphens', () => {
            expect(slugify('  --foo---bar--  ')).toBe('foo-bar');
            expect(slugify('')).toBe('');
        });
    });

    describe('isHexOrId', () => {
        it('should detect hex strings and UUIDs', () => {
            expect(isHexOrId('2be69f5e')).toBe(true);
            expect(isHexOrId('b7eab403')).toBe(true);
            expect(isHexOrId('a1b2c3d4e5f60718')).toBe(true);
            expect(isHexOrId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        });

        it('should not mark readable titles or slugs as hex', () => {
            expect(isHexOrId('nostr-nasil-gidiyor')).toBe(false);
            expect(isHexOrId('cloudflare-os-is-it-worth')).toBe(false);
            expect(isHexOrId('yazmak-zorundayim')).toBe(false);
            expect(isHexOrId('hello')).toBe(false);
            expect(isHexOrId('')).toBe(false);
        });
    });
});

