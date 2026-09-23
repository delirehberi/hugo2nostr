import { describe, it, expect } from '@jest/globals';
import * as nip19 from 'nostr-tools/nip19';
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

    it('should derive slug from title when dTag is missing completely', () => {
        const ev: Event = {
            id: 'abc123456789',
            pubkey: 'pub123',
            created_at: 1000,
            kind: 30023,
            tags: [
                ['title', 'My Nostr Only Article']
            ],
            content: 'Hello',
            sig: ''
        };
        const slug = deriveEventSlug(ev, 'My Nostr Only Article', undefined);
        expect(slug).toBe('my-nostr-only-article');
    });

    it('should fallback to event id when dTag and title are missing', () => {
        const ev: Event = {
            id: '12345678abcdef',
            pubkey: 'pub123',
            created_at: 1000,
            kind: 30023,
            tags: [],
            content: 'Hello',
            sig: ''
        };
        const slug = deriveEventSlug(ev, '', undefined);
        expect(slug).toBe('nostr-12345678');
    });
});

describe('NIP-19 naddr article format', () => {
    it('should correctly encode and decode naddr for kind:30023 article', async () => {
        const nip19 = await import('nostr-tools/nip19');
        const pubkey = '79c2ca0971bb2718a22a844f7158784d169637ec050c3d032f6881b2749ce3e1';
        const dTag = 'my-first-post';
        const relays = ['wss://relay.damus.io'];

        const naddr = nip19.naddrEncode({
            identifier: dTag,
            pubkey,
            kind: 30023,
            relays
        });

        expect(naddr.startsWith('naddr1')).toBe(true);

        const decoded = nip19.decode(naddr);
        expect(decoded.type).toBe('naddr');
        const data = decoded.data as nip19.AddressPointer;
        expect(data.identifier).toBe(dTag);
        expect(data.pubkey).toBe(pubkey);
        expect(data.kind).toBe(30023);
        expect(data.relays).toEqual(relays);
    });
});
