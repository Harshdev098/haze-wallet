import NDK, {
    NDKEvent,
    NDKPrivateKeySigner,
    NDKUser,
    type NDKFilter,
    type NDKSigner,
} from '@nostr-dev-kit/ndk';
import { PayInvoice } from '../services/LightningPaymentService';
import { getMnemonic, Wallet } from '@fedimint/core-web';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import type {
    CreateBolt11Response,
    LightningTransaction,
    LnReceiveState,
    Transactions,
    LnPayState,
} from '@fedimint/core-web';
import { handleZapRequest } from './ZapService';
import logger from '../utils/Logger';
import type { DiscoveredFederation } from '../hooks/Federation.type';
import { previewFedWithInviteCode } from './FederationService';
import * as bip39 from '@scure/bip39';
import * as bip32 from '@scure/bip32';

const invoiceStore = new Map<string, string>();

export function deriveNostrSecretKey(mnemonic: string): string {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.HDKey.fromMasterSeed(seed);
    const child = root.derive("m/44'/1237'/0'/0/0");

    if (!child.privateKey) {
        throw new Error('Failed to derive private key');
    }

    return bytesToHex(child.privateKey);
}

export const handleNWCConnection = async (ndk: NDK, relay: string | null, appName: string) => {
    if (!appName) {
        logger.error('App name is required');
        return null;
    }
    const mnemonic = await getMnemonic();
    if (!mnemonic || mnemonic.length === 0) {
        throw new Error('Mnemonic is empty');
    }

    const mnemonicStr = mnemonic.join(' ');
    const walletNostrSecretKey = deriveNostrSecretKey(mnemonicStr);
    const walletNostrPubKey = getPublicKey(hexToBytes(walletNostrSecretKey));

    const clientRelayKeys: Record<string, { clientPubKey: string; relay: string | null }> = {};

    const effectiveRelay = relay || 'wss://relay.getalby.com/v1';

    logger.log(`Generating new client keys for app: ${appName}`);
    const clientSecretKey = bytesToHex(generateSecretKey());
    const clientPubKey = getPublicKey(hexToBytes(clientSecretKey));

    const nwcUrl = `nostr+walletconnect://${walletNostrPubKey}?relay=${effectiveRelay}&secret=${clientSecretKey}`;
    clientRelayKeys[appName] = { clientPubKey, relay };
    localStorage.setItem('ClientRelayKeys', JSON.stringify(clientRelayKeys));

    logger.log(`Generated NWC URL for ${appName}:`, nwcUrl);

    // Publish wallet service info event
    ndk.signer = new NDKPrivateKeySigner(walletNostrSecretKey);
    const infoEvent = new NDKEvent(ndk);

    infoEvent.kind = 13194;
    infoEvent.pubkey = walletNostrPubKey;
    infoEvent.created_at = Math.floor(Date.now() / 1000);
    infoEvent.content = JSON.stringify({
        methods: [
            'get_info',
            'pay_invoice',
            'make_invoice',
            'get_balance',
            'list_transactions',
            'lookup_invoice',
            'notifications',
            'payment_sent',
            'payment_received',
        ],
    });
    infoEvent.tags = [
        ['p', walletNostrPubKey],
        ['d', 'Haze Wallet'],
    ];

    infoEvent
        .sign()
        .then(() => {
            infoEvent
                .publish()
                .then(() => {
                    logger.log(`Published wallet service info event for ${appName}`);
                })
                .catch((err) =>
                    logger.error(`Error publishing service info event for ${appName}:`, err)
                );
        })
        .catch((err) => logger.error(`Error signing service info event for ${appName}:`, err));

    return { nwcUrl, clientPubKey, walletNostrSecretKey, walletNostrPubKey };
};

export const handleDiscoverFederation = async (
    ndk: NDK,
    setState: (feds: DiscoveredFederation[]) => void,
    discoveredFederations: DiscoveredFederation[]
) => {
    logger.log('Starting federation discovery...');
    if (!ndk.pool.connectedRelays().length) {
        logger.log('No connected relays, waiting for connection...');
    }

    const processingFederationIds = new Set<string>();

    const FedEventFilter: NDKFilter = {
        kinds: [38173],
    } as unknown as NDKFilter;

    const subscription = ndk.subscribe(FedEventFilter, { closeOnEose: false });

    subscription.on('event', async (event: NDKEvent) => {
        logger.log('Received event:', event.id, 'kind:', event.kind);
        if (event.kind !== 38173) return;

        try {
            await processFederationEvent(
                event,
                discoveredFederations,
                setState,
                processingFederationIds
            );
        } catch (err) {
            logger.error('Error processing federation event:', err);
        }
    });

    setTimeout(() => {
        logger.log(`Stopping federation discovery`);
        subscription.stop();
    }, 30000);

    subscription.on('eose', () => {
        logger.log('End of stored events');
    });

    subscription.on('close', () => {
        logger.log('Subscription closed');
    });

    return subscription;
};

