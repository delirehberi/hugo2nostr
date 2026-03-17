
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.useFakeTimers();

const mockPoolInstance = {
    publish: jest.fn<any>(),
    close: jest.fn(),
    subscribeMany: jest.fn(),
};

const mockSimplePool = jest.fn().mockReturnValue(mockPoolInstance);

jest.unstable_mockModule('nostr-tools/pool', () => ({
    SimplePool: mockSimplePool,
    useWebSocketImplementation: jest.fn(),
}));

jest.unstable_mockModule('nostr-tools/pure', () => {
    return {
        finalizeEvent: jest.fn().mockReturnValue({ id: 'mock-id', sig: 'mock-sig' }),
    };
});

jest.unstable_mockModule('ws', () => ({ default: jest.fn() })); // Mock ws if needed
// Network mocks usually not needed if we mock SimplePool

const { getPool, closePool, listEvents, publishToNostr, deleteNote, createNip98Auth } = await import('../../lib/nostr.js');
const { SimplePool } = await import('nostr-tools/pool');
const { finalizeEvent } = await import('nostr-tools/pure');

describe('Nostr Library', () => {
    beforeEach(async () => {
        jest.clearAllMocks();

        // Reset mock pool instance methods
        (mockPoolInstance.publish as jest.Mock).mockReset();
        (mockPoolInstance.close as jest.Mock).mockReset();
        (mockPoolInstance.subscribeMany as jest.Mock).mockReset();

        await closePool([]); // Reset singleton in module
    });

    describe('getPool', () => {
        it('should return a SimplePool instance', async () => {
            const pool = await getPool();
            expect(pool).toBeDefined();
            expect(SimplePool).toHaveBeenCalled();
        });
    });

    describe('publishToNostr', () => {
        it('should publish event to relays', async () => {
            const relays = ['wss://relay1.com', 'wss://relay2.com'];
            const event = { kind: 1, content: 'test', tags: [], created_at: 100, pubkey: 'pk' } as any;

            (mockPoolInstance.publish as jest.Mock<any>).mockResolvedValue(undefined); // success

            const result = await publishToNostr(relays, event);

            expect(mockPoolInstance.publish).toHaveBeenCalledTimes(2);
            expect(result).toEqual(relays);
        });

        it('should handle failed publish', async () => {
            const relays = ['wss://relay1.com'];
            const event = { kind: 1 } as any;
            (mockPoolInstance.publish as jest.Mock<any>).mockRejectedValue(new Error('Failed'));

            const result = await publishToNostr(relays, event);
            expect(result).toEqual([]);
        });
    });

    describe('listEvents', () => {
        it('should return events from querySync', async () => {
            const events = [{ id: '1' }, { id: '2' }];
            (mockPoolInstance as any).querySync = jest.fn<any>().mockResolvedValue(events);

            const pool = await getPool();
            const result = await listEvents(pool, ['wss://relay.com'], [{ kinds: [30023] }]);
            expect((mockPoolInstance as any).querySync).toHaveBeenCalledWith(['wss://relay.com'], { kinds: [30023] });
            expect(result).toEqual(events);
        });

        it('should merge results for multiple filters', async () => {
            const eventsA = [{ id: '1' }];
            const eventsB = [{ id: '2' }];
            (mockPoolInstance as any).querySync = jest.fn<any>()
                .mockResolvedValueOnce(eventsA)
                .mockResolvedValueOnce(eventsB);

            const pool = await getPool();
            const result = await listEvents(pool, [], [{ kinds: [30023] }, { kinds: [1] }]);
            expect(result).toEqual([{ id: '1' }, { id: '2' }]);
        });
    });

    describe('deleteNote', () => {
        it('should publish deletion event', async () => {
            const relays = ['wss://r1'];
            const privKey = 'privkey';
            const noteId = 'note1';
            const pubkey = 'pubkey';

            (mockPoolInstance.publish as jest.Mock<any>).mockResolvedValue(undefined);

            await deleteNote(relays, privKey, noteId, pubkey);

            expect(finalizeEvent).toHaveBeenCalled();
            expect(mockPoolInstance.publish).toHaveBeenCalled();
        });
    });

    describe('createNip98Auth', () => {
        it('should return auth header', () => {
            const header = createNip98Auth('https://host.com', 'POST', 'privkey');
            expect(header).toContain('Nostr ');
            expect(finalizeEvent).toHaveBeenCalled();
        });
    });
});
