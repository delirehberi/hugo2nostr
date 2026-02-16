
import { jest } from '@jest/globals';

export const createInterface = jest.fn();

const readline = {
    createInterface
};

export default readline;
