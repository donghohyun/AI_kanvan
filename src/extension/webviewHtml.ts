import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { Locale } from '../shared/i18n';

export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, locale: Locale): string {
  const nonce = randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    // TASK-3 CV-1: 카드 canvas는 확장 프로그램이 변환한 코드를 웹뷰에서 실행한다.
    `script-src 'nonce-${nonce}' 'unsafe-eval'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${style}">
<title>Agent Board</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
