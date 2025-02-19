import path from "path";
import fs from "fs";

import { APP_INTERCEPT, FileEntry, MY_COMPUTER_INTERCEPT } from "./fileserver";
import { shouldHideFile } from "./hide-files";
import { encode, getEncoding } from "./encoding";
import { log } from "console";
import { app } from "electron";

export function generateDirectoryListing(currentPath: string, files: string[]): string {
  const parentPath = path.dirname(currentPath || '/');
  const title = currentPath === '/' ? 'My Host Computer' : `Directory: ${encode(currentPath)}`;

  // Get file info and sort (directories first, then alphabetically)
  const items = files
    .map(name => {
      const fullPath = path.join(currentPath, name);
      let stats: fs.Stats;
      try {
        stats = fs.statSync(fullPath);
      } catch (error) {
        log(`FileServer: Failed to get stats for ${fullPath}: ${error}`);
        stats = new fs.Stats();
      }

      return {
        name,
        fullPath,
        stats
      } as FileEntry;
    })
    .filter(entry => entry.stats && !shouldHideFile(entry))
    .sort((a, b) => {
      if (a.stats.isDirectory() !== b.stats.isDirectory()) {
        return a.stats.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map(getFileLiHtml)
    .join('')

  // Generate very simple HTML that works in IE 5.5
  return `
    <html>
    <head>
      ${getEncoding()}
      <title>${title}</title>
    </head>
    <body>
      <h2>${title}</h2>
      <p>${getParentFolderLinkHtml(parentPath)} | ${getDesktopLinkHtml()} | ${getDownloadsLinkHtml()}</p>
      <p>
      <ul>
        ${items}
      </ul>
    </body>
    </html>
  `;
}

function getParentFolderLinkHtml(parentPath: string) {
  return `
    ${getIconHtml('folder.gif')}
    <a href="${MY_COMPUTER_INTERCEPT}${encodeURI(parentPath)}">
      [Parent Directory]
    </a>
  `;
}

function getDesktopLinkHtml() {
  const desktopPath = app.getPath('desktop');

  return `
    ${getIconHtml('desktop.gif')}
    <a href="${MY_COMPUTER_INTERCEPT}${encodeURI(desktopPath)}">
      Desktop
    </a>
  `;
}

function getDownloadsLinkHtml() {
  const downloadsPath = app.getPath('downloads');

  return `
    ${getIconHtml('network.gif')}
    <a href="${MY_COMPUTER_INTERCEPT}${encodeURI(downloadsPath)}">
      Downloads
    </a>
  `;
}

function getIconHtml(icon: string) {
  return `<img src="${APP_INTERCEPT}images/${icon}" style="vertical-align: middle; margin-right: 5px;" width="16" height="16">`;
}

function getFileLiHtml(entry: FileEntry) {
  const encodedPath = encodeURI(entry.fullPath);
  const sizeDisplay = entry.stats.isDirectory() ? '' : ` (${formatFileSize(entry.stats.size)})`;
  const icon = entry.stats.isDirectory() ? getIconHtml('folder.gif') : getIconHtml('doc.gif');

  return `<li>
    ${icon}
    <a href="${MY_COMPUTER_INTERCEPT}${encodedPath}">
      ${getDisplayName(entry)}
    </a>
    ${sizeDisplay}
  </li>`;
}

function getDisplayName(entry: FileEntry) {
  return encode(entry.stats.isDirectory() ? `[${entry.name}]` : entry.name);
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
