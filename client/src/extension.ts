/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

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
import { text } from 'stream/consumers';

let client: LanguageClient; 
let libraryView: LibraryView;

// Path to the libraries.json file
const librariesFilePath = path.join(__dirname, '..', 'libraries.json');

export function activate(context: vscode.ExtensionContext) {
	
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('parasail-ls', 'out', 'server.js')

	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'parasail' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'parasailServer',
		'ParaSail Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();

	// note: these features may need to be adjusted based on the lsp implementation
	// a lot of the work is done on the lsp's end

	// PLUGIN LIBRARY FEATURE : uc-plugin-files
	// Register the library view
	libraryView = new LibraryView(librariesFilePath);
	vscode.window.registerTreeDataProvider('libraryView', libraryView);

    // Register command to add a library
    const addLibraryCommand = vscode.commands.registerCommand('parasail.addLibrary', async () => {
        const libraryPath = await vscode.window.showInputBox({
            prompt: 'Enter the library path',
            placeHolder: '/path/to/library',
        });

        if (libraryPath) {
			// check if path exists
			if (fs.existsSync(libraryPath)) {
				const libraryName = path.basename(libraryPath);
                libraryView.addLibraryPath({ name: libraryName, path: libraryPath });
			
				// send notification to lsp about added library
				client.sendNotification('parasail/addLibrary', {name: libraryName, path: libraryPath});
			
				// show success message
				vscode.window.showInformationMessage(`Library '${libraryName}' added.`);
			} else{
				// show error message if path does not exist
				vscode.window.showErrorMessage(`The path ${libraryPath} does not exist.`);
			}
		}
    });

    // Register command to remove a library
    const removeLibraryCommand = vscode.commands.registerCommand('parasail.removeLibrary', async (library: Library) => {
		if (library) {
			// if library selected from the tree view
			libraryView.removeLibraryPath(library);
		
			// send notification to lsp about removed library
			client.sendNotification('parasail/removeLibrary', {name: library.name, path: library.path});
		
			// show success message
			vscode.window.showInformationMessage(`Library '${library.name}' removed.`);
		} else {
			// if no library selected, ask the user to enter a path
			const libraryPath = await vscode.window.showInputBox({
				prompt: 'Enter the path of the library to remove',
				placeHolder: '/path/to/library',
			});
			if (libraryPath) {
				const matchedLibrary = (await libraryView
					.getChildren())
					.find(lib => lib.path === libraryPath);
				if (matchedLibrary) {
					// send notification to lsp about removed library
					client.sendNotification('parasail/removeLibrary', {name: matchedLibrary.name, path: matchedLibrary.path});

					// remove library from the tree view
					libraryView.removeLibraryPath(matchedLibrary);
					vscode.window.showInformationMessage(`Library '${matchedLibrary.name}' removed.`);
				} else {
					vscode.window.showErrorMessage(`No library found with the path: ${libraryPath}`);
				}
		}
		}
	});
	// on LSP side, we will create new NotificationType for addLibrary and 
	// removeLibrary and handle them in the server with connection.onNotification
	//

	// add the commands to the context
	context.subscriptions.push(addLibraryCommand, removeLibraryCommand);
	
}
export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
