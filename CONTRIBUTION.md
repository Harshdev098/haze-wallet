Welcome to Haze Wallet, a fedimint project which is build to make fedimint accesible via web to the users to custody their bitcoins and transact with them, before contributing to the project 
please go through our contribution guidelines and be adhere to the points. If you have any doubts about guidelines or contributing to the project, please open an issue regarding that, we will help for the same.

## Technical Note

This wallet is built using the **[Fedimint Web SDK](https://github.com/fedimint/fedimint-web-sdk)**, which:

- Loads *WebAssembly (WASM)* modules compiled from Fedimint’s Rust code.
- Uses *Web Workers* to execute WASM tasks in the background without blocking the UI.
- Provides RPC calls to interact with the federation, handle e-cash, Lightning payments, and on-chain transactions directly in the browser.

If you want to understand or extend the wallet's core logic, you can explore:
- *Fedimint Web SDK*: Learn how the WASM module is initialized and how the SDK functions are used in the wallet.
- *Fedimint Rust repository*: Understand the backend implementation that powers the federation logic and RPC endpoints.

📚 Helpful links:
- [Fedimint Main Repository](https://github.com/fedimint/fedimint)
- [Fedimint Web SDK Repository](https://github.com/fedimint/fedimint-web-sdk)

Understanding these will help to contribute more effectively, especially when working on features that interact with the federation directly.

## Contributing

- Any low code, UI enhancement, implementing new feature, solving an issue, opening an issue is appreciable
- Before making any changes make sure that your fork is synced and your clone is upto date with the main branch
- You can open issues in issue section regarding a doubt,reporting a bug, setting up the project
- Be polite and interactive with other developers.Don't be offensive.
- Test your code before submitting the PR.

## Opening a Pull Request

- Fork the repository to your account.
- Clone the repository locally
  
  git clone https://github.com/Harshdev098/fedimint-web-wallet.git
  
- Make sure to work on a different branch if wanted to open multiple PRs.
- Have a run in local and explore the working of wallet
- Make your desired changes for the contribution
- Test the changes and ensure it should not break the functionality
- Check lint and type check before pushing!

  ```
  npm run lint && npm run type-check
  ```

  to fix the linting

  ```
  npm run lint:fix
  ```

- Commit your changes with an appropriate commit prefix:
  - **fix:** A bug fix, workflow change, or similar.
  - **feat:** A new feature or enhancement.
  - **docs:** Documentation updates, fixes, or typo corrections.
  - **chore:** Miscellaneous changes that don’t fit into the above categories.
- Push your changes and open a PR on this repo.

## Creating Issues

When opening an issue, please follow these guidelines to help us understand and resolve it quickly:

- **Use a clear and descriptive title** that accurately summarizes the issue.
- **Provide references** (links, file paths, or relevant code snippets) to help locate the problem.
- **Include screenshots or videos** if the issue is UI-related, so we can visualize it easily.
- When **requesting a new feature**, clearly describe:
  - What the feature should do.
  - Where and how you expect it to be integrated into the wallet.
  - Any related examples or references (if available).
