
import { jest } from '@jest/globals';

export const getPool = jest.fn();
export const closePool = jest.fn();
export const listEvents = jest.fn();
export const publishToNostr = jest.fn();
export const deleteNote = jest.fn();
export const createNip98Auth = jest.fn();

const nostr = {
    getPool,
    closePool,
    listEvents,
    publishToNostr,
    deleteNote,
    createNip98Auth
};

export default nostr;
