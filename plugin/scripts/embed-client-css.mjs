import { readFile, unlink, writeFile } from "node:fs/promises";

const clientPath = new URL("../lib/client.js", import.meta.url);
const cssPath = new URL("../lib/style.css", import.meta.url);
const [client, css] = await Promise.all([readFile(clientPath, "utf8"), readFile(cssPath, "utf8")]);

const installStyle = `
if (typeof document !== "undefined") {
    const marker = "data-convivium-client-style";
    let style = document.querySelector("style[" + marker + "]");
    if (style === null) {
        style = document.createElement("style");
        style.setAttribute(marker, "");
        document.head.appendChild(style);
    }
    style.textContent = ${JSON.stringify(css)};
}
`;

await writeFile(clientPath, `${installStyle}\n${client}`);
await unlink(cssPath);
