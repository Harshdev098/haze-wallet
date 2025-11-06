import type { EcashTransaction, LightningTransaction, Transactions } from '@fedimint/core-web';
import logger from '../utils/Logger';

export const downloadQRCode = (downloadName: string) => {
    const svg = document.querySelector('.qrCode svg');
    if (!svg) {
        logger.error('QR code SVG not found.');
        return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const img = new Image();

    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        if (ctx) {
            ctx.drawImage(img, 0, 0);
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `${downloadName}.png`;
            link.click();
        } else {
            logger.error('2D context not available.');
        }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgString);
};

export const DownloadTransactionsCSV = (transactions: Transactions[]) => {
    if (transactions.length === 0) throw new Error('0 Transactions found');

    const headers = [
        'TimeStamp',
        'PaymentType',
        'Type',
        'Amount',
        'OperationId',
        'Outcome',
        'Gateway',
        'Invoice',
    ];
    const csvRows = [
        headers.join(','),
        ...transactions.map((tx) =>
            [
                `"${tx.timestamp}"`,
                tx.kind,
                tx.type,
                (tx as EcashTransaction).amountMsats,
                tx.operationId,
                tx.outcome,
                (tx as LightningTransaction).gateway,
                (tx as LightningTransaction).invoice,
            ].join(',')
        ),
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `transactions_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
