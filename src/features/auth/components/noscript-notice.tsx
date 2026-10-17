const NOSCRIPT_TEXT = "Sunvibe needs JavaScript to sign in. Turn on JavaScript in your browser, then reload this page.";

/** Sign-in runs in the browser (the browser holds the session), so the auth pages say so when JavaScript is off. */
export function NoscriptNotice() {
  return (
    <noscript>
      <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {NOSCRIPT_TEXT}
      </p>
    </noscript>
  );
}
