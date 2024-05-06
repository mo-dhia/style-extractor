const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

async function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.removeInlineStyles', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No open text editor
        }

        const languageId = editor.document.languageId;
        console.log('Language ID:', languageId); // Add this line for debugging

        let text = editor.document.getText();
        let newText = ''
        let css = ''
        const styles = []


        function converter(input, type, isReact) {
            // Remove inline styles
            const stylePattern = isReact ? /(\s*style={{[^}]+}})/g : /(style="[^"]*")|(style='[^']*')/g

            input = input.replace(stylePattern, (stylesString, i) => {
                const complex = [];
                let stylesArray = stylesString.split(isReact ? ',' : ';');
                let stylesAcc = ''
                for (let style of stylesArray) {
                    // Split the style into property and value
                    if (!isReact) {
                        style = style.replace(/style=("[^"]*"|'[^']*')?/g, '').replace(/\n/g, '').replace(/"/g, '').replace(/'/g, '');
                    }
                    if (!style) continue

                    const splitValue = style.split(':')
                    let [property, value] = splitValue;

                    if (isReact) {
                        property = property.replace(/\s/g, '').replace(/\n/g, '').replace(/}/g, '').replace(/style={{/g, '')
                    }
                    // Skip if property or value is undefined
                    if (!property || !value) continue;

                    let clearedValue
                    if (isReact) {
                        clearedValue = splitValue.slice(1).join(':').replace(/\s/g, '').replace(/\n/g, '').replace(/}/g, '').replace(/style={{/g, '')

                        if ((clearedValue[0] === '"' && clearedValue[clearedValue.length - 1] === '"') ||
                            (clearedValue[0] === "'" && clearedValue[clearedValue.length - 1] === "'")) {
                            let cssProperty = property.replace(/([A-Z])/g, "-$1").toLowerCase();
                            value = value[0] === ' ' ? value.slice(1) : value
                            stylesAcc += ` ${cssProperty}: ${value.replace(/\n/g, '').replace(/}/g, '').replace(/style={{/g, '')};`;
                        } else if (isNaN(Number(clearedValue))) {
                            complex.push(`${property}: ${splitValue.slice(1).join(':').replace(/\n/g, '').replace(/}/g, '').replace(/style={{/g, '')}`);
                        } else {
                            value = value[0] === ' ' ? value.slice(1) : value
                            let cssProperty = property.replace(/([A-Z])/g, "-$1").toLowerCase();
                            stylesAcc += ` ${cssProperty}: ${value.replace(/\n/g, '').replace(/}/g, '').replace(/style={{/g, '')};`;
                        }

                    } else {
                        if (value.includes('{') || value.includes('}') || value.includes('?') || value.includes('$')) {
                            complex.push(property + ':' + splitValue.slice(1).join(':'))
                        } else {
                            stylesAcc += (' ' + property + ': ' + value + ';')
                        }
                    }
                }


                styles.push(stylesAcc)
                if (complex.length) {
                    if (isReact) {
                        return ` style={{${complex.join(', ')}}}`;
                    } else {
                        return ` style='${complex.join('; ')}'`;
                    }
                } else {
                    return '';
                }
            });



            // Remove class names and ids with invalid characters
            const classIdPattern = isReact ? / (?:className|id)=['"]([^'"]+)['"]/g : / (?:class|id)=['"]([^'"]+)['"]/g
            let index = 0
            input = input.replace(classIdPattern, (match, attribute) => {
                const className = match.includes('id=') ? '#' + attribute : '.' + attribute
                index++
                if (!styles[index] || styles[index] === ' ') return ''

                css += className + ' {' + styles[index] + ' }' + '\n'
                if (!attribute.includes(' ') && !attribute.includes('>') && !attribute.includes(':')) {

                    if (type === 'next' || type === 'react-native') {
                        return ` className={styles.${attribute}}`
                    } else {
                        return match
                    }

                } else {
                    return ''
                }
            });
            return input;
        }

        const findStyles = (type, isReact) => {
            newText = converter(text, type, isReact)
        };

        // Await getting the project type
        const type = await getProjectType();

        if (languageId === 'javascript' || languageId === 'typescript') {
            // React JSX or JS file
            findStyles(type, true)
        } else if (languageId === 'html') {
            findStyles('html')

        } else if (languageId === 'svelte') {
            findStyles('svelte')
        } else {
            vscode.window.showErrorMessage('Css extractor could not find type of the project');
            return;
        }

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

function deactivate() { }

async function getProjectType() {
    // Get the path of the current file
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || !activeEditor.document) {
        // No active editor
        return false;
    }

    const currentFilePath = activeEditor.document.fileName;

    try {
        // Navigate up from the current file to find package.json
        let currentDir = path.dirname(currentFilePath);
        let packageJsonPath;

        // Loop until we find package.json or reach the root directory
        while (true) {
            packageJsonPath = path.join(currentDir, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                break;
            }

            // Go up one directory
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                // Reached root directory
                return false;
            }
            currentDir = parentDir;
        }

        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        // Check if it has Next.js dependencies
        if (packageJson['dependencies'] && packageJson['dependencies']['react']) {
            if (packageJson['dependencies']['next'] || packageJson['dependencies']['next/dist/server']) {
                return 'next'
            } else if (packageJson['dependencies']['react-native']) {
                return 'react-native'
            } else {
                return 'react'
            }
        }

        // If you need to check for other Next.js dependencies, add them here

        return false;
    } catch (error) {
        // Error reading package.json or parsing JSON
        console.error(error);
        return false;
    }
}

module.exports = {
    activate,
    deactivate
};
