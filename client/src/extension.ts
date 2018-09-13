'use strict';
import * as path from 'path';
import { workspace, ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient";
import { Formatter } from './formatter';

let client: LanguageClient;

export function activate(context: ExtensionContext)
{
    // Language Server
    console.log("Activated");
    let serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));
    let debugOption = { execArgv: ["--nolazy", "--inspect=6009"] };

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOption
        }
    };

    let clientOption: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "shaderlab" }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher("**/.clientrc")
        }
    };
    

    client = new LanguageClient("ShaderLab Language Server", serverOptions, clientOption);

    client.start();
    console.log("Client started");

    // Formatter
    vscode.languages.registerDocumentFormattingEditProvider("shaderlab", {
        provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions): vscode.TextEdit[]
        {
            return new Formatter(document, options).format();
        }
    });
    vscode.languages.registerOnTypeFormattingEditProvider("shaderlab", {
        provideOnTypeFormattingEdits(document: vscode.TextDocument, position: vscode.Position, ch: string, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.TextEdit[]
        {
            
            return new Formatter(document, options).format(ch, position);
        }
    }, ";", "\n", "{", "}");
    console.log("Registered formatter.");
}