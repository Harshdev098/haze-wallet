import { test, expect } from '@playwright/test';
import { TestFaucet } from './setupTest/TestFaucet';

test.setTimeout(120_000);

test.describe('Federation Join + Lightning Flow', () => {
    let faucet: TestFaucet;

    test.beforeEach(() => {
        faucet = new TestFaucet();
    });

    test('join federation and do a receive/send cycle', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/Haze/);

        // Step 1: Join federation
        await test.step('Join federation with invite code', async () => {
            const inviteCode = await faucet.getInviteCode();
            expect(inviteCode).toBeTruthy();

            await page.getByTestId('invite-code-input').fill(inviteCode);
            await page.getByTestId('continue-button').click();

            await expect(page.getByTestId('federation-title')).toContainText('Fedi Testnet');
            await expect(page.getByTestId('wallet-main')).toContainText('Onchain deposit:');
        });

        // Step 2: Create invoice
        let invoice: string;
        await test.step('Create invoice', async () => {
            await page.getByRole('button', { name: /Receive/ }).click();
            await page.getByTestId('amount-input').fill('2');
            await page.getByTestId('description-input').fill('this is an invoice');
            await page.getByRole('button', { name: /Create/ }).click();

            invoice = await page.getByTestId('invoice-output').inputValue();
            expect(invoice).toMatch(/^ln/i);
        });

        // Step 3: Pay invoice via faucet
        await test.step('Pay invoice using faucet', async () => {
            await faucet.payFaucetInvoice(invoice);
            await expect(page.getByText(/Payment Received/)).toBeVisible();
        });

        // Step 4: Verify balance increased
        await test.step('Verify balance', async () => {
            await expect(page.getByTestId('wallet-balance')).toContainText('2');
        });

        await page.getByRole('button', { name: ' Ecash' }).click();

        await page.getByRole('textbox', { name: 'Enter amount in sat:' }).fill('1');
        await page.getByRole('button', { name: ' Generate & Spend' }).click();

        const notes = await page.getByRole('textbox', { name: 'Generated notes:' }).inputValue();

        await page.getByRole('textbox', { name: 'Enter or Scan the notes:' }).fill(notes);
        await page.getByRole('button', { name: ' Confirm Redeem' }).click();
    });
});
