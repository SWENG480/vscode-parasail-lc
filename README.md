# VSCode ParaSail Language Client


## Functionality

TODO

## Structure

```
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── parasail-ls // Language Server (git submodule)
    └── src
        └── server.ts // Language Server entry point
└── parasail-tm // TextMate Syntax (git submodule)
    └── parasail.tmLanguage.json
```

## Developping the ParaSail VSCode Client

- Clone using `git clone --recurse-submodules https://github.com/parasail-lang/vscode-parasail-lc`
- `cd vscode-parasail-lc`
- Run `npm run vscode:prepublish`
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5).
- In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open a `*psl` document.
  - Enter text content such as `AAA aaa BBB`. The extension will emit diagnostics for all words in all-uppercase.
