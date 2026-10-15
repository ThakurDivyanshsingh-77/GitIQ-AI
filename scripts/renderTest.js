const path = require('path');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(request) {
    if (request === 'vscode') {
        return {
            workspace: { workspaceFolders: [] },
            commands: { executeCommand: async () => {} },
            window: { showErrorMessage: () => {} }
        };
    }
    return originalRequire.apply(this, arguments);
};

const sidebarPath = path.resolve(__dirname, '../out/providers/sidebarWebviewProvider.js');
const mod = require(sidebarPath);
const instance = new mod.SidebarWebviewProvider({ fsPath: 'c:\\test' });
const html = instance.getHtmlForWebview({ cspSource: 'vscode-webview:' });

console.log('HEAD snippet:');
console.log(html.substring(0, 400));
console.log('--- SCRIPT snippet:');
const idx = html.indexOf('<script');
console.log(html.substring(idx, idx + 100));
