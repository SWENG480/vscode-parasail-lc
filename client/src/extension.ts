import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { LibraryView, Library } from './libraryView';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;
let libraryView: LibraryView;

const librariesFilePath = path.join(__dirname, '..', 'libraries.json');

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(
    path.join('parasail-ls', 'out', 'server.js')
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'parasail' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
    }
  };

  client = new LanguageClient(
    'parasailServer',
    'ParaSail Server',
    serverOptions,
    clientOptions
  );

  client.start();

  // Register the library view
  libraryView = new LibraryView(librariesFilePath);
  vscode.window.registerTreeDataProvider('libraryView', libraryView);

  const addLibraryCommand = vscode.commands.registerCommand('parasail.addLibrary', async () => {
    const libraryPath = await vscode.window.showInputBox({
      prompt: 'Enter the library path',
      placeHolder: '/path/to/library',
    });

    if (libraryPath) {
      if (fs.existsSync(libraryPath)) {
        const libraryName = path.basename(libraryPath);
        libraryView.addLibraryPath({ name: libraryName, path: libraryPath });
        client.sendNotification('parasail/addLibrary', { name: libraryName, path: libraryPath });
        vscode.window.showInformationMessage(`Library '${libraryName}' added.`);
      } else {
        vscode.window.showErrorMessage(`The path ${libraryPath} does not exist.`);
      }
    }
  });

  const removeLibraryCommand = vscode.commands.registerCommand('parasail.removeLibrary', async (library: Library) => {
    if (library) {
      libraryView.removeLibraryPath(library);
      client.sendNotification('parasail/removeLibrary', { name: library.name, path: library.path });
      vscode.window.showInformationMessage(`Library '${library.name}' removed.`);
    } else {
      const libraryPath = await vscode.window.showInputBox({
        prompt: 'Enter the path of the library to remove',
        placeHolder: '/path/to/library',
      });
      if (libraryPath) {
        const matchedLibrary = (await libraryView.getChildren()).find(lib => lib.path === libraryPath);
        if (matchedLibrary) {
          client.sendNotification('parasail/removeLibrary', {
            name: matchedLibrary.name,
            path: matchedLibrary.path
          });
          libraryView.removeLibraryPath(matchedLibrary);
          vscode.window.showInformationMessage(`Library '${matchedLibrary.name}' removed.`);
        } else {
          vscode.window.showErrorMessage(`No library found with the path: ${libraryPath}`);
        }
      }
    }
  });

  context.subscriptions.push(addLibraryCommand, removeLibraryCommand);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
