import { getEncoding } from "./encoding";
import { MY_COMPUTER_INTERCEPT } from "./fileserver";

export function generateErrorPage(errorMessage: string, requestedPath: string): string {
  return `
    <html>
    <head>
      ${getEncoding()}
      <title>Error - File Not Found</title>
    </head>
    <body>
      <h2>Error: ${errorMessage}</h2>
      <p>windows95 failed to find the file or directory on your host computer: <code>${requestedPath}</code></p>
      <p>Options:</p>
      <ul>
        <li><a href="${MY_COMPUTER_INTERCEPT}">Return to root directory</a></li>
        <li><a href="javascript:history.back()">Go back to previous page</a></li>
      </ul>
    </body>
    </html>
  `;
}
