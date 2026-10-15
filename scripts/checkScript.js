const fs = require('fs');
const vm = require('vm');

const content = fs.readFileSync('src/providers/sidebarWebviewProvider.ts', 'utf8');
const scriptStart = content.indexOf('<script nonce="${nonce}">');
const scriptEnd = content.indexOf('</script>', scriptStart);

if (scriptStart === -1 || scriptEnd === -1) {
    console.error('Script tag not found!');
    process.exit(1);
}

const scriptCode = content.substring(scriptStart + '<script nonce="${nonce}">'.length, scriptEnd);
console.log('Script code length:', scriptCode.length);

try {
    new vm.Script(scriptCode);
    console.log('Script parsed successfully - NO SYNTAX ERRORS!');
} catch (err) {
    console.error('SYNTAX ERROR:', err);
    process.exit(1);
}
