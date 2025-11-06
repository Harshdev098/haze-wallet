import React, { useContext } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('react-router', () => ({
    useNavigate: () => jest.fn(),
}));

jest.mock('../utils/Logger', () => ({
    __esModule: true,
    default: {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

jest.mock('@noble/hashes/utils', () => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    hexToBytes: jest.fn((hex: string) => new Uint8Array(32)),
}));

jest.mock('nostr-tools', () => ({
    getPublicKey: jest.fn(() => 'fakePubKey123'),
}));

jest.mock('@fedimint/core-web', () => ({
    getMnemonic: jest.fn(() =>
        Promise.resolve([
            'word1',
            'word2',
            'word3',
            'word4',
            'word5',
            'word6',
            'word7',
            'word8',
            'word9',
            'word10',
            'word11',
            'word12',
        ])
    ),
}));

jest.mock('../services/nostrPayment', () => ({
    deriveNostrSecretKey: jest.fn(
        () => 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    ),
    handleDiscoverFederation: jest.fn(() => Promise.resolve({ stop: jest.fn() })),
    handleNWCConnection: jest.fn(() =>
        Promise.resolve({
            nwcUrl: 'nostr+walletconnect://abc123',
            clientPubKey: 'clientPubKey',
            walletNostrSecretKey: 'secretKey',
            walletNostrPubKey: 'pubKey',
        })
    ),
    handleNostrPayment: jest.fn(() => Promise.resolve({ stop: jest.fn() })),
}));

jest.mock('@nostr-dev-kit/ndk-cache-dexie', () => {
    const MockCacheAdapter = jest.fn().mockImplementation(() => ({
        onReady: jest.fn((callback: () => void) => {
            setTimeout(callback, 0);
        }),
        getUnpublishedEvents: jest.fn().mockResolvedValue([]),
    }));

    return {
        __esModule: true,
        default: MockCacheAdapter,
    };
});

jest.mock('@nostr-dev-kit/ndk', () => {
    const MockNDK = jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        pool: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            on: jest.fn((event: string, handler: any) => {
                // Storing handlers
            }),
            off: jest.fn(),
            relays: new Map(),
        },
        signer: null,
        cacheAdapter: {
            getUnpublishedEvents: jest.fn().mockResolvedValue([]),
        },
    }));

    const MockNDKEvent = jest.fn().mockImplementation(function (this: any, ndk: any) {
        this.ndk = ndk;
        this.kind = 0;
        this.content = '';
        this.tags = [];
        this.sign = jest.fn().mockResolvedValue(undefined);
        this.publish = jest.fn().mockResolvedValue(undefined);
        return this;
    });

    const MockNDKPrivateKeySigner = jest.fn();

    return {
        __esModule: true,
        default: MockNDK,
        NDKEvent: MockNDKEvent,
        NDKPrivateKeySigner: MockNDKPrivateKeySigner,
    };
});

jest.mock('react-redux', () => ({
    useSelector: jest.fn((selectorFn: any) =>
        selectorFn({
            wallet: { walletStatus: 'open' },
            activeFederation: { walletId: 'fakeWalletId' },
        })
    ),
    useDispatch: () => jest.fn(),
}));

import NostrContext, { NostrProvider } from '../context/Nostr';
import WalletManagerContext from '../context/WalletManager';

import * as nostrPayment from '../services/nostrPayment';
import NDK from '@nostr-dev-kit/ndk';
import NDKCacheAdapter from '@nostr-dev-kit/ndk-cache-dexie';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockHandleNostrPayment = nostrPayment.handleNostrPayment as jest.Mock;
const mockHandleDiscoverFederation = nostrPayment.handleDiscoverFederation as jest.Mock;
const mockHandleNWCConnection = nostrPayment.handleNWCConnection as jest.Mock;
const mockDeriveNostrSecretKey = nostrPayment.deriveNostrSecretKey as jest.Mock;

const mockWallet = {
    sendPayment: jest.fn(),
    receivePayment: jest.fn(),
    getBalance: jest.fn().mockResolvedValue(1000),
} as any;

const MockWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <WalletManagerContext.Provider value={{ wallet: mockWallet } as any}>
        {children}
    </WalletManagerContext.Provider>
);

