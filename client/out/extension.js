'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
let client;
function activate(context) {
    console.log("Activated");
    let serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));
    let debugOption = { execArgv: ["--nolazy", "--inspect=6009"] };
    let serverOptions = {
        run: { module: serverModule, transport: vscode_languageclient_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: vscode_languageclient_1.TransportKind.ipc,
            options: debugOption
        }
    };
    let clientOption = {
        documentSelector: [{ scheme: "file", language: "shaderlab" }],
        synchronize: {
            fileEvents: vscode_1.workspace.createFileSystemWatcher("**/.clientrc")
        }
    };
    client = new vscode_languageclient_1.LanguageClient("ShaderLab Language Server", serverOptions, clientOption);
    client.start();
    console.log("Client started");
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map