const processFederationEvent = async (
    event: NDKEvent,
    discoveredFederations: DiscoveredFederation[],
    setState: (feds: DiscoveredFederation[]) => void,
    processingFederationIds: Set<string>
): Promise<void> => {
    logger.log('Processing federation event:', event.id);

    if (!event.tags || event.tags.length === 0) {
        logger.log('Event has no tags, skipping');
        return;
    }

    const inviteTags = event.getMatchingTags('u');
    if (!inviteTags || inviteTags.length === 0) {
        logger.log('No invite tags found, skipping event');
        return;
    }

    const inviteCode = inviteTags[0]?.[1];
    if (!inviteCode) {
        logger.log('Empty invite code, skipping event');
        return;
    }

    const fedTags = event.getMatchingTags('d');
    if (!fedTags || fedTags.length === 0) {
        logger.log('No federation ID tags found, skipping event');
        return;
    }

    const federationId = fedTags[0]?.[1];
    if (!federationId) {
        logger.log('Empty federation ID, skipping event');
        return;
    }

    if (discoveredFederations.some((f) => f.federationID === federationId)) {
        logger.log('Federation already discovered:', federationId);
        return;
    }

    if (processingFederationIds.has(federationId)) {
        logger.log('Federation already being processed:', federationId);
        return;
    }

    processingFederationIds.add(federationId);

    try {
        const previewResult = await previewFedWithInviteCode(inviteCode);
        if (discoveredFederations.some((f) => f.federationID === federationId)) {
            logger.log('Federation was discovered while processing:', federationId);
            return;
        }

        const federation: DiscoveredFederation = {
            inviteCode,
            federationID: federationId,
            iconUrl: previewResult.iconUrl,
            fedName: previewResult.fedName,
            welcomeMessage: previewResult.welcomeMessage,
            onChainDeposit: previewResult.onChainDeposit,
            totalGuardians: previewResult.totalGuardians,
            maxBalance: previewResult.maxBalance,
            consensousVersion: previewResult.consensousVersion,
            modules: previewResult.modules,
        };

        discoveredFederations.push(federation);
        setState([...discoveredFederations]);
    } finally {
        processingFederationIds.delete(federationId);
    }
};

