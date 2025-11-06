import { useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import { setMode } from '../redux/slices/Mode';
import logger from '../utils/Logger';
import { useWallet } from '../context/WalletManager';
import { setCurrency } from '../redux/slices/Balance';
import { removeWallet } from '@fedimint/core-web';
import { useNavigate } from 'react-router';
import { startProgress, doneProgress } from '../utils/ProgressBar';
import { DownloadTransactionsCSV } from '../services/DownloadQR';
import Alerts from './Alerts';
import { setErrorWithTimeout, setResultWithTimeout } from '../redux/slices/Alerts';
import validate from 'bitcoin-address-validation';
import { getActiveWallets } from '@fedimint/core-web';
import Tippy from '@tippyjs/react';

export default function BasicSettings() {
    const dispatch = useDispatch<AppDispatch>();
    const { metaData } = useSelector((state: RootState) => state.federationdetails);
    const [enabledLocation, setEnabledLocation] = useState(
        localStorage.getItem('locationAccess') === 'true' ? true : false
    );
    const { mode } = useSelector((state: RootState) => state.Mode);
    const { isDebug, toggleDebug } = useWallet();
    const { currency } = useSelector((state: RootState) => state.balance);
    const { error, result } = useSelector((state: RootState) => state.Alert);
    const [autoWithdrawAddress, setAutoWithdrawAddress] = useState<string>(
        localStorage.getItem('autoWithdraw') || ''
    );
    const [isValidAddress, setIsValidAddress] = useState(false);
    const [withdrawalBox, setWithdrawalBox] = useState<boolean>(false);
    const [thresholdAmount, setThresholdAmount] = useState<number>(
        Number(localStorage.getItem('autoWithdrawalAmount')) ||
            metaData?.max_stable_balance_msats ||
            0
    );
    const { walletId, recoveryState } = useSelector((state: RootState) => state.activeFederation);
    const { wallet, switchWallet, getAvailableFederations } = useWallet();
    const [backupRanomData, setBackupRandomData] = useState<string>('');
    const [backupBox, setBackupBox] = useState<boolean>(false);
    const navigate = useNavigate();

    const handleCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedCurrency = e.target.value;
        dispatch(setCurrency(selectedCurrency));
        localStorage.setItem('walletCurrency', selectedCurrency);
    };

    const handleToggleLocation = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.checked;
        if (enabledLocation === true && newValue === false) {
            if (confirm('all the geoLocation data will be removed from your storage')) {
                localStorage.setItem('locationAccess', newValue.toString());
                localStorage.removeItem('paymentLocations');
                setEnabledLocation(newValue);
            }
        } else {
            setEnabledLocation(newValue);
            localStorage.setItem('locationAccess', newValue.toString());
        }
    };

    const handleAutoWithdrawal = (e: React.FormEvent) => {
        e.preventDefault();
        if (autoWithdrawAddress && thresholdAmount) {
            localStorage.setItem('autoWithdrawalValue', autoWithdrawAddress);
            localStorage.setItem('autoWithdrawalAmount', thresholdAmount.toString());
            logger.log('saved!');
            setResultWithTimeout('Saved!');
        }
    };

    const validateAddress = useCallback(() => {
        if (autoWithdrawAddress) {
            try {
                if (validate(autoWithdrawAddress) === true) {
                    setIsValidAddress(true);
                    return true;
                } else {
                    setIsValidAddress(false);
                    return false;
                }
            } catch (err) {
                setIsValidAddress(false);
                logger.log('an error occured while validating', err);
                return false;
            }
        }
    }, [autoWithdrawAddress]);

    useEffect(() => {
        if (autoWithdrawAddress) {
            validateAddress();
        }
    }, [autoWithdrawAddress]);

    const toggleMode = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.checked;
        dispatch(setMode(newValue));
        localStorage.setItem('appMode', JSON.stringify(newValue));
        logger.log('mode toggled');
    };

    const handleLeaveFederations = async () => {
        try {
            startProgress();
            logger.log('wallet cleanup called');
            await removeWallet(walletId);
            const walletInstance = await getActiveWallets();
            if (walletInstance.length > 0) {
                logger.log('switching wallet');
                await switchWallet(walletInstance[0].id);
                getAvailableFederations();
            } else {
                navigate('/');
            }
            dispatch(setResultWithTimeout('Removed Wallet successfully'));
        } catch (err) {
            logger.log('an error occured');
            dispatch(
                setErrorWithTimeout({
                    type: 'Federation Error: ',
                    message: err instanceof Error ? err.message : String(err),
                })
            );
        } finally {
            doneProgress();
        }
    };

    const handleDownloadTransactions = async () => {
        try {
            startProgress();
            const transactions = await wallet.federation.listTransactions();
            DownloadTransactionsCSV(transactions);
        } catch (err) {
            logger.log('an error occured');
            dispatch(
                setErrorWithTimeout({
                    type: 'Transaction Error',
                    message: err instanceof Error ? err.message : String(err),
                })
            );
        } finally {
            doneProgress();
        }
    };

    const handleBackup = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            startProgress();
            const result = await wallet.recovery.backupToFederation({ backupRanomData });
            logger.log('backup result is ', result);
            dispatch(setResultWithTimeout('Wallet backup successfully'));
            setBackupBox(false);
        } catch (err) {
            dispatch(setErrorWithTimeout({ type: 'Backup Error: ', message: `${err}` }));
        } finally {
            doneProgress();
        }
    };

    return (
        <>
            {(error || result) && <Alerts Error={error} Result={result} />}

            {withdrawalBox && (
                <div className="modalOverlay">
                    <div className="createInvoice">
                        <button
                            type="button"
                            className="closeBtn"
                            onClick={() => setWithdrawalBox(false)}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <h2>
                            <i className="fa-solid fa-bolt"></i> Set Invoice Description
                        </h2>
                        <form onSubmit={handleAutoWithdrawal}>
                            <label htmlFor="amountvalue">Enter the external onchain address:</label>
                            <input
                                type="text"
                                id="amountvalue"
                                className="amount-input"
                                value={autoWithdrawAddress}
                                onChange={(e) => setAutoWithdrawAddress(e.target.value)}
                                required
                            />
                            <label>Enter the threshold amount in sat (optional)</label>
                            <input
                                type="numeric"
                                className="amount-input"
                                inputMode="decimal"
                                value={thresholdAmount / 1000}
                                onChange={(e) => setThresholdAmount(Number(e.target.value))}
                            />
                            <button type="submit" disabled={!isValidAddress}>
                                Set
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {backupBox && (
                <div className="modalOverlay">
                    <div className="createInvoice">
                        <button
                            type="button"
                            className="closeBtn"
                            onClick={() => setBackupBox(false)}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <h2>
                            <i className="fa-solid fa-bolt"></i> Backup Wallet
                        </h2>
                        <form onSubmit={handleBackup}>
                            <label htmlFor="amountvalue">Enter any random data:</label>
                            <input
                                type="text"
                                id="amountvalue"
                                className="amount-input"
                                value={backupRanomData}
                                onChange={(e) => setBackupRandomData(e.target.value)}
                                required
                            />
                            <button type="submit">Backup</button>
                        </form>
                    </div>
                </div>
            )}

            <div className="settings-container">
                {/* Federation Information Section */}
                {(metaData?.federation_expiry_timestamp ||
                    metaData?.pinned_message ||
                    metaData?.welcome_message) && (
                    <div className="settings-section">
                        <h2 className="section-title">Federation Information</h2>
                        <div className="info-cards">
                            {metaData?.federation_expiry_timestamp && (
                                <div className="info-card">
                                    <div className="info-header">
                                        <h3>Federation Expiry</h3>
                                    </div>
                                    <div className="info-content">
                                        <p>{metaData.federation_expiry_timestamp}</p>
                                    </div>
                                </div>
                            )}

                            {metaData?.pinned_message && (
                                <div className="info-card">
                                    <div className="info-header">
                                        <h3>Pinned Message</h3>
                                    </div>
                                    <div className="info-content">
                                        <p>{metaData.pinned_message}</p>
                                    </div>
                                </div>
                            )}

                            {metaData?.welcome_message && (
                                <div className="info-card">
                                    <div className="info-header">
                                        <h3>Welcome Message</h3>
                                    </div>
                                    <div className="info-content">
                                        <p>{metaData.welcome_message}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Preferences Section */}
                <div className="settings-section">
                    <h2 className="section-title">Preferences</h2>
                    <div className="settings-grid">
                        <div className="setting-item">
                            <div className="setting-info">
                                <h3>Geolocation</h3>
                                <p>
                                    Fedimint will not track users data. Location will be saved
                                    locally.
                                </p>
                            </div>
                            <div className="setting-control">
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={enabledLocation}
                                        onChange={handleToggleLocation}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="setting-item">
                            <div className="setting-info">
                                <h3>Theme</h3>
                                <p>Enable {mode === true ? 'Light' : 'Dark'} mode</p>
                            </div>
                            <div className="setting-control">
                                <label className="toggle-switch">
                                    <input type="checkbox" checked={mode} onChange={toggleMode} />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="setting-item">
                            <div className="setting-info">
                                <h3>Developer Mode</h3>
                                <p>{isDebug === true ? 'Disable' : 'Enable'} Developer mode</p>
                            </div>
                            <div className="setting-control">
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={isDebug}
                                        onChange={toggleDebug}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div
                            className="setting-item auto-withdrawal"
                            onClick={() => setWithdrawalBox(true)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="setting-info">
                                <h3>Auto Withdraw to External Address</h3>
                                <p>
                                    Enabling auto withdraw will auto withdraw the amount to external
                                    address if amount increased from the max stable balance of
                                    federation
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Configuration Section */}
                <div className="settings-section">
                    <h2 className="section-title">Configuration</h2>
                    <div className="config-grid">
                        <div className="config-item">
                            <label className="config-label">Display Currency</label>
                            <select
                                className="config-select"
                                value={currency}
                                onChange={handleCurrencyChange}
                            >
                                <option value={'msat'}>msat</option>
                                <option value={'sat'}>sat</option>
                                <option value={'usd'}>USD</option>
                                <option value={'euro'}>EURO</option>
                            </select>
                        </div>

                        <div className="config-item">
                            <label className="config-label">Export Transactions</label>
                            <button className="export-btn" onClick={handleDownloadTransactions}>
                                <i className="fa-solid fa-download"></i>
                                Export
                            </button>
                        </div>
                    </div>
                </div>

                {/* Federations Section */}
                <div className="settings-section">
                    <h2 className="section-title">Federations</h2>
                    <div className="federation-container">
                        {metaData && (
                            <div className="federation-card">
                                <div className="federation-info">
                                    <h3>{metaData.federation_name}</h3>
                                </div>
                                <div className="federation-actions">
                                    <button
                                        className="leave-btn"
                                        onClick={handleLeaveFederations}
                                        title="Leave Federation"
                                    >
                                        <i className="fa-solid fa-arrow-right-from-bracket"></i>
                                        Leave
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="settings-section">
                    <h2 className="section-title">Backup & Recovery</h2>
                    <div className="settings-grid">
                        <div className="setting-item">
                            <div className="setting-info">
                                <Tippy content="None of the wallet operation can be performed while recovery">
                                    <h3>
                                        Recovery <i className="fa-solid fa-info-circle"></i>
                                    </h3>
                                </Tippy>
                                {recoveryState.status ? (
                                    <p>Recovery is in progress</p>
                                ) : (
                                    <p>No recovery is in progress</p>
                                )}
                            </div>
                        </div>
                        <div
                            className="setting-item"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setBackupBox(true)}
                        >
                            <div className="setting-info">
                                <h3>Backup</h3>
                                <p>
                                    Want to backup your Wallet? Don't worry its all secure and
                                    private on federation guardians
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
