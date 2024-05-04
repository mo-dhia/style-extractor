const vscode = require('vscode');

function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.removeInlineStyles', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No open text editor
        }

        let text = editor.document.getText();
        let css = '';
        let newText = text.replace(/(class|id)="([^"]+)"\sstyle="([^"]+)"/g, function(_, attr, name, style) {
            css += attr === 'class' ? '.' : '#';
            css += `${name} { ${style} }\n`;
            return `${attr}="${name}"`;
        });

        editor.edit(editBuilder => {
            const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
            const start = new vscode.Position(0, 0);
            const end = new vscode.Position(editor.document.lineCount - 1, lastLine.text.length);
            editBuilder.replace(new vscode.Range(start, end), newText);
        });

        vscode.env.clipboard.writeText(css);
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
