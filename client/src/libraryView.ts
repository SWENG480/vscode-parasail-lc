import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// interface for the library
export interface Library {
    name: string;
    path: string;
    sources: string[];
    headers: string[];
}

// class to provide the library paths to the tree view
export class LibraryView implements vscode.TreeDataProvider<Library | string> { 
    private _onDidChangeTreeData: vscode.EventEmitter<Library | string | null> = new vscode.EventEmitter<Library | string | null>();
    readonly onDidChangeTreeData: vscode.Event<Library | string | null> = this._onDidChangeTreeData.event;

    private libraries: Library[] = [];

    // constructor to initialize the library file path
    constructor(private librariesFilePath: string) {
        this.loadLibraryPaths();
    }

    // function to get the tree item
    getTreeItem(element: Library | string): vscode.TreeItem {
        if (element === 'addLibrary') {
            const addLibraryButton = new vscode.TreeItem('Add Library', vscode.TreeItemCollapsibleState.None);
            addLibraryButton.command = {
                command: 'parasail.addLibrary',
                title: 'Add Library'
            };
            return addLibraryButton;
        } else if (typeof element === 'string') {
            // Element is a file name
            return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
        } else {
            // Element is a Library
            const libraryItem = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Collapsed);
            libraryItem.tooltip = element.path;
            libraryItem.contextValue = 'library';
            return libraryItem;
        }
    }

    //function to get the children of the tree item
    getChildren(element?: Library | string): Thenable<(Library | string)[]> {
        if (!element) {
			const addLibraryButton = 'addLibrary' as const;
            const rootElements: (Library | string)[] = [addLibraryButton, ...this.libraries];
            return Promise.resolve(rootElements);
		} else if (typeof element === 'string') {
            // No children for the 'Add Library' button
            return Promise.resolve<string[]>([]);
        } else {
            // Return the list of source and header file names when a Library is expanded
            return Promise.resolve<string[]>
			([...element.headers.map(h => path.basename(h)), ...element.sources.map(s => path.basename(s))]);
        }
    }

    // function to refresh the tree view
    private loadLibraryPaths(): void {
        if (fs.existsSync(this.librariesFilePath)) {
            const rawData = fs.readFileSync(this.librariesFilePath, 'utf-8');
            try {
                this.libraries = JSON.parse(rawData);
                this.libraries.forEach(lib => {
                    if (!lib.sources) lib.sources = [];
                    if (!lib.headers) lib.headers = [];
                });
            } catch (error) {
                console.error('Error parsing libraries.json:', error);
                this.libraries = [];
            }
        } else {
            fs.writeFileSync(this.librariesFilePath, JSON.stringify(this.libraries, null, 2));
        }
    }

    // function to save the library paths to the JSON file
    private saveLibraryPaths(): void {
        fs.writeFileSync(this.librariesFilePath,
            JSON.stringify(this.libraries, null, 2)
        );
    }

    // function to add a library path
    addLibraryPath(library: Library) {
        if (!this.libraries.find(
            (lib) => lib.path === library.path)) {
            this.libraries.push(library);
            this.saveLibraryPaths();
            this._onDidChangeTreeData.fire(null);
        } else {
            console.log('Library path already exists');
        }
    }

    // function to remove a library path
    removeLibraryPath(library: Library) {
        this.libraries = this.libraries.filter((lib) => lib !== library);
        this.saveLibraryPaths();
        this._onDidChangeTreeData.fire(null);
    }
}
