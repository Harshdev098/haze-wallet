import { useState, useContext } from 'react';
import NostrContext from '../context/Nostr';
import '../style/Settings.css';
import Tippy from '@tippyjs/react';

export default function NostrSettings() {
    const [autoPay, setAutoPay] = useState(
        localStorage.getItem('autoPayNostr') === 'true' ? true : false
    );
    const [relayUrl, setRelayURL] = useState('');
    const {
        nwcEnabled,
        nwcURL,
        generateNWCConnection,
        connectionStatus,
        NostrAppName,
        NostrRelay,
        updateRelay,
        setNostrAppName,
        setNostrRelay,
    } = useContext(NostrContext);
    const [OpenInvoiceDescription, setOpenInvoiceDescription] = useState<boolean>(false);
    const [description, setDescription] = useState<string>('');

    const isValidRelayUrl = (url: string): boolean => {
        const regex = /^wss?:\/\/[^\s/$.?#].[^\s]*$/i;
        return regex.test(url);
    };

    const handleConfigureRelay = (e: React.FormEvent) => {
        e.preventDefault();

        if (!isValidRelayUrl(relayUrl)) {
            alert('Invalid WebSocket relay URL format.');
            return;
        }

        const alreadyExists = connectionStatus.some((cs) => cs.relay === relayUrl);

        if (relayUrl && !alreadyExists) {
            updateRelay(relayUrl);
            setRelayURL('');
        } else if (alreadyExists) {
            alert('Relay already exists in your connection list.');
        }
    };

    const handleAutoNostrPay = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.checked;
        setAutoPay(newValue);
        localStorage.setItem('autoPayNostr', newValue.toString());
    };

    const handleSetInvoiceDescription = () => {
        localStorage.setItem('description', description);
        setOpenInvoiceDescription(false);
    };

    return (
        <>
            {OpenInvoiceDescription && (
                <div className="modalOverlay">
                    <div className="createInvoice">
                        <button
                            type="button"
                            className="closeBtn"
                            onClick={() => setOpenInvoiceDescription(false)}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <h2>
                            <i className="fa-solid fa-bolt"></i> Set Invoice Description
                        </h2>
                        <form onSubmit={handleSetInvoiceDescription}>
                            <label htmlFor="amountvalue">Enter invoice description:</label>
                            <div className="input-group">
                                <input
                                    type="text"
                                    id="amountvalue"
                                    className="amount-input"
                                    value={localStorage.getItem('description') || description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    required
                                />
                            </div>
                            <button type="submit">Set</button>
                        </form>
                    </div>
                </div>
            )}
            <div className="settings-container">
                {/* Nostr Wallet Connect Section */}
                <div className="settings-section">
                    <h2 className="section-title">Nostr Wallet Connect</h2>

                    {nwcURL.length > 0 && (
                        <div className="connection-list">
                            <h3 className="subsection-title">Active Connections</h3>
                            <div className="connection-cards">
                                {nwcURL.map((uri, idx) => (
                                    <div key={idx} className="connection-card">
                                        <div className="connection-header">
                                            <h4 className="app-name" style={{ margin: '4px' }}>
                                                {uri.appName}
                                            </h4>
                                        </div>
                                        <div className="connection-uri">
                                            <p className="uri-text">{uri.nwcUri || uri.relay}</p>
                                            {uri.nwcUri && (
                                                <button
                                                    className="copy-btn"
                                                    onClick={() =>
                                                        navigator.clipboard.writeText(
                                                            uri.nwcUri || ''
                                                        )
                                                    }
                                                >
                                                    <i className="fa-solid fa-copy"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="status-info">
                        {nwcEnabled ? (
                            <div className="status-message success">
                                <i className="fa-solid fa-check-circle"></i>
                                Auto payment is enabled by default
                            </div>
                        ) : (
                            <div className="status-message info">
                                <i className="fa-solid fa-info-circle"></i>
                                Nostr Wallet Connect will be enabled with Generating and connecting
                                the client app
                            </div>
                        )}
                    </div>

                    <div className="connection-form">
                        <h3 className="subsection-title">Generate New Connection</h3>
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Client App Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter the client app name"
                                    value={NostrAppName}
                                    onChange={(e) => setNostrAppName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    Preferred Relay (Optional)
                                    <Tippy content="Only give a relay which client app is using to handle payments & connection">
                                        <i className="fa-solid fa-info-circle"></i>
                                    </Tippy>
                                </label>

                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter the preferred relay for the client app"
                                    value={NostrRelay ?? ''}
                                    onChange={(e) => setNostrRelay(e.target.value)}
                                />

                                <p className="title-span">
                                    You can give a preferred relay for the specific app, wallet will
                                    use a getalby relay as default to generate the URI
                                </p>
                            </div>

                            <button
                                className="form-submit-btn"
                                onClick={() =>
                                    generateNWCConnection(NostrAppName, NostrRelay ?? undefined)
                                }
                            >
                                <i className="fa-solid fa-link"></i>
                                Generate Nostr Connection Link
                            </button>
                        </div>
                    </div>
                </div>

                {/* Nostr Relays Section */}
                <div className="settings-section">
                    <h2 className="section-title">Nostr Relays</h2>

                    {connectionStatus.length > 0 && (
                        <div className="relay-list">
                            <h3 className="subsection-title">Configured Relays</h3>
                            <div className="relay-cards">
                                {connectionStatus.map((relay, id) => (
                                    <div key={id} className="relay-card">
                                        <div className="relay-url">
                                            <i className="fa-solid fa-server"></i>
                                            <span>{relay.relay}</span>
                                        </div>
                                        <div
                                            className={`relay-status ${relay.status === 'connected' ? 'active' : 'inactive'}`}
                                        >
                                            <span
                                                className={`status-dot ${relay.status === 'connected' ? 'active' : 'inactive'}`}
                                            ></span>
                                            {relay.status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="relay-form">
                        <h3 className="subsection-title">Add New Relay</h3>
                        <div className="add-relay-form">
                            <div className="form-group">
                                <label className="form-label">Relay URL</label>
                                <div className="input-group">
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Enter the relay url"
                                        onChange={(e) => setRelayURL(e.target.value)}
                                    />
                                    <button className="add-btn" onClick={handleConfigureRelay}>
                                        <i className="fa-solid fa-plus"></i>
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Auto Payments Section */}
                <div className="settings-section">
                    <h2 className="section-title">Payment Settings</h2>
                    <div className="settings-grid">
                        <div className="setting-item">
                            <div className="setting-info">
                                <h3>Auto Nostr Payments</h3>
                                <p>Enable automatic Nostr payments for connected applications</p>
                            </div>
                            <div className="setting-control">
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={autoPay}
                                        onChange={handleAutoNostrPay}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div
                            className="setting-item"
                            onClick={() => setOpenInvoiceDescription(true)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="setting-info">
                                <h3>Set Default Invoice Description</h3>
                                <p>
                                    Your Invoices will use this description by default. You can
                                    override it on case-by-case basis
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
