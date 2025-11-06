import type { FederationConfig, FederationMetaData } from '../hooks/Federation.type';
import { openDB } from 'idb';

const OpenIndexedDB = async () => {
    const db = await openDB('fedimint-wallet-cache', 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('FedConfig')) {
                db.createObjectStore('FedConfig');
                db.createObjectStore('FedMeta');
            }
        },
    });
    return db;
};

export const dbCache = {
    async getCachedData(
        fedId: string
    ): Promise<{ configData: FederationConfig; metaData: FederationMetaData }> {
        const db = await OpenIndexedDB();
        const configData = await db.get('FedConfig', fedId);
        const metaData = await db.get('FedMeta', fedId);
        return { configData, metaData };
    },
    async setData(fedId: string, config: FederationConfig, meta: FederationMetaData) {
        const db = await OpenIndexedDB();
        db.put('FedConfig', config, fedId);
        db.put('FedMeta', meta, fedId);
    },
    async clear() {
        const db = await OpenIndexedDB();
        await db.clear('FedConfig');
        await db.clear('FedMeta');
    },
};
