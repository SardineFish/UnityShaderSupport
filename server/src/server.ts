"use strict";

import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, DidChangeConfigurationNotification, TextDocument, TextDocumentPositionParams, CompletionItem, CompletionParams, CompletionItemKind } from "vscode-languageserver";
import { promises } from "fs";

let connection = createConnection(ProposedFeatures.all);

let documents: TextDocuments = new TextDocuments()

let hasConfigurationCapability: boolean | undefined = false;
let hasWorkspaceFolderCapability: boolean | undefined = false;
let hasDiagnosticRelatedInformationCapability: boolean | undefined = false;

connection.onInitialize((params: InitializeParams) =>
{

    let capabilities = params.capabilities;

    hasConfigurationCapability =
        capabilities.workspace && !!capabilities.workspace.configuration;
    hasWorkspaceFolderCapability =
        capabilities.workspace && !!capabilities.workspace.workspaceFolders;
    hasDiagnosticRelatedInformationCapability =
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation;

    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            completionProvider: {
                resolveProvider: true
            },
        }
    };
});

connection.onInitialized(() =>
{
    // Register for all configuration changes.
    if (hasConfigurationCapability)
    {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }

    if (hasWorkspaceFolderCapability)
    {
        connection.workspace.onDidChangeWorkspaceFolders(_event =>
        {

        });
    }
});

connection.onDidChangeConfiguration(change =>
{

});

documents.onDidClose(e =>
{

});

async function validateTextDocument(doc: TextDocument): Promise<void>
{

}

connection.onCompletion((docPos: CompletionParams): CompletionItem[] =>
{
    return [{
        label: "Shader",
        kind: CompletionItemKind.Keyword
    },
    {
        label: "SubShader",
        kind: CompletionItemKind.Struct
    }];
});

documents.listen(connection);
connection.listen();