export const handleNostrPayment = async (wallet: Wallet, walletNostrPubKey: string, ndk: NDK) => {
    const signer = ndk.signer;
    if (!signer) {
        logger.error('NDK signer not set');
        return null;
    }

    const subscription = ndk.subscribe({
        kinds: [23194],
        '#p': [walletNostrPubKey],
    });

    subscription.on('event', async (event: NDKEvent) => {
        logger.log('=== RECEIVED EVENT ===');
        logger.log('Event ID:', event.id);
        logger.log('Event kind:', event.kind);

        // Skip if this event is from wallet
        if (event.pubkey === walletNostrPubKey) {
            logger.log('Skipping event from own wallet');
            return;
        }

        const clientKeys: Record<string, { clientPubKey: string; relay: string | null }> =
            JSON.parse(localStorage.getItem('ClientRelayKeys') || '{}');

        const isKnownClient = Object.values(clientKeys).some(
            (client) => client.clientPubKey === event.pubkey
        );

        if (!isKnownClient) {
            logger.log(`Event pubkey ${event.pubkey} is NOT a known client. Ignoring.`);
            return;
        }

        try {
            const sender = new NDKUser({ pubkey: event.pubkey });

            await event.decrypt(sender, signer, 'nip04');

            let content;
            try {
                content = JSON.parse(event.content);
                logger.log('Decrypted event content:', content);
            } catch (e) {
                logger.log('Event content is not valid JSON:', e);
                logger.log('Raw content:', event.content);
                return;
            }

            if (!content.method) {
                logger.log('Event is not a payment request, skipping. Content structure:', {
                    hasMethod: !!content.method,
                    hasId: !!content.id,
                    keys: Object.keys(content),
                });
                return;
            }

            const expirationTag = event.tagValue('expiration');
            if (expirationTag) {
                const expirationSeconds = parseInt(expirationTag, 10);
                const nowSeconds = Math.floor(Date.now() / 1000);

                if (nowSeconds > expirationSeconds) {
                    logger.log(
                        `Found expired event, ignoring. Expired at ${expirationSeconds}, now ${nowSeconds}`
                    );
                    return;
                }
            }

            const method = content.method;
            const params = content.params || {};
            const id = content.id || event.id;
            // eslint-disable-next-line
            let result: { result?: any; error?: any };

            switch (method) {
                case 'get_info':
                    result = {
                        result: {
                            methods: [
                                'get_info',
                                'pay_invoice',
                                'make_invoice',
                                'get_balance',
                                'create_connection',
                                'list_transactions',
                                'lookup_invoice',
                                'notifications',
                                'payment_sent',
                                'payment_received',
                            ],
                            alias: 'Haze Wallet',
                            color: '#1570cbff',
                            pubkey: `${walletNostrPubKey}`,
                            network: 'regtest',
                            block_height: 0,
                            block_hash:
                                '0000000000000000000000000000000000000000000000000000000000000000',
                        },
                        error: null,
                    };
                    break;
                case 'pay_invoice':
                    result = await PayInvoiceViaNostr(params).then(
                        (res) => res as { result?: any; error?: any }
                    );
                    break;
                case 'get_balance':
                    result = await CheckBalance();
                    break;
                case 'make_invoice':
                    result = await CreateInvoice(params, ndk, signer, walletNostrPubKey);
                    break;
                case 'lookup_invoice':
                    result = (await LookForInvoice(params)) as { result?: any; error?: any };
                    break;
                case 'list_transactions':
                    result = await ListTransactions();
                    break;
                case 'zap_request':
                    result = await handleZapRequest(event, wallet, ndk, signer, walletNostrPubKey);
                    break;
                default:
                    result = {
                        error: {
                            code: 'METHOD_NOT_FOUND',
                            message: `Method ${method} not supported`,
                        },
                    };
            }

            // Send response back to the client
            const response = new NDKEvent(ndk);
            response.kind = 23195;
            response.tags = [
                ['p', event.pubkey],
                ['e', id],
            ];

            const jsonRpcResponse = {
                id: content.id || event.id,
                ...(result.error ? { error: result.error } : { result: result.result }),
            };

            logger.log('Sending JSON-RPC response:', {
                method: method,
                response: jsonRpcResponse,
                stringified: JSON.stringify(jsonRpcResponse),
            });

            response.content = JSON.stringify(jsonRpcResponse);
            const senderEvent = new NDKUser({ pubkey: event.pubkey });
            await response.encrypt(senderEvent, signer, 'nip04');
            await response.sign(signer);
            await response.publish();
            logger.log('Response sent successfully for method:', method, 'with ID:', id);
        } catch (error) {
            logger.error('Error processing event:', error);
            try {
                const sender = new NDKUser({ pubkey: event.pubkey });
                const errorResponse = new NDKEvent(ndk);
                errorResponse.kind = 23195;
                errorResponse.tags = [
                    ['p', event.pubkey],
                    ['e', event.id],
                ];
                errorResponse.content = JSON.stringify({
                    id: event.id,
                    error: {
                        code: 'PROCESSING_ERROR',
                        message: 'Failed to process request',
                    },
                });

                await errorResponse.encrypt(sender, signer, 'nip04');
                await errorResponse.sign(signer);
                await errorResponse.publish();
                logger.log('Error response sent');
            } catch (responseError) {
                logger.error('Failed to send error response:', responseError);
            }
        }
    });

    subscription.on('eose', () => {
        logger.log('=== End of stored events ===');
    });

    subscription.on('close', () => {
        logger.log('=== Subscription closed ===');
    });

    // Add subscription start logging
    logger.log('=== Subscription started ===');

    const CheckBalance = async () => {
        try {
            const msats = await new Promise<number>((resolve, reject) => {
                const unsubscribe = wallet.balance.subscribeBalance((msats: number) => {
                    resolve(msats);
                    unsubscribe?.();
                });
                setTimeout(() => {
                    reject(new Error('Timeout while fetching balance'));
                    unsubscribe?.();
                }, 10000);
            });

            return {
                result: { balance: msats },
                error: null,
            };
        } catch (error: any) {
            return {
                result: null,
                error: {
                    code: 'BALANCE_ERROR',
                    message: error.message || 'Failed to get balance',
                },
            };
        }
    };

    const CreateInvoice = async (
        request: { amount: number; description: string; description_hash: string; expiry: number },
        ndk: NDK,
        signer: NDKSigner,
        walletNostrPubKey: string
    ) => {
        try {
            const invoiceData = await wallet.lightning.createInvoice(
                request.amount,
                request.description || 'This is an invoice'
            );
            logger.log('Invoice created, operation_id:', invoiceData.operation_id);
            invoiceStore.set(invoiceData.invoice, invoiceData.operation_id);

            const now = Math.floor(Date.now() / 1000);
            const invoiceResult = {
                type: 'incoming',
                invoice: invoiceData.invoice,
                description: request.description || 'This is an invoice',
                description_hash: request.description_hash || null,
                preimage: null,
                payment_hash: invoiceData.operation_id || '',
                amount: request.amount,
                fees_paid: 0,
                created_at: now,
                expires_at: request.expiry ? now + request.expiry : now + 3600,
                settled_at: null,
                metadata: {},
            };

            // Publish payment_received notification event (pending)
            const notificationEvent = new NDKEvent(ndk);
            notificationEvent.kind = 23194;
            notificationEvent.tags = [
                ['p', walletNostrPubKey],
                ['t', 'payment_received'],
            ];

            const notificationContent = {
                method: 'payment_received',
                params: {
                    payment_hash: invoiceData.operation_id,
                    amount: request.amount,
                    invoice: invoiceData.invoice,
                    status: 'pending',
                },
            };

            notificationEvent.content = JSON.stringify(notificationContent);
            await notificationEvent.sign(signer);
            await notificationEvent.publish();
            logger.log(
                'Published payment_received notification (pending) for invoice:',
                invoiceData.operation_id
            );

            // Start monitoring invoice payment
            monitorInvoicePayment(invoiceData, ndk, signer, walletNostrPubKey, request);

            return {
                result: invoiceResult,
                error: null,
            };
        } catch (error: any) {
            logger.error('Error creating invoice:', error);
            return {
                result: null,
                error: { code: 'INTERNAL', message: error?.toString() },
            };
        }
    };

    const PayInvoiceViaNostr = async (request: { invoice: string; amount: number }) => {
        try {
            logger.log('request ', request);
            const invoiceResult = await PayInvoice(wallet, request.invoice);
            logger.log('invoice Result is ', invoiceResult);
            return new Promise((resolve, reject) => {
                const unsubscribe = wallet?.lightning.subscribeLnPay(
                    invoiceResult.id,
                    async (state: LnPayState) => {
                        if (typeof state === 'object' && 'success' in state) {
                            resolve({
                                result_type: 'pay_invoice',
                                result: {
                                    preimage: (state.success as { preimage: string }).preimage,
                                    fees_paid: invoiceResult.fee,
                                },
                                error: null,
                            });
                        } else if (typeof state === 'object' && 'canceled' in state) {
                            reject({
                                result: null,
                                error: { code: 'payment_cancelled', message: 'Payment Cancelled' },
                            });
                        }
                    },
                    (error: any) => {
                        logger.error('Error in subscription:', error);
                        resolve({
                            result: undefined,
                            error: {
                                code: 'subscription_error',
                                message: error?.toString() || 'Unknown error',
                            },
                        });
                    }
                );

                setTimeout(() => {
                    unsubscribe?.();
                }, 300000);
            });
        } catch (error: any) {
            return {
                result: error,
                error: { code: 'PAYMENT_FAILED', message: error?.toString() || 'Unknown error' },
            };
        }
    };

    const ListTransactions = async () => {
        try {
            const rawTransactions: Transactions[] = await wallet.federation.listTransactions();

            let state: 'settled' | 'pending' | 'failed' = 'pending';
            logger.log('state', state);
            const transactions = rawTransactions.map((tx) => {
                if (tx.kind === 'ln') {
                    if (tx.outcome === 'claimed' || tx.outcome === 'success') {
                        state = 'settled';
                    } else if (tx.outcome === 'canceled') {
                        state = 'failed';
                    }
                } else if (tx.kind === 'mint') {
                    if (tx.outcome === 'Success') {
                        state = 'settled';
                    } else if (
                        tx.outcome === 'UserCanceledProcessing' ||
                        tx.outcome === 'UserCanceledFailure'
                    ) {
                        state = 'failed';
                    }
                }

                const created_at = Math.floor(tx.timestamp / 1000);

                return {
                    type: tx.type === 'receive' ? 'incoming' : 'outgoing',
                    invoice: tx.kind === 'ln' ? (tx as LightningTransaction).invoice : undefined,
                    description: '',
                    description_hash: '',
                    preimage: '',
                    payment_hash: '',
                    amount: 0,
                    fees_paid: 0,
                    created_at,
                    expires_at: null,
                    settled_at: created_at,
                    metadata: {},
                };
            });

            return {
                result_type: 'list_transactions',
                result: {
                    transactions,
                },
            };
        } catch (error: any) {
            return {
                result_type: 'list_transactions',
                error: {
                    code: 'list_transactions_error',
                    message: error?.toString() || 'Unknown error',
                },
            };
        }
    };

    const LookForInvoice = async (request: { invoice: string; payment_hash: string }) => {
        if (!request.invoice) {
            logger.log('invoice not found');
            return {
                result: null,
                error: { code: 'INVALID_INVOICE', message: 'Invoice is undefined' },
            };
        }

        const operationId = invoiceStore.get(request.invoice);
        if (!operationId) {
            logger.log('Invoice not found in invoiceStore');
            return {
                result: null,
                error: { code: 'NOT_FOUND', message: 'Invoice not found' },
            };
        }

        return new Promise((resolve, reject) => {
            const unsubscribe = wallet?.lightning.subscribeLnReceive(
                operationId,
                async (state: LnReceiveState) => {
                    if (state === 'claimed') {
                        resolve({
                            result: {
                                invoice: request.invoice || '',
                                amount: 1000,
                                expires_at: 0,
                                metadata: undefined,
                                description: '',
                                description_hash: '',
                                type: 'incoming',
                                fees_paid: 0,
                                created_at: 0,
                                preimage:
                                    '0000000000000000000000000000000000000000000000000000000000000000',
                                payment_hash: operationId,
                                state: 'settled',
                            },
                            error: null,
                        });
                    } else if (typeof state === 'object' && 'canceled' in state) {
                        reject({
                            result: null,
                            error: { code: 'PAYMENT_CANCELLED', message: 'Payment Cancelled' },
                        });
                    }
                },
                (error: any) => {
                    logger.error('Error in subscription:', error);
                    resolve({
                        result: null,
                        error: {
                            code: 'SUBSCRIPTION_ERROR',
                            message: error?.toString() || 'Unknown error',
                        },
                    });
                }
            );

            setTimeout(() => {
                unsubscribe?.();
            }, 300000);
        });
    };

    const monitorInvoicePayment = (
        invoiceData: CreateBolt11Response,
        ndk: NDK,
        signer: NDKSigner,
        walletNostrPubKey: string,
        request: { amount: number; description: string; description_hash: string; expiry: number }
    ) => {
        const unsubscribe = wallet.lightning.subscribeLnReceive(
            invoiceData.operation_id,
            async (state: LnReceiveState) => {
                if (state === 'claimed') {
                    const now = Math.floor(Date.now() / 1000);
                    const notificationData = {
                        type: 'incoming',
                        invoice: invoiceData.invoice,
                        description: request.description || '',
                        preimage:
                            '0000000000000000000000000000000000000000000000000000000000000000',
                        payment_hash: invoiceData.operation_id,
                        amount: request.amount || 1000,
                        fees_paid: 0,
                        created_at: now,
                        expires_at: request.expiry ? now + request.expiry : now + 3600,
                        settled_at: now,
                        metadata: {},
                    };

                    // Publish payment_received notification event (settled)
                    const notificationEvent = new NDKEvent(ndk);
                    notificationEvent.kind = 23194;
                    notificationEvent.tags = [
                        ['p', walletNostrPubKey],
                        ['t', 'payment_received'],
                    ];

                    const notificationContent = {
                        method: 'payment_received',
                        params: {
                            payment_hash: invoiceData.operation_id,
                            amount: notificationData.amount,
                            invoice: invoiceData.invoice,
                            status: 'settled',
                            preimage: notificationData.preimage,
                        },
                    };

                    notificationEvent.content = JSON.stringify(notificationContent);
                    await notificationEvent.sign(signer);
                    await notificationEvent.publish();
                    logger.log(
                        'Published payment_received notification (settled) for invoice:',
                        invoiceData.operation_id
                    );
                }
            }
        );
        setTimeout(() => {
            unsubscribe?.();
        }, 30000);
    };

    return subscription;
};
