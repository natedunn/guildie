// The few HTML pages the Worker shows itself: the consent page (before the
// player is sent to guildie.club to confirm who they are) and errors. Dark and
// plain like the app. Everything the client chose (its name) is escaped.

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const STYLE = `
:root { color-scheme: dark; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f0f10; color: #e7e7e9;
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { width: min(420px, calc(100vw - 32px)); padding: 24px; border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 6px; background: #161618; }
h1 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
p { margin: 0 0 12px; color: #a1a1a8; }
strong { color: #e7e7e9; font-weight: 500; }
.warn { color: #e7e7e9; border-left: 2px solid rgb(255 255 255 / 24%); padding-left: 10px; }
form { display: flex; gap: 8px; margin-top: 20px; }
button { font: inherit; height: 32px; padding: 0 14px; border-radius: 6px; border: 1px solid rgb(255 255 255 / 8%);
  background: transparent; color: #e7e7e9; cursor: pointer; }
button.primary { background: #e7e7e9; color: #0f0f10; border-color: transparent; }
`;

function page(title: string, body: string) {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Guildie</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

export type ConsentFacts = {
	clientName: string;
	/** Set for clients identified by a metadata document URL (CIMD): the domain that vouches for the name. */
	clientDomain?: string;
	redirectHost: string;
	redirectIsLoopback: boolean;
};

/** "Allow Claude to read your guild data?" The form posts back to /authorize with the handle. */
export function consentPage(facts: ConsentFacts, handle: string) {
	const name = escapeHtml(facts.clientName);
	const origin = facts.clientDomain
		? `Published by <strong>${escapeHtml(facts.clientDomain)}</strong>.`
		: "This app named itself; Guildie can't verify the name.";
	return page(
		`Connect ${facts.clientName}`,
		`<h1>Let ${name} read your Guildie data?</h1>
<p>It will see what you see on Guildie: your guilds' rosters, characters, gear, crafters, requests and activity, and your own bags and banks. It can't change anything.</p>
<p>${origin} Access goes to <strong>${escapeHtml(facts.redirectHost)}</strong>.</p>
${
	facts.redirectIsLoopback
		? `<p class="warn">This sends access to an app on your computer. Continue only if you just started connecting from it.</p>`
		: ""
}
<p>Next, you'll confirm your account on Guildie. Disconnect it any time in Settings.</p>
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
<button class="primary" name="decision" value="approve">Continue</button>
<button name="decision" value="deny">Cancel</button>
</form>`,
	);
}

export function messagePage(title: string, message: string, status = 400) {
	return new Response(page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`), {
		status,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"Content-Security-Policy": "frame-ancestors 'none'",
			"X-Frame-Options": "DENY",
		},
	});
}

/** The bare origin: what this server is, and the address to give an AI app. */
export function homePage(mcpUrl: string) {
	return new Response(
		page(
			"MCP server",
			`<h1>Guildie for AI apps</h1>
<p>Add <strong>${escapeHtml(mcpUrl)}</strong> as a custom connector (Claude) or app (ChatGPT), then sign in with your Guildie account.</p>
<p>It can read your guilds' data, never change it.</p>`,
		),
		{ headers: { "Content-Type": "text/html; charset=utf-8" } },
	);
}
