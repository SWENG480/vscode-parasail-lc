/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as glob from 'glob';
import { LibraryView, Library } from './libraryView';

import {
	LanguageClient,
	LanguageClientOptions,
	NotificationType,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';
import { text } from 'stream/consumers';


// singleton class for the language client
class LanguageClientSingleton{
	private static instance: LanguageClient;
	
    public static getInstance(context: vscode.ExtensionContext): LanguageClient {
        if (!LanguageClientSingleton.instance) {
            const serverModule = context.asAbsolutePath(path.join('parasail-ls', 'out', 'server.js'));
            const serverOptions: ServerOptions = {
                run: { module: serverModule, transport: TransportKind.ipc },
                debug: { module: serverModule, transport: TransportKind.ipc }
            };
            const clientOptions: LanguageClientOptions = {
                documentSelector: [{ scheme: 'file', language: 'parasail' }],
                synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc') }
            };
            LanguageClientSingleton.instance = new LanguageClient('parasailServer', 'ParaSail Server', serverOptions, clientOptions);
            LanguageClientSingleton.instance.start();
        }
        return LanguageClientSingleton.instance;
    }
}

// singleton class for the library view
class LibraryViewSingleton{
	private static instance: LibraryView;
	// No explicit constructor needed for singleton
	public static getInstance(librariesFilePath: string): LibraryView {
		if (!LibraryViewSingleton.instance) {
			LibraryViewSingleton.instance = new LibraryView(librariesFilePath);
		}
		return LibraryViewSingleton.instance;
	}
}

// Path to the libraries.json file
const librariesFilePath = path.join(__dirname, '..', 'libraries.json');

export function activate(context: vscode.ExtensionContext) {
	
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('parasail-ls', 'out', 'server.js')

	);

	// use singleton classes to get the language client and library view
	const client = LanguageClientSingleton.getInstance(context);
	const libraryView = LibraryViewSingleton.getInstance(librariesFilePath);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Start the client. This will also launch the server
	client.start();

	// PLUGIN LIBRARY FEATURE : uc-plugin-files
	// Register the library view
	vscode.window.registerTreeDataProvider('libraryView', libraryView);

    // Register command to add a library
    const addLibraryCommand = vscode.commands.registerCommand('parasail.addLibrary', async () => {
        const libraryPath = await vscode.window.showInputBox({
            prompt: 'Enter the library path',
            placeHolder: '/path/to/library',
        });

		// if no path entered, return
		if (!libraryPath) {
			vscode.window.showErrorMessage('No path entered.');
			return;
		}

        // check if the library path already exists in the tree view
        const children = await libraryView.getChildren();
        const alreadyExists = children.find((child): child is Library => typeof child !== 'string' && child.path === libraryPath);
        if (alreadyExists) {
            vscode.window.showErrorMessage(`Library path ${libraryPath} already exists.`);
            return;
        }

		// if path does not exist, show error message
		if (!fs.existsSync(libraryPath)) {
			vscode.window.showErrorMessage(`The path ${libraryPath} does not exist.`);
			return;
		}

		// get the library name
		const libraryName = path.basename(libraryPath);
		// array to hold the source and header files
		const sources: string[] = [];
        const headers: string[] = [];

		// check if the path is a file or a directory
		if (fs.statSync(libraryPath).isFile()) { // if the path is a file
			// check if the file is a .psl or .psi file
			if (libraryPath.endsWith('.psl')) {
				sources.push(libraryPath);
			}
			else if (libraryPath.endsWith('.psi')) {
				headers.push(libraryPath);
			}
			// if the file is not a .psl or .psi file, show error message and return
			else { 
				vscode.window.showErrorMessage(`The file ${libraryPath} is not a .psl or .psi file.`);
				return;
			}
		}
		else { // if the path is a directory
			const pslList = path.join(libraryPath, 'psl_list.json');

			// check if the psl_list.json file exists
			// if it exists, read the file and get the sources and headers
			if (fs.existsSync(pslList)) {
				try {
					const psl = JSON.parse(fs.readFileSync(pslList, 'utf-8'));

					// Add headers first (in order)
                    if (Array.isArray(psl.headers)) {
                        headers.push(...psl.headers
							.map((file: string) => path.join(libraryPath, file)));
                    }
					// add source files (in order)
                    if (Array.isArray(psl.sources)) {
                        sources.push(...psl.sources
							.map((file: string) => path.join(libraryPath, file)));
                    }
					// check if sources and headers are empty
					// if both are empty, show error message and return
                    if (headers.length === 0 && sources.length === 0) {
                        vscode.window.showErrorMessage(`No source or header files found in psl_list.json`);
                        return;
					}
				} catch (error: any) {
					console.error(`Error reading psl_list.json: ${error.message}`);
					vscode.window.showErrorMessage(`Error reading psl_list.json: ${error.message}`);
					return;
				}
			}
			else {
                // If psl_list.json does not exist, use glob to get .psl and .psi files alphabetically
                const allFiles = glob.sync('**/*.{psl,psi}', { cwd: libraryPath })
                    .map(f => path.join(libraryPath, f))
                    .sort();

                // Separate source and header files based on extension
                allFiles.forEach(file => {
                    if (file.endsWith('.psl')) {
                        sources.push(file);
                    } else if (file.endsWith('.psi')) {
                        headers.push(file);
                    }
                });
                if (sources.length === 0 && headers.length === 0) {
                    vscode.window.showErrorMessage(`No .psl or .psi files found in ${libraryPath}`);
                    return;
                }
			}
		}

		// add library to the tree view
        libraryView.addLibraryPath({ name: libraryName, path: libraryPath, sources: sources, headers: headers });

		// send notification to lsp about added library
		client.sendNotification('parasail/addLibrary', 
			{ 
                name: libraryName,
                path: libraryPath,
                sources: sources,
                headers: headers
			});

		// show success message
        vscode.window.showInformationMessage(`Library '${libraryName}' added with ${sources.length + headers.length} files (${sources.length} sources, ${headers.length} headers).`);
    });

    // Register command to remove a library
    const removeLibraryCommand = vscode.commands.registerCommand(
		'parasail.removeLibrary',
		async (library: Library) => {
			if (library) {
				// confirm the user wants to remove the library
				const confirm = await vscode.window.showWarningMessage(
					`Are you sure you want to remove '${library.name}'?`,
					{ modal: true },
					'Yes',
					'No'
				);
				if (confirm !== 'Yes') return;
				
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
                    const children = await libraryView.getChildren();
                    const matchedLibrary = children.find((child): 
						child is Library => typeof child !== 'string' && child.path === libraryPath);
					// check if the library path exists in the tree view
					if (matchedLibrary) {
						// confirm the user wants to remove the library
						const confirm = await vscode.window.showWarningMessage(
							`Are you sure you want to remove '${matchedLibrary.name}'?`,
							{ modal: true },
							'Yes',
							'No'
						);
						if (confirm !== 'Yes') return;

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

	// get confirmation from the server when a library is added or removed
    client.onNotification('parasail/libraryAdded', (params: { name: string; path: string }) => {
        vscode.window.showInformationMessage(`Server confirmed: Library '${params.name}' added.`);
        // LibraryView already updated from the addLibraryCommand

    });
    client.onNotification('parasail/libraryRemoved', (params: { name: string; path: string }) => {
        vscode.window.showInformationMessage(`Server confirmed: Library '${params.name}' removed.`);
		// LibraryView already updated from the removeLibraryCommand
		});


	// add the commands to the context
	context.subscriptions.push(addLibraryCommand, removeLibraryCommand);

}

// help from chatgpt on how to deactivate using singleton instance
export function deactivate(): Thenable<void> | undefined {
    if (LanguageClientSingleton['instance']) {
        return LanguageClientSingleton['instance'].stop();
    }
    return undefined;
}
