import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import federationDetailsReducer, { setFederationDetails } from '../redux/slices/FederationDetails';
import * as FederationService from '../services/FederationService';

jest.mock('@fedimint/core-web', () => ({
    __esModule: true,
    generateMnemonic: jest.fn(),
    getMnemonic: jest.fn(),
    joinFederation: jest.fn(),
    previewFederation: jest.fn(),
    Wallet: jest.fn().mockImplementation(() => ({
        federation: {
            getConfig: jest.fn(),
        },
    })),
}));

const mockFetch = jest.fn();
beforeEach(() => {
    (global as any).fetch = mockFetch;
    mockFetch.mockReset();
});

import {
    generateMnemonic,
    getMnemonic,
    joinFederation,
    previewFederation,
    Wallet,
} from '@fedimint/core-web';

const mockGenerateMnemonic = generateMnemonic as jest.Mock;
const mockGetMnemonic = getMnemonic as jest.Mock;
const mockJoinFederation = joinFederation as jest.Mock;
const mockPreviewFederation = previewFederation as jest.Mock;

const createTestStore = () => {
    return configureStore({
        reducer: {
            federationDetails: federationDetailsReducer,
        },
    });
};

describe('FederationDetailsSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    it('should return initial state', () => {
        const store = createTestStore();
        const state = store.getState().federationDetails;
        expect(state.Details).toBeNull();
        expect(state.metaData).toBeNull();
        expect(state.GuardianStatus).toEqual({ status: {} });
    });

    it('should set federation details', () => {
        const store = createTestStore();
        const config = {
            api_endpoints: { '0': { url: 'wss://g0' } },
            broadcast_public_keys: { '0': 'pubkey0' },
            consensus_version: { major: 1, minor: 0 },
            meta: { federation_name: 'Test Fed' },
            modules: {},
        };

        store.dispatch(setFederationDetails(config));
        expect(store.getState().federationDetails.Details).toEqual(config);
    });
});

describe('FederationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        mockFetch.mockClear();
    });

    describe('JoinFederation', () => {
        it('joins with existing mnemonic', async () => {
            mockGetMnemonic.mockResolvedValue(['word1', 'word2']);
            const walletInstance = new Wallet();
            mockJoinFederation.mockResolvedValue(walletInstance);

            const result = await FederationService.JoinFederation('fed1://...', 'MyWallet', false);

            expect(mockGetMnemonic).toHaveBeenCalled();
            expect(mockJoinFederation).toHaveBeenCalledWith('fed1://...', false);
            expect(result).toBe(walletInstance);
        });

        it('generates mnemonic when none exists', async () => {
            mockGetMnemonic.mockResolvedValue([]);
            mockGenerateMnemonic.mockResolvedValue(['seed', 'words']);
            const walletInstance = new Wallet();
            mockJoinFederation.mockResolvedValue(walletInstance);

            await FederationService.JoinFederation('fed1://...', 'NewWallet', true);

            expect(mockGenerateMnemonic).toHaveBeenCalled();
            expect(mockJoinFederation).toHaveBeenCalledWith('fed1://...', true);
        });
    });

    describe('fetchMetaData', () => {
        it('fetches metadata successfully', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    fed123: { federation_name: 'Cool Fed', welcome_message: 'Hi!' },
                }),
            } as Response);

            const result = await FederationService.fetchMetaData(
                'https://meta.example.com',
                'fed123'
            );

            expect(mockFetch).toHaveBeenCalledWith('https://meta.example.com');
            expect(result.federation_name).toBe('Cool Fed');
        });
    });

    describe('fetchFederationDetails', () => {
        it('uses local meta when no external URL', async () => {
            const wallet = new Wallet();
            (wallet.federation.getConfig as jest.Mock).mockResolvedValue({
                meta: { federation_name: 'Local Fed' },
                api_endpoints: {},
                broadcast_public_keys: {},
                consensus_version: { major: 1, minor: 0 },
                modules: {},
            });

            const result = await FederationService.fetchFederationDetails(wallet, 'fed123');

            expect(result.meta.federation_name).toBe('Local Fed');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('fetches external meta when URL exists', async () => {
            const wallet = new Wallet();
            (wallet.federation.getConfig as jest.Mock).mockResolvedValue({
                meta: {
                    federation_name: 'Base',
                    meta_external_url: 'https://external.com/meta',
                },
                api_endpoints: {},
                broadcast_public_keys: {},
                consensus_version: { major: 1, minor: 0 },
                modules: {},
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    fed123: { federation_name: 'External Fed', welcome_message: 'Hello!' },
                }),
            } as Response);

            const result = await FederationService.fetchFederationDetails(wallet, 'fed123');

            expect(mockFetch).toHaveBeenCalledWith('https://external.com/meta');
            expect(result.meta.federation_name).toBe('External Fed');
        });
    });

    describe('previewFedWithInviteCode', () => {
        it('previews federation correctly', async () => {
            mockPreviewFederation.mockResolvedValue({
                federation_id: 'fed123',
                config: JSON.stringify({
                    global: {
                        consensus_version: { major: 1, minor: 0 },
                        meta: { federation_name: 'Preview Fed' },
                        api_endpoints: { '0': {}, '1': {} },
                    },
                    modules: {},
                }),
            });

            const result = await FederationService.previewFedWithInviteCode('fed1://invite');

            expect(result.fedName).toBe('Preview Fed');
            expect(result.totalGuardians).toBe(2);
            expect(result.federationID).toBe('fed123');
        });

        it('handles external metadata', async () => {
            mockPreviewFederation.mockResolvedValue({
                federation_id: 'fed456',
                config: JSON.stringify({
                    global: {
                        consensus_version: { major: 1, minor: 0 },
                        meta: {
                            federation_name: 'Base',
                            meta_external_url: 'https://meta.example.com/preview',
                        },
                        api_endpoints: { '0': {}, '1': {}, '2': {} },
                    },
                    modules: {},
                }),
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    fed456: {
                        federation_name: 'Rich Fed',
                        welcome_message: 'Join us!',
                        federation_icon_url: 'https://icon.png',
                    },
                }),
            } as Response);

            const result = await FederationService.previewFedWithInviteCode('fed1://rich');

            expect(result.fedName).toBe('Rich Fed');
            expect(result.iconUrl).toBe('https://icon.png');
            expect(result.totalGuardians).toBe(3);
        });
    });
});
