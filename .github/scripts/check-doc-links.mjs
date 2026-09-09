// Markdown syntax belongs to the library; this script only checks local files.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
    .toString().split('\0');
let checked = 0;
let errors = 0;
function check(url, file) {
    const target = url.split('#')[0];
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target)) return;
    checked++;
    try {
        if (!existsSync(resolve(root, dirname(file), decodeURIComponent(target)))) throw new Error('missing target');
    } catch (error) {
        console.error(`${file}: ${error.message}: ${target}`);
        errors++;
    }
}
for (const file of new Set(files)) {
    if (file.endsWith('.md') && existsSync(resolve(root, file))) {
        const tokens = marked.lexer(readFileSync(resolve(root, file), 'utf8'));
        marked.walkTokens(tokens, token => {
            if (token.type === 'link' || token.type === 'image') check(token.href, file);
        });
        for (const definition of Object.values(tokens.links)) check(definition.href, file);
    }
}
console.log(`Markdown local file links: ${checked} checked, ${errors} errors (anchors not checked)`);
process.exitCode = errors ? 1 : 0;
