# 🌐 Haze Wallet

Are you a *privacy-conscious* person who wants to *custody Bitcoin* in a *decentralized* way?  
*Haze Wallet* is a browser-based Bitcoin wallet built on the [Fedimint Web SDK](https://github.com/fedimint/fedimint-web-sdk).  
It enables you to *custody* and *transact Bitcoin* using *Chaumian Ecash* in a *federated, **privacy-preserving* way — all *without installing extra software*.

> 🔐 Custody Bitcoin with ease and privacy — you control your funds, your community, your future.

---

## 🏛 About Fedimint

[Fedimint](https://github.com/fedimint/fedimint) is a *modular system* for building federated applications, designed to be:

- *🛡 Trust-minimized* – You control your funds with federation consensus.  
- *🚫 Censorship-resistant* – No single point of control.  
- *👤 Private* – Transactions can’t be linked back to you.

---

## ✨ Features

- 🔍 *Discover & Join Federations*  
  Join a federation using an invite code/QR or discover available federations instantly.
  
- 👁 *Preview Before Joining*  
  View full federation details, guardian info, and federation health.
  
- 💸 *Multiple Payment Methods*  
  - Lightning Network  
  - On-chain Bitcoin transactions  
  - Ecash transactions

- 📊 *Comprehensive Federation Insights*  
  See guardian availability, federation health, and service status.
  
- 🌐 *Multi-Federation Support*  
  Join and manage multiple federations at once.
  
- 📜 *Transaction Management*  
  View full transaction history, manage invoices (paid & pending), and export transactions.
  
- ♻ *Backup & Recovery*  
  Securely backup and restore your wallet.
  
- 🔗 *NIP-47 Integration* (Nostr Wallet Connect)  
  Connect your client to the wallet via NWC URI to send and receive payments.
  
- ⚙ Other useful features:
  - Auto nostr payments, auto withdrawal to an external address
  - Enabling GeoLocation, themes, developer mode according to preferences
  - Change the display currency, export transactions, setting a invoice desription
  - PWA enabled

## 🛠 Technical Stack

- ⚡ The project uses Vite + React + Typescript.
- 🏦 [Fedimint-web-sdk](https://github.com/fedimint/fedimint-web-sdk) is used for interacting with the fedimint.
- 🔌 [NDK](https://github.com/nostr-dev-kit/ndk) for NWC integeration
- 📦 Redux is used as the primary state management library and Context API is mainly used for Fedimint sdk and NDK management.

## Structure

```plaintext
Haze-Wallet/
├── src
│   ├── assets/
│   ├── Components/
│   ├── context/
│   ├── hooks/
│   ├── pages/
│   ├── redux/
│   ├── services/
│   ├── style/
│   ├── utils/
│   ├── App.tsx
│   ├── Wallet.tsx
 ```

- **App.tsx:** Root application component
- **Wallet.tsx:** Core wallet UI logic
- **Components:** The component folder contains all of the UI components(Activities,AddFederation,Header...)
- **Pages:** The Pages folder contains all the of the pages and tabs of the main wallet(JoinFederation,Ecash,Settings...)
- **Redux:** Redux files manages the fedimint sdk and NDK initialization and thier working
  - WalletManger manages the switching of the federations, loading wallet data, initializing of the wallet and giving wallet instance to their childrens and with some other functionalities
  - Nostr context runs in the background without blocking the wallet functionalities or UI renderings like intializing NDK, connecting to relays, setting up subscriptions for the following nostr events(get_info, pay_invoice, make_invoice, get_balance, list_transactions, lookup_invoice, notifications, payment_sent, payment_received)
- **Services:** The services folder contains the helper functions and the main fedimint web sdk rpc methods. 

## 🚀 Running the application

- Clone the repository
  
  ```
    git clone https://github.com/Harshdev098/haze-wallet.git
  ```
  
- Install the dependencies
  
  ```
    npm install
  ```
  
- Start the app in development mode
  
  ```
    npm run dev
  ```

## 🤝 Contributions

 Before contributing to the project please go through our contribution guidelines [Contribution.md](CONTRIBUTION.md)
