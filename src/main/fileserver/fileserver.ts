import { protocol, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { generateDirectoryListing } from './page-directory-listing';
import { generateErrorPage } from './page-error';
import { log } from '../logging';

export interface FileEntry {
  name: string;
  fullPath: string;
  stats: fs.Stats;
}

export const APP_INTERCEPT = 'http://windows95/';
export const MY_COMPUTER_INTERCEPT = 'http://my-computer/';

const interceptedUrls = [
  MY_COMPUTER_INTERCEPT,
  APP_INTERCEPT
];

export function setupFileServer() {
  // Register protocol handler for our custom schema
  protocol.handle('http', async (request) => {
    if (!interceptedUrls.some(url => request.url.startsWith(url))) {
      return fetch(request.url, {
        headers: request.headers,
        method: request.method,
        body: request.body,
      });
    }

    try {
      const { fullPath, decodedPath } = getFilePath(request.url);

      log(`FileServer: Handling request for ${request.url}`, { fullPath, decodedPath });

      // Check if path exists
      if (!fs.existsSync(fullPath)) {
        return new Response(generateErrorPage(
          'File or Directory Not Found',
          decodedPath
        ), {
          status: 404,
          headers: {
            'Content-Type': 'text/html'
          }
        });
      }

      // Check if it's a directory
      const stats = await fs.promises.stat(fullPath);
      if (stats.isDirectory()) {
        // If we're in an app-intercept, check if there's an index.htm file in the directory
        if (request.url.startsWith(APP_INTERCEPT)) {
          const indexHtmlPath = path.join(fullPath, 'index.htm');
          if (fs.existsSync(indexHtmlPath)) {
            return serveFile(indexHtmlPath);
          }
        }

        // Generate directory listing
        const files = await fs.promises.readdir(fullPath);
        const listing = generateDirectoryListing(fullPath, files);
        return new Response(listing, {
          status: 200,
          headers: {
            'Content-Type': 'text/html'
          }
        });
      } else {
        try {
          return await serveFile(fullPath);
        } catch (error) {
          // Handle specific file read errors
          if (error.code === 'EACCES') {
            return new Response(generateErrorPage(
              'Access Denied',
              'You do not have permission to access this file'
            ), {
              status: 403,
              headers: {
                'Content-Type': 'text/html'
              }
            });
          }

          // Re-throw other errors to be caught by outer try-catch
          throw error;
        }
      }
    } catch (error) {
      const errorPage = generateErrorPage(
        'Internal Server Error',
        `An error occurred while processing your request: ${error.message}`
      );
      return new Response(errorPage, {
        status: 500,
        headers: {
          'Content-Type': 'text/html'
        }
      });
    }
  });
}

function getFilePath(url: string) {
  let urlPath: string;
  let fullPath: string;
  let decodedPath: string;

  if (url.startsWith(APP_INTERCEPT)) {
    fullPath = path.resolve(__dirname, '../../../static/www', url.replace(APP_INTERCEPT, ''));
    decodedPath = '.';
  } else if (url.startsWith(MY_COMPUTER_INTERCEPT)) {
    urlPath = url.replace(MY_COMPUTER_INTERCEPT, '');
    decodedPath = decodeURIComponent(urlPath);
    fullPath = path.join('/', decodedPath);
  } else {
    throw new Error('Invalid URL');
  }

  return { fullPath, decodedPath };
}

async function serveFile(fullPath: string): Promise<Response> {
  const fileData = await fs.promises.readFile(fullPath);

  // Determine content type based on file extension
  const ext = path.extname(fullPath).toLowerCase();
  let contentType = 'application/octet-stream';

  // Common content types
  const contentTypes: Record<string, string> = {
    '.htm': 'text/html',
    '.html': 'text/html',
    '.txt': 'text/plain',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif'
  };

  if (ext in contentTypes) {
    contentType = contentTypes[ext];
  }

  return new Response(fileData, {
    status: 200,
    headers: {
      'Content-Type': contentType
    }
  });
}

