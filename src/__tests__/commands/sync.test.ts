import { describe, it, expect } from '@jest/globals';
import { deriveEventSlug } from '../../commands/sync.js';
import { Event } from 'nostr-tools/pure';

describe('deriveEventSlug', () => {
    it('should extract slug from canonical r tag if present', () => {
        const ev: Event = {
            id: 'abc123',
            pubkey: 'pub123',
            created_at: 1000,
            kind: 30023,
            tags: [
                ['title', 'Some Title'],
                ['r', 'https://emre.xyz/nostr-nasil-gidiyor/']
            ],
            content: 'Hello',
            sig: ''
        };
        const slug = deriveEventSlug(ev, 'Some Title', undefined, 'https://emre.xyz/nostr-nasil-gidiyor/');
        expect(slug).toBe('nostr-nasil-gidiyor');
    });

    it('should ignore hex/id dTag and derive slug from title instead', () => {
        const ev: Event = {
            id: '2be69f5e1234567890abcdef',
            pubkey: 'pub123',
            created_at: 1000,
            kind: 30023,
            tags: [
                ['title', 'Cloudflare OS, is it worth?'],
                ['d', '2be69f5e']
            ],
            content: 'Hello',
            sig: ''
        };
        const slug = deriveEventSlug(ev, 'Cloudflare OS, is it worth?', '2be69f5e');
        expect(slug).toBe('cloudflare-os-is-it-worth');
    });

    it('should handle Turkish characters in title correctly', () => {
        const ev: Event = {
            id: 'b7eab4031234567890abcdef',
            pubkey: 'pub123',
            created_at: 1000,
            kind: 30023,
            tags: [
                ['title', 'Yazmak Zorundayım'],
                ['d', 'b7eab403']
            ],
            content: 'Hello',
            sig: ''
        };
        const slug = deriveEventSlug(ev, 'Yazmak Zorundayım', 'b7eab403');
        expect(slug).toBe('yazmak-zorundayim');
    });

    it('should use readable dTag when available', () => {
        const ev: Event = {
            id: 'abc123',
            pubkey: 'pub123',
            created_at: 1000,
            kind: 30023,
            tags: [
                ['title', 'Untitled'],
                ['d', 'my-custom-slug']
            ],
            content: 'Hello',
            sig: ''
        };
        const slug = deriveEventSlug(ev, 'Untitled', 'my-custom-slug');
        expect(slug).toBe('my-custom-slug');
    });
});
