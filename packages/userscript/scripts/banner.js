const pkg = require('../package.json');
console.log(`// ==UserScript==
// @name         P-Stream Helper
// @namespace    https://pstream.net/
// @version      ${pkg.version}
// @description  ${pkg.description}
// @author       Duplicake, P-Stream Team, XP Technologies
// @icon         https://raw.githubusercontent.com/xp-technologies-dev/p-stream/production/public/mstile-150x150.jpeg
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// @connect      *
// ==/UserScript==`);
