import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const declarationRoot = resolve(import.meta.dirname, "../lib/types");
const pending = [declarationRoot];

while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) {
            pending.push(file);
            continue;
        }
        if (!entry.name.endsWith(".d.ts")) {
            continue;
        }
        const source = readFileSync(file, "utf8");
        const ast = ts.createSourceFile(
            file,
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );
        const edits = [];
        const collect = (literal) => {
            if (!literal || !ts.isStringLiteralLike(literal)) {
                return;
            }
            if (!literal.text.startsWith(".") || !/\.tsx?$/.test(literal.text)) {
                return;
            }
            edits.push({
                start: literal.getStart(ast) + 1,
                end: literal.getEnd() - 1,
                value: literal.text.replace(/\.tsx?$/, ".js")
            });
        };
        const visit = (node) => {
            if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
                collect(node.moduleSpecifier);
            }
            if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
                collect(node.argument.literal);
            }
            ts.forEachChild(node, visit);
        };
        visit(ast);
        let output = source;
        for (const edit of edits.sort((a, b) => b.start - a.start)) {
            output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
        }
        if (edits.length > 0) {
            writeFileSync(file, output);
        }
    }
}
