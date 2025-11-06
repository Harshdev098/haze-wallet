import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useWallet } from '../context/WalletManager';
import type { LnPayState, LnReceiveState, Transactions } from '@fedimint/core-web';
import type { InvoiceState } from '../hooks/wallet.type';
import { startProgress, doneProgress } from '../utils/ProgressBar';
import { setInvoiceExpiry } from '../redux/slices/LightningPayment';
import Alerts from '../components/Alerts';
import logger from '../utils/Logger';
import '../style/Invoice.css';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import { setErrorWithTimeout } from '../redux/slices/Alerts';

export default function Invoices() {
    const invoiceExpiryOptions = [
        { value: 5, option: '5 min' },
        { value: 10, option: '10 min' },
        { value: 20, option: '20 min' },
        { value: 30, option: '30 min' },
        { value: 40, option: '40 min' },
        { value: 60, option: '60 min' },
    ];
    const [invoiceStateList, setInvoiceStateList] = useState<InvoiceState[]>([]);
    const [invoicePendingList, setInvoicePendingList] = useState<InvoiceState[]>([]);
    const [stateFilter, setStateFilter] = useState<string>('all');
    const { walletId, recoveryState } = useSelector((state: RootState) => state.activeFederation);
    const { invoiceExpiry } = useSelector((state: RootState) => state.Lightning);
    const { mode } = useSelector((state: RootState) => state.Mode);
    const { wallet } = useWallet();
    const dispatch = useDispatch<AppDispatch>();
    const { error } = useSelector((state: RootState) => state.Alert);
    const [currentPage, setCurrentPage] = useState(1);
    const pageLimint = 5;

    const handleInvoiceExpiry = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        const match = value.match(/\d+/);
        const numericValue = match ? match[0] : '';
        setInvoiceExpiry(Number(numericValue));
        localStorage.setItem('InvoiceExpiryTime', numericValue);
    };

    const handleState = (
        prev: InvoiceState[],
        currentState: string,
        invoice: string,
        operationId: string,
        timeStamp: string
    ) => {
        const existingInvoice = prev.find((inv) => inv.invoiceId === invoice);
        let location: { latitude: number; longitude: number } | null = null;

        if (localStorage.getItem('locationAccess') === 'true') {
            const storedLocations = localStorage.getItem('paymentLocations');
            if (storedLocations) {
                try {
                    const locations = JSON.parse(storedLocations);
                    if (locations[invoice]) {
                        location = locations[invoice];
                    }
                } catch (error) {
                    logger.error('Error parsing paymentLocations:', error);
                }
            }
        }

        if (existingInvoice) {
            return prev.map((inv) =>
                inv.invoiceId === invoice ? { ...inv, status: currentState } : inv
            );
        } else {
            const newInvoice: InvoiceState = {
                invoiceId: invoice,
                timestamp: timeStamp,
                operationId: operationId,
                status: currentState,
                location: location,
            };
            return [...prev, newInvoice];
        }
    };

    const handleInvoice = async () => {
        startProgress();
        try {
            let currentState: string;
            const tx = await wallet.federation.listTransactions();
            if (tx.length > 0) {
                logger.log('transactions ', tx);
                tx.forEach((transaction: Transactions) => {
                    if (transaction.kind === 'ln' && transaction.type === 'receive') {
                        const { invoice, operationId, timestamp } = transaction;

                        const unsubscribe = wallet.lightning.subscribeLnReceive(
                            transaction.operationId,
                            async (state: LnReceiveState) => {
                                if (state === 'funded' || state === 'claimed') {
                                    currentState = state;
                                } else if (
                                    typeof state === 'object' &&
                                    'waiting_for_payment' in state
                                ) {
                                    currentState = 'waiting_for_payment';
                                } else if (typeof state === 'object' && 'canceled' in state) {
                                    currentState = 'canceled';
                                }
                                if (currentState) {
                                    setInvoiceStateList((prev) =>
                                        handleState(
                                            prev,
                                            currentState,
                                            invoice,
                                            operationId,
                                            new Date(timestamp).toLocaleString()
                                        )
                                    );
                                }
                            },
                            (error: string) => {
                                logger.log('an error occured', error);
                            }
                        );
                        setTimeout(() => {
                            unsubscribe?.();
                        }, 600000);
                    } else if (transaction.kind === 'ln' && transaction.type === 'send') {
                        const { invoice, operationId, timestamp } = transaction;

                        const unsubscribe = wallet.lightning.subscribeLnPay(
                            transaction.operationId,
                            async (state: LnPayState) => {
                                if (state === 'created' || state === 'awaiting_change') {
                                    currentState = state;
                                } else if (typeof state === 'object' && 'success' in state) {
                                    currentState = 'success';
                                } else if (typeof state === 'object' && 'canceled' in state) {
                                    currentState = 'canceled';
                                }
                                if (currentState) {
                                    setInvoicePendingList((prev) =>
                                        handleState(
                                            prev,
                                            currentState,
                                            invoice,
                                            operationId,
                                            new Date(timestamp).toLocaleString()
                                        )
                                    );
                                }
                            },
                            (error: string) => {
                                logger.log('an error occured', error);
                            }
                        );
                        setTimeout(() => {
                            unsubscribe?.();
                        }, 600000);
                    }
                });
            }
        } catch (err) {
            logger.log('an error occured');
            dispatch(setErrorWithTimeout({ type: 'Invoice Error: ', message: String(err) }));
        } finally {
            doneProgress();
        }
    };

    const handleFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setStateFilter(e.target.value);
    };

    useEffect(() => {
        if (!recoveryState.status) {
            handleInvoice();
        }
    }, [walletId, wallet]);

    return (
        <>
            {error && <Alerts Error={error} />}
            <header className="sticky-header">
                <button className="back-button" onClick={() => window.history.back()}>
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
                <h1 className="header-title">Invoices</h1>
            </header>
            <section className="activities-wrapper">
                <div className="activities-container">
                    <div className="activities-header">
                        <div className="header-content">
                            <div className="header-icon">
                                <i className="fa-solid fa-clock-rotate-left"></i>
                            </div>
                            <h1 className="activities-title">Your Created Invoices</h1>
                            <p className="subtitle">Track & view pending and active invoices</p>
                        </div>
                    </div>
                    <div className="search-section">
                        <div className="expiry-select">
                            <label htmlFor="expiry">Invoice Expiry:</label>
                            <select
                                id="expiry"
                                value={invoiceExpiry}
                                onChange={handleInvoiceExpiry}
                            >
                                {invoiceExpiryOptions.map((option, index) => (
                                    <option key={index} value={option.value}>
                                        {option.option}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="expiry-select">
                            <label htmlFor="states">Filter by Status:</label>
                            <select id="states" value={stateFilter} onChange={handleFilter}>
                                <option value="all">All</option>
                                <option value="claimed">claimed</option>
                                <option value="pending">pending</option>
                                <option value="canceled">canceled</option>
                            </select>
                        </div>
                    </div>

                    <div className="transaction-section">
                        <div className="invoice-table-section">
                            <table className={`invoice-table ${mode === true ? 'DarkMode' : ''}`}>
                                <thead>
                                    <tr>
                                        <th>S.No</th>
                                        <th>TimeStamp</th>
                                        <th>Invoice ID</th>
                                        <th>Operation ID</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoiceStateList.length > 0 ? (
                                        invoiceStateList
                                            .filter((inv) => {
                                                if (stateFilter === 'all') return true;
                                                if (stateFilter === 'pending') {
                                                    return (
                                                        inv.status === 'waiting_for_payment' ||
                                                        inv.status === 'awaiting_funds'
                                                    );
                                                }
                                                return inv.status === stateFilter;
                                            })
                                            .slice(
                                                (currentPage - 1) * pageLimint,
                                                currentPage * pageLimint
                                            )
                                            .map((inv, id) => (
                                                <tr key={pageLimint * (currentPage - 1) + id + 1}>
                                                    <td>
                                                        {pageLimint * (currentPage - 1) + id + 1}
                                                    </td>
                                                    <td>{inv.timestamp}</td>
                                                    <td>{inv.invoiceId.slice(0, 60)}...</td>
                                                    <td>{inv.operationId}</td>
                                                    <td>
                                                        <span className="status active">
                                                            {inv.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                    ) : (
                                        <tr style={{ padding: '4px' }}>No invoices found</tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="pagination-btn">
                            <button
                                className="pagination-button"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(currentPage - 1)}
                            >
                                Prev
                            </button>
                            <span className="pagination-info">Page {currentPage}</span>
                            <button
                                className="pagination-button"
                                disabled={currentPage * pageLimint >= invoiceStateList.length}
                                onClick={() => setCurrentPage(currentPage + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="activities-wrapper">
                <div className="activities-container">
                    <div className="activities-header">
                        <div className="header-content">
                            <div className="header-icon">
                                <i className="fa-solid fa-clock-rotate-left"></i>
                            </div>
                            <h1 className="activities-title">Paid invoice payments</h1>
                            <p className="subtitle">Track & view your paid invoices</p>
                        </div>
                    </div>
                    <div className="transaction-section">
                        <div className="invoice-table-section">
                            <h2>Paid Invoice Payments</h2>
                            <table className={`invoice-table ${mode === true ? 'DarkMode' : ''}`}>
                                <thead>
                                    <tr>
                                        <th>S.No</th>
                                        <th>TimeStamp</th>
                                        <th>Invoice ID</th>
                                        <th>Operation ID</th>
                                        <th>Status</th>
                                        {localStorage.getItem('locationAccess') === 'true' && (
                                            <th>Location</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoicePendingList.length > 0 ? (
                                        invoicePendingList
                                            .slice(
                                                (currentPage - 1) * pageLimint,
                                                currentPage * pageLimint
                                            )
                                            .map((inv, id) => (
                                                <tr key={pageLimint * (currentPage - 1) + id + 1}>
                                                    <td>
                                                        {pageLimint * (currentPage - 1) + id + 1}
                                                    </td>
                                                    <td>{inv.timestamp}</td>
                                                    <td>{inv.invoiceId.slice(0, 60)}...</td>
                                                    <td>{inv.operationId}</td>
                                                    <td>
                                                        <span className="status active">
                                                            {inv.status}
                                                        </span>
                                                    </td>
                                                    {localStorage.getItem('locationAccess') ===
                                                        'true' && (
                                                        <td>
                                                            {inv.location ? (
                                                                <Link
                                                                    to={`https://www.google.com/maps/place/${inv.location.latitude},${inv.location.longitude}`}
                                                                    target="_blank"
                                                                >
                                                                    See on GMap
                                                                </Link>
                                                            ) : (
                                                                'N/A'
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))
                                    ) : (
                                        <tr>No invoices found</tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="pagination-btn">
                            <button
                                className="pagination-button"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(currentPage - 1)}
                            >
                                Prev
                            </button>
                            <span className="pagination-info">Page {currentPage}</span>
                            <button
                                className="pagination-button"
                                disabled={currentPage * pageLimint >= invoiceStateList.length}
                                onClick={() => setCurrentPage(currentPage + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}

{
    /* <table className="invoice-table">
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>TimeStamp</th>
                                <th>Invoice ID</th>
                                <th>Operation ID</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* {invoiceStateList.filter(inv => {
                                if (stateFilter === 'all') return true;
                                if (stateFilter === 'pending') {
                                    return (
                                        inv.status === 'waiting_for_payment' ||
                                        inv.status === 'awaiting_funds'
                                    );
                                }
                                return inv.status === stateFilter;
                            }).slice((currentPage - 1) * pageLimint, currentPage * pageLimint)
                                .map((inv, id) => (
                                    <tr key={pageLimint * (currentPage - 1) + id + 1}>
                                        <td>{pageLimint * (currentPage - 1) + id + 1}</td>
                                        <td>{inv.timestamp}</td>
                                        <td>{inv.invoiceId.slice(0, 60)}...</td>
                                        <td>{inv.operationId}</td>
                                        <td><span className="status active">{inv.status}</span></td>
                                    </tr>
                                ))}
                        </tbody>
                    </table> */
}

{
    /* <table className="invoice-table">
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>TimeStamp</th>
                                <th>Invoice ID</th>
                                <th>Operation ID</th>
                                <th>Status</th>
                                {localStorage.getItem('locationAccess')==='true' && <th>Location</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {/* {invoicePendingList.slice((currentPage - 1) * pageLimint, currentPage * pageLimint)
                                .map((inv, id) => (
                                    <tr key={pageLimint * (currentPage - 1) + id + 1}>
                                        <td>{pageLimint * (currentPage - 1) + id + 1}</td>
                                        <td>{inv.timestamp}</td>
                                        <td>{inv.invoiceId.slice(0, 60)}...</td>
                                        <td>{inv.operationId}</td>
                                        <td><span className="status active">{inv.status}</span></td>
                                        {localStorage.getItem('locationAccess')==='true' && (
                                            <td>
                                                {inv.location
                                                    ? <Link to={`https://www.google.com/maps/place/${inv.location.latitude},${inv.location.longitude}`} target='_blank'>See on GMap</Link>
                                                    : 'N/A'}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                        </tbody>
                    </table> */
}
