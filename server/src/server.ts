"use strict";

import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, DidChangeConfigurationNotification, TextDocument, TextDocumentPositionParams, CompletionItem, CompletionParams, CompletionItemKind } from "vscode-languageserver";
import { ShaderCode } from "./grammar";


const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments = new TextDocuments();

let documentList = new Map<string, TextDocument>();

connection.onInitialize((params: InitializeParams) =>
{
    connection.console.log("Init Server");
    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            completionProvider: {
                resolveProvider: true
            },
        }
    };
});

documents.onDidOpen(e =>
{
    documentList.set(e.document.uri, e.document);
});

documents.onDidClose(e =>
{
    documentList.delete(e.document.uri);
});

function getDocument(uri: string)
{
    return documentList.get(uri);
}


connection.onCompletion((docPos: CompletionParams): CompletionItem[] =>
{
    let doc = getDocument(docPos.textDocument.uri);
    if (doc)
    {
        let code = new ShaderCode(doc);
    }
    return [];
});

documents.listen(connection);
connection.listen();