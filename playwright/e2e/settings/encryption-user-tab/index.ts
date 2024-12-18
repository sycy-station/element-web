/*
 * Copyright 2024 New Vector Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
 * Please see LICENSE files in the repository root for full details.
 */

import { Page } from "@playwright/test";
import { GeneratedSecretStorageKey } from "matrix-js-sdk/src/crypto-api";

import { ElementAppPage } from "../../../pages/ElementAppPage";
import { test as base, expect } from "../../../element-web-test";
export { expect };

/**
 * Set up for the encryption tab test
 */
export const test = base.extend<{
    util: Helpers;
}>({
    util: async ({ page, app, bot }, use) => {
        await use(new Helpers(page, app));
    },
});

class Helpers {
    constructor(
        private page: Page,
        private app: ElementAppPage,
    ) {}

    /**
     * Open the encryption tab
     */
    openEncryptionTab() {
        return this.app.settings.openUserSettings("Encryption");
    }

    /**
     * Go through the device verification flow using the recovery key.
     */
    async verifyDevice(recoveryKey: GeneratedSecretStorageKey) {
        // Select the security phrase
        await this.page.getByRole("button", { name: "Verify with Security Key or Phrase" }).click();
        await this.enterRecoveryKey(recoveryKey);
        await this.page.getByRole("button", { name: "Done" }).click();
    }

    /**
     * Fill the recovery key in the dialog
     * @param recoveryKey
     */
    async enterRecoveryKey(recoveryKey: GeneratedSecretStorageKey) {
        // Select to use recovery key
        await this.page.getByRole("button", { name: "use your Security Key" }).click();

        // Fill the recovery key
        const dialog = this.page.locator(".mx_Dialog");
        await dialog.getByRole("textbox").fill(recoveryKey.encodedPrivateKey);
        await dialog.getByRole("button", { name: "Continue" }).click();
    }

    /**
     * Get the encryption tab content
     */
    getEncryptionTabContent() {
        return this.page.getByTestId("encryptionTab");
    }

    /**
     * Delete the key backup for the given version
     * @param backupVersion
     */
    async deleteKeyBackup(backupVersion: string) {
        const client = await this.app.client.prepareClient();
        await client.evaluate(async (client, backupVersion) => {
            await client.getCrypto()?.deleteKeyBackupVersion(backupVersion);
        }, backupVersion);
    }

    /**
     * Get the security key from the clipboard and fill in the input field
     * Then click on the finish button
     * @param screenshot
     */
    async confirmRecoveryKey(screenshot: `${string}.png`) {
        const dialog = this.getEncryptionTabContent();
        await expect(dialog.getByText("Enter your recovery key to confirm")).toBeVisible();
        await expect(dialog).toMatchScreenshot(screenshot);

        const handle = await this.page.evaluateHandle(() => navigator.clipboard.readText());
        const clipboardContent = await handle.jsonValue();
        await dialog.getByRole("textbox").fill(clipboardContent);
        await dialog.getByRole("button", { name: "Finish set up" }).click();
        await expect(dialog).toMatchScreenshot("default-recovery.png");
    }

    /**
     * Remove the cached secrets from the indexedDB
     */
    async deleteCachedSecrets() {
        await this.page.evaluate(async () => {
            const removeCachedSecrets = new Promise((resolve) => {
                const request = window.indexedDB.open("matrix-js-sdk::matrix-sdk-crypto");
                request.onsuccess = async (event: Event & { target: { result: IDBDatabase } }) => {
                    const db = event.target.result;
                    const request = db.transaction("core", "readwrite").objectStore("core").delete("private_identity");
                    request.onsuccess = () => {
                        db.close();
                        resolve(undefined);
                    };
                };
            });
            await removeCachedSecrets;
        });
        await this.page.reload();
    }
}
