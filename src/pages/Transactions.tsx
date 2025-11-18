import { useEffect, useState, useContext } from 'react';
import { useLocation } from 'react-router';
import { useWallet } from '../context/WalletManager';
import Alerts from '../components/Alerts';
import { startProgress, doneProgress } from '../utils/ProgressBar';
import LoadingContext from '../context/Loading';
import type { Transactions } from '@fedimint/core-web';
import type { OnchainTxDetail, Transaction } from '../hooks/wallet.type';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import { useNavigate } from 'react-router';
import { setErrorWithTimeout, setResultWithTimeout } from '../redux/slices/Alerts';
import { updateBalanceFromMsat } from '../redux/slices/Balance';
import {
    fetchTransactions,
    resetTransactions,
    exitSearchMode,
    searchTransaction,
} from '../redux/slices/TransactionSlice';
import logger from '../utils/Logger';
import noDataFound from '../assets/no-data-found.png';
import mempoolJS from '@mempool/mempool.js';
import type { WalletDepositState } from '@fedimint/core-web';
import { getTxidFromOutPoint } from '../services/OnChainService';

export default function Transactions() {
    const id = new URLSearchParams(useLocation().search).get('id');
    logger.log('id in transaction is', id);
    const dispatch = useDispatch<AppDispatch>();
    const { wallet } = useWallet();
    const navigate = useNavigate();
    const { setLoader } = useContext(LoadingContext);
    const [query, setQuery] = useState<string>(id || '');
    // const [totalSpending, setTotalSpending] = useState<number>(0)
    // const [totalRecieve, setTotalRecieve] = useState<number>(0)
    const { walletId, recoveryState } = useSelector((state: RootState) => state.activeFederation);
    // const [txBalance, setTxBalance] = useState(0)
    // const [txBalanceType, setTxBalanceType] = useState<'positive' | 'negative' | 'neutral' | null>(null)
    const { error } = useSelector((state: RootState) => state.Alert);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const { hasMore, transactions, isFetching, lastSeen } = useSelector(
        (state: RootState) => state.transaction
    );
    const [onchainDetails, setOnchainDetails] = useState<Record<string, OnchainTxDetail>>({});
    const [depositStates, setDepositStates] = useState<
        Record<string, { state: WalletDepositState; txid?: string }>
    >({});
    const limit = 5;
    document.title = 'Haze Wallet | Transactions';

    useEffect(() => {
        if (query.trim() !== '') {
            if (!recoveryState.status) {
                dispatch(resetTransactions());
                dispatch(searchTransaction({ query, wallet }));
            }
        } else {
            if (!recoveryState.status) {
                dispatch(resetTransactions());
                dispatch(exitSearchMode());
                dispatch(fetchTransactions({ limit, wallet }));
            }
        }
    }, [query, wallet, walletId, id]);

    const handleLoadMore = () => {
        if (hasMore) {
            dispatch(fetchTransactions({ limit: 5, lastSeen, wallet }));
        } else {
            dispatch(fetchTransactions({ limit: limit, wallet }));
        }
    };

    const toggleExpanded = (id: string) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };

    const CancelNotes = async (op: string) => {
        try {
            startProgress();
            await wallet.mint.tryCancelSpendNotes(op);
            dispatch(setResultWithTimeout('Note Reclaimed'));
            const msat = await wallet.balance.getBalance();
            updateBalanceFromMsat(msat);
        } catch (err) {
            dispatch(setErrorWithTimeout({ type: 'Cancel Notes: ', message: `${err}` }));
        } finally {
            doneProgress();
        }
    };

    const fetchOnchainTxDetail = async (op: string) => {
        try {
            setLoader(true);
            const {
                bitcoin: { transactions },
            } = mempoolJS({
                hostname: 'mempool.space',
            });

            const result = await transactions.getTx({ txid: `${op}` });
            console.log(result);

            setOnchainDetails((prev) => ({
                ...prev,
                [op]: result,
            }));
        } catch (err) {
            dispatch(setErrorWithTimeout({ type: 'Onchain Error', message: `${err}` }));
        } finally {
            setLoader(false);
        }
    };

    const renderOnchainTxDetail = (txid: string) => {
        const txDetail = onchainDetails[txid];
        return (
            <div style={{ padding: '10px' }}>
                <button className="primary-btn" onClick={() => fetchOnchainTxDetail(txid)}>
                    <i className="fa-solid fa-circle-info"></i> Fetch Onchain Details
                </button>

                {txDetail && (
                    <div className="pegout-details-grid">
                        <div className="pegout-detail">
                            <strong>Actual Fee:</strong> {txDetail.fee} sats
                        </div>
                        <div className="pegout-detail">
                            <strong>Lock Time:</strong>{' '}
                            {txDetail.status.block_time
                                ? new Date(txDetail.status.block_time * 1000).toLocaleString()
                                : 'N/A'}
                        </div>
                        <div className="pegout-detail">
                            <strong>Status:</strong>{' '}
                            {txDetail.status.confirmed ? 'Confirmed' : 'Unconfirmed'}
                        </div>
                        <div className="pegout-detail">
                            <strong>Block Height:</strong>{' '}
                            {txDetail.status.block_height ?? 'Pending'}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderManageTx = (tx: Transaction) => {
        if (tx.kind === 'mint' && tx.type === 'spend_oob' && tx.outcome === 'created') {
            return (
                <div style={{ padding: '10px' }}>
                    <p>
                        <i className="fa-solid fa-circle-info"></i> Do not want to spend? Reclaim
                        notes
                    </p>
                    <button className="primary-btn" onClick={() => CancelNotes(tx.operationId)}>
                        <i className="fa-solid fa-recycle"></i> Reclaim Notes
                    </button>
                </div>
            );
        } else if (tx.kind === 'wallet') {
            if (tx.type === 'deposit') {
                const depositState = depositStates[tx.operationId];

                return (
                    <div style={{ padding: '10px' }}>
                        {depositState && depositState.txid && (
                            <>{renderOnchainTxDetail(depositState.txid)}</>
                        )}
                    </div>
                );
            } else if (tx.type === 'withdraw') {
                // Handle withdraw transactions
                return null;
            }
        }
        return null;
    };

    useEffect(() => {
        const subscriptions: (() => void)[] = [];

        transactions.forEach((tx) => {
            if (tx.kind === 'wallet' && tx.type === 'deposit') {
                const unsubscribe = wallet.wallet.subscribeDeposit(
                    tx.operationId,
                    (state: WalletDepositState) => {
                        if (typeof state === 'object') {
                            let txid: string | undefined;

                            if ('WaitingForConfirmation' in state) {
                                txid = getTxidFromOutPoint(
                                    state.WaitingForConfirmation.btc_out_point
                                );
                            } else if ('Confirmed' in state) {
                                txid = getTxidFromOutPoint(state.Confirmed.btc_out_point);
                            } else if ('Claimed' in state) {
                                txid = getTxidFromOutPoint(state.Claimed.btc_out_point);
                                logger.log('claimed state in activities is', txid, state);
                            }

                            if (txid) {
                                setDepositStates((prev) => ({
                                    ...prev,
                                    [tx.operationId]: { state, txid },
                                }));
                            }
                        }
                    },
                    (error: string) => {
                        logger.log('An error occurred while fetching state', error);
                    }
                );

                subscriptions.push(() => {
                    setTimeout(() => {
                        unsubscribe?.();
                    }, 10000);
                });
            }
        });

        return () => {
            subscriptions.forEach((cleanup) => cleanup());
        };
    }, [transactions, wallet]);

    return (
        <>
            {error && <Alerts key={Date.now()} Error={error} Result={''} />}

            <header className="sticky-header">
                <button className="back-button" onClick={() => navigate('/wallet')}>
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="header-title">Transactions</h1>
            </header>

            <section className="activities-wrapper">
                <div className="activities-container">
                    <div className="activities-header">
                        <div className="header-content">
                            <div className="header-icon">
                                <i className="fa-solid fa-clock-rotate-left"></i>
                            </div>
                            <h1 className="activities-title">Transaction history</h1>
                            <p className="subtitle">Track and manage your transactions</p>
                        </div>
                    </div>

                    {/* Search Section */}
                    <div className="search-section">
                        <div className="search-container">
                            <div className="search-icon">
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="M21 21l-4.35-4.35" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                placeholder="Search transactions..."
                                className="search-input"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {!isFetching ? (
                        <div className="transaction-section">
                            {transactions.length > 0 ? (
                                <ul className="transaction-item">
                                    {transactions.map((tx, key) => {
                                        const isPositive = [
                                            'receive',
                                            'reissue',
                                            'deposit',
                                        ].includes(tx.type);
                                        const isNegative = [
                                            'pay',
                                            'spend_oob',
                                            'withdraw',
                                        ].includes(tx.type);
                                        return (
                                            <div key={tx.operationId || key}>
                                                <li
                                                    className="transaction-main"
                                                    onClick={() => toggleExpanded(tx.operationId)}
                                                >
                                                    <div className="transaction-left">
                                                        <div
                                                            className={`transaction-icon ${isPositive ? 'received' : 'sent'}`}
                                                        >
                                                            {isPositive ? (
                                                                <i className="fa-solid fa-arrow-down"></i>
                                                            ) : (
                                                                <i className="fa-solid fa-arrow-up"></i>
                                                            )}
                                                        </div>
                                                        <div className="transaction-info">
                                                            <h3 className="transaction-type">
                                                                {tx.type.toUpperCase()}
                                                            </h3>
                                                            <p className="transaction-time">
                                                                {tx.timestamp}
                                                            </p>
                                                            <span className="transaction-method">
                                                                {tx.kind === 'mint'
                                                                    ? 'ecash'
                                                                    : tx.kind === 'wallet'
                                                                      ? 'onchain'
                                                                      : 'lightning'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="transaction-right">
                                                        <div className="transaction-amount-section">
                                                            <p
                                                                className={`transaction-amount ${isPositive ? 'positive' : isNegative ? 'negative' : ''}`}
                                                            >
                                                                {isPositive
                                                                    ? '+'
                                                                    : isNegative
                                                                      ? '-'
                                                                      : ''}
                                                                {tx.amountMsats} sat
                                                            </p>
                                                            {tx.outcome && (
                                                                <span
                                                                    className={`transaction-status ${tx.outcome === 'success' || tx.outcome === 'claimed' ? 'success' : 'failed'}`}
                                                                >
                                                                    {tx.outcome}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button className="expand-button">
                                                            <svg
                                                                className={`expand-icon ${expandedId === tx.operationId ? 'expanded' : ''}`}
                                                                width="16"
                                                                height="16"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                            >
                                                                <path d="M6 9l6 6 6-6" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </li>

                                                {expandedId === tx.operationId && (
                                                    <div className="transaction-details">
                                                        <div className="details-container">
                                                            <div className="details-row">
                                                                <div className="detail-group">
                                                                    <span className="detail-label">
                                                                        Transaction Type
                                                                    </span>
                                                                    <span className="detail-value">
                                                                        {tx.kind}
                                                                    </span>
                                                                </div>
                                                                <div className="detail-group">
                                                                    <span className="detail-label">
                                                                        Operation ID
                                                                    </span>
                                                                    <span className="detail-value">
                                                                        {tx.operationId}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="details-row">
                                                                <div className="detail-group">
                                                                    <span className="detail-label">
                                                                        Status
                                                                    </span>
                                                                    <span
                                                                        className={`detail-value status-${tx.outcome === 'success' || tx.outcome === 'claimed' ? 'success' : 'failed'}`}
                                                                    >
                                                                        {tx.outcome}
                                                                    </span>
                                                                </div>
                                                                {tx.fee && (
                                                                    <div className="detail-group">
                                                                        <span className="detail-label">
                                                                            Network Fees
                                                                        </span>
                                                                        <span className="detail-value">
                                                                            {tx.fee / 1000}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="details-row">
                                                                {tx.onchainAddress && (
                                                                    <div className="detail-group">
                                                                        <span className="detail-label">
                                                                            Onchain Address
                                                                        </span>
                                                                        <span
                                                                            className={`detail-value`}
                                                                        >
                                                                            {tx.onchainAddress}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {tx.invoice && (
                                                                    <div className="detail-group full-width">
                                                                        <span className="detail-label">
                                                                            Invoice
                                                                        </span>
                                                                        <span className="detail-value hash">
                                                                            {tx.invoice}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {renderManageTx(tx)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <img src={noDataFound} style={{ width: '30%' }} alt="" />
                                    <p style={{ textAlign: 'center' }}>No Transactions found</p>
                                </div>
                            )}
                            {hasMore === true && (
                                <div className="pagination-container">
                                    <button
                                        className="pagination-button"
                                        disabled={isFetching}
                                        onClick={() => handleLoadMore()}
                                    >
                                        {isFetching
                                            ? 'Loading...'
                                            : hasMore
                                              ? 'Load More'
                                              : 'show less'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p style={{ textAlign: 'center' }}>Fetching transactions...</p>
                    )}
                </div>
            </section>
        </>
    );
}
