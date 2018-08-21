"use strict";

import { createConnection, ProposedFeatures, TextDocuments, InitializeParams, DidChangeConfigurationNotification, TextDocument, TextDocumentPositionParams, CompletionItem, CompletionParams, CompletionItemKind } from "vscode-languageserver";
import { compileGrammar, matchGrammar } from "./grammar";
import grammarShaderLab from "./shaderlab.grammar";


const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments = new TextDocuments();

const compiledGrammarShaderLab = compileGrammar(grammarShaderLab);

let documentList = new Map<string, TextDocument>();

connection.onInitialize((params: InitializeParams) =>
{
    connection.console.log("Init Server");
    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ["."," ","="]
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
    try
    {
        let startTime = new Date().getTime();
        let match = matchGrammar(compiledGrammarShaderLab, getDocument(docPos.textDocument.uri));
        let completions = match.requestCompletion(docPos.position);
        let endTime = new Date().getTime();
        console.log(`Complete in ${endTime - startTime}ms. `);
        return completions;
    }
    catch (ex)
    {
        console.error(ex);
    }
});

documents.listen(connection);
connection.listen();