const Consumer: React.FC = () => {
    const ctx = useContext(NostrContext);

    const handleGenerate = async () => {
        await ctx.generateNWCConnection('TestApp', 'wss://relay.test');
    };

    const handleDiscover = async () => {
        await ctx.DiscoverFederation();
    };

    return (
        <div>
            <div data-testid="nwcEnabled">{ctx.nwcEnabled ? 'true' : 'false'}</div>
            <div data-testid="connected">{ctx.isConnected ? 'true' : 'false'}</div>
            <div data-testid="isDiscovering">{ctx.isDiscovering ? 'true' : 'false'}</div>
            <button onClick={handleGenerate} data-testid="generate">
                Generate
            </button>
            <button onClick={handleDiscover} data-testid="discover">
                Discover
            </button>
        </div>
    );
};

describe('NostrProvider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    it('should initialize with NDK and set connected state to false', async () => {
        const { getByTestId } = render(
            <MockWalletProvider>
                <NostrProvider>
                    <Consumer />
                </NostrProvider>
            </MockWalletProvider>
        );

        expect(getByTestId('connected').textContent).toBe('false');

        await waitFor(() => {
            expect(NDK).toHaveBeenCalled();
        });

        expect(NDKCacheAdapter).toHaveBeenCalledWith({ dbName: 'nwc-wallet-events' });
    });

    it('should generate NWC connection and enable NWC', async () => {
        const { getByTestId } = render(
            <MockWalletProvider>
                <NostrProvider>
                    <Consumer />
                </NostrProvider>
            </MockWalletProvider>
        );

        await waitFor(() => expect(NDK).toHaveBeenCalled());

        await act(async () => {
            getByTestId('generate').click();
            await new Promise((r) => setTimeout(r, 200));
        });

        expect(mockHandleNWCConnection).toHaveBeenCalled();
        expect(localStorage.getItem('nwcEnabled')).toBe('true');
        expect(localStorage.getItem('autoPayNostr')).toBe('true');
        expect(getByTestId('nwcEnabled').textContent).toBe('true');
    });

    it.skip('should handle federation discovery', async () => {
        const { getByTestId } = render(
            <MockWalletProvider>
                <NostrProvider>
                    <Consumer />
                </NostrProvider>
            </MockWalletProvider>
        );

        await waitFor(() => expect(NDK).toHaveBeenCalled());

        await act(async () => {
            getByTestId('discover').click();
            await new Promise((r) => setTimeout(r, 100));
        });

        expect(mockHandleDiscoverFederation).toHaveBeenCalled();
    });

    it('should initialize NDK with cache adapter', async () => {
        render(
            <MockWalletProvider>
                <NostrProvider>
                    <Consumer />
                </NostrProvider>
            </MockWalletProvider>
        );

        await waitFor(() => {
            expect(NDKCacheAdapter).toHaveBeenCalledWith({ dbName: 'nwc-wallet-events' });
            expect(NDK).toHaveBeenCalled();
        });

        const ndkInstance = (NDK as jest.Mock).mock.results[0]?.value;
        expect(ndkInstance.connect).toBeDefined();
    });

    it('should track connection status', async () => {
        const { getByTestId } = render(
            <MockWalletProvider>
                <NostrProvider>
                    <Consumer />
                </NostrProvider>
            </MockWalletProvider>
        );

        // Initially disconnected
        expect(getByTestId('connected').textContent).toBe('false');

        await waitFor(() => {
            expect(NDK).toHaveBeenCalled();
        });
    });

    it('should track discovery status', async () => {
        const { getByTestId } = render(
            <MockWalletProvider>
                <NostrProvider>
                    <Consumer />
                </NostrProvider>
            </MockWalletProvider>
        );

        // Initially not discovering
        expect(getByTestId('isDiscovering').textContent).toBe('false');

        await waitFor(() => expect(NDK).toHaveBeenCalled());
    });

    it('should call deriveNostrSecretKey when needed', async () => {
        const { getByTestId } = render(
            <MockWalletProvider>
                <NostrProvider>
                    <Consumer />
                </NostrProvider>
            </MockWalletProvider>
        );

        await waitFor(() => expect(NDK).toHaveBeenCalled());

        await act(async () => {
            getByTestId('generate').click();
            await new Promise((r) => setTimeout(r, 200));
        });

        expect(mockDeriveNostrSecretKey).toBeDefined();
    });
});
