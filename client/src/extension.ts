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

	// PLUGIN COMPLETION FEATURE : uc-plugin-completion
	// lsp handles the completion request and returns the suggestions
	// register completion provider for ParaSail
	const completionProvider = vscode.languages.registerCompletionItemProvider(
		'parasail', // completions provided for parasail language
		{
			provideCompletionItems: async (document: vscode.TextDocument, position: vscode.Position) => {
				try {
					// send position to the lsp
					const completionItems = await client.sendRequest('parasail.completions', {
						textDocument: {
							uri: document.uri.toString()
						},
						position: {
							line: position.line,
							character: position.character
						}
					});
					return (completionItems as any[]).map((item: any) => {
						const completionItem = new vscode.CompletionItem(item.label);
						completionItem.kind = item.kind;
						if (item.detail) {
							completionItem.detail = item.detail;
						}
						if (item.documentation) {
							completionItem.documentation = item.documentation;
						}
						return completionItem;
					});
				} catch (error) {
					console.error('Error fetching completions:', error);
					return [];
				}
			}
		},
	);
	//
	//

	// PLUGIN ERROR CHECK FEATURE : uc-plugin-error
	// lsp handles the diagnostics and returns the errors
	
	// create a diagnostic collection 
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('parasail');

	// listen for document changes
	vscode.workspace.onDidChangeTextDocument(async (event) => {
		if (event.document.languageId === 'parasail') {
			try{
				// send the content to the lsp for error checking
				const errors: { range: { start: { line: number, character: number }, end: { line: number, character: number } }, message: string, severity: vscode.DiagnosticSeverity }[] = await client.sendRequest('parasail.checkErrors', {
					textDocument: {
						uri: event.document.uri.toString()},
				});
				
				if (errors) {
					const diagnostics: vscode.Diagnostic[] = errors.map((error: any) => {
						const range = new vscode.Range(
							new vscode.Position(error.range.start.line, error.range.start.character),
							new vscode.Position(error.range.end.line, error.range.end.character)
						);
						const diagnostic = new vscode.Diagnostic(range, error.message, error.severity);
						return diagnostic;
					});

					// set the diagnostics 
					diagnosticCollection.set(event.document.uri, diagnostics);
				}
				else{
					// clear the diagnostics if no errors
					diagnosticCollection.delete(event.document.uri);
				}
			} catch (error) {
				console.error('Error checking code:', error);
			}
		}
	});
	//
	//

	// PLUGIN SHOWDEF FEATURE : uc-plugin-showdef
	// lsp handles the show definition on hover

	////// not sure how to finish this part, might need to get more information from lsp side?
	// register hover provider for parasail
	// const hoverProvider = vscode.languages.registerHoverProvider('parasail', {
	// 	provideHover: async (document: vscode.TextDocument,
	// 		position: vscode.Position) => {
	// 		try {
	// 			// send the position of hovered text to the lsp
	// 			const result = await client.sendRequest('parasail.getDefinition', {
	// 				textDocument: {
	// 					uri: document.uri.toString()
	// 				},
	// 				position: {
	// 					line: position.line,
	// 					character: position.character
	// 				}
	// 			});

	// 			// if hover information is returned
	// 			if (result) {
	// 				const { range, uri, name } = result;
	// 				const definitionLocation = new vscode.Location(
	// 					vscode.Uri.parse(uri), new vscode.Range(
	// 						range.start.line,
	// 						range.start.character,
	// 						range.end.line, 
	// 						range.end.character
	// 					)
	// 				);
					
	// 				// return the hover information
	// 				return new vscode.Hover('Definition: ' + name, definitionLocation);
	// 			} else {
	// 				// if no hover information is returned
	// 				return new vscode.Hover('No definition found.');
	// 			}
	// 		} catch (error) {
	// 			console.error('Error fetching definition:', error);
	// 			return new vscode.Hover('Error fetching definition.');
	// 		}
	// 	},
	// });
	//
	//


	// add the commands, providers and diagnostic collection to the context
	context.subscriptions.push(addLibraryCommand, removeLibraryCommand, completionProvider, hoverProvider, diagnosticCollection);
	
}
export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
