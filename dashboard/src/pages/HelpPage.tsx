export function HelpPage() {
  return (
    <article className="prose-simbox max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Help</h1>
      <p className="mt-2 text-sm text-ink-soft">
        How to publish a SimBox case with anonymous usage tracking. Never put a service-role key in
        GitHub, Storyline, Wix, or this dashboard’s public environment variables.
      </p>

      <ol className="mt-8 list-decimal space-y-4 pl-5 text-sm leading-6">
        <li>
          <strong>Create and publish the Articulate Storyline case</strong> as HTML5. Keep the default
          folder names (<code className="font-mono">story_content</code>, <code className="font-mono">html5</code>,{" "}
          <code className="font-mono">mobile</code>).
        </li>
        <li>
          <strong>Create a GitHub repository</strong> named like <code className="font-mono">SimBox_Penetrating_Trauma</code> and
          enable GitHub Pages from the default branch root.
        </li>
        <li>
          <strong>Add the tracking script</strong> file <code className="font-mono">simbox-tracking.js</code> at the
          repository root (copy from this project’s <code className="font-mono">public/simbox-tracking.js</code>).
        </li>
        <li>
          <strong>Add the tracking configuration</strong> in <code className="font-mono">index.html</code> immediately
          after <code className="font-mono">story_content/user.js</code>. Use the snippet from the Cases page. Only
          the public function URL belongs there — not a service-role key.
        </li>
        <li>
          <strong>Reference the script safely</strong> with{" "}
          <code className="font-mono">{`<script src="simbox-tracking.js"></script>`}</code> after the config
          block so <code className="font-mono">SimBoxTracking</code> exists before the player runs.
        </li>
        <li>
          <strong>Ensure Storyline start/end triggers call the expected functions.</strong> For
          Penetrating Trauma, do <em>not</em> reuse the existing countdown scripts. In Storyline,
          add Execute JavaScript on the Intro slide: <code className="font-mono">SimBoxTracking.start();</code> and
          on Debrief &amp; Feedback: <code className="font-mono">SimBoxTracking.complete();</code> then republish.
          Exit is handled automatically on <code className="font-mono">pagehide</code>.
        </li>
        <li>
          <strong>Add the case on the Cases page</strong> with the same <code className="font-mono">case_key</code> as
          the GitHub repository name.
        </li>
        <li>
          <strong>Test GitHub-direct usage</strong> by opening the Pages URL in a top-level tab. Confirm{" "}
          <code className="font-mono">delivery_context</code> is <code className="font-mono">github_direct</code>.
        </li>
        <li>
          <strong>Test Wix-embedded usage</strong> via the iframe on emergencysimbox.com. Confirm{" "}
          <code className="font-mono">wix_embedded</code>.
        </li>
        <li>
          <strong>Confirm events</strong> on Overview and Events. Include seed/test events only while developing.
        </li>
      </ol>

      <h2 className="font-serif mt-10 text-2xl text-ink">Troubleshooting</h2>
      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="font-medium">CORS rejection</dt>
          <dd className="text-ink-soft">
            The browser Origin for both direct and Wix-iframe viewers is the GitHub Pages origin
            (for example <code className="font-mono">https://blmichaels.github.io</code>). Add it to the Edge
            Function secret <code className="font-mono">ALLOWED_ORIGINS</code> and redeploy the function.
          </dd>
        </div>
        <div>
          <dt className="font-medium">404 GitHub Pages site</dt>
          <dd className="text-ink-soft">
            Pages must serve from the branch root, and <code className="font-mono">index.html</code> must be at
            the repository root. Wait a few minutes after the first push.
          </dd>
        </div>
        <div>
          <dt className="font-medium">No events arriving</dt>
          <dd className="text-ink-soft">
            Confirm the case key matches an <em>active</em> Cases row, the endpoint URL uses your
            project ref, and Storyline actually calls <code className="font-mono">start()</code>. Enable{" "}
            <code className="font-mono">debug: true</code> temporarily and watch the console.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Duplicate events</dt>
          <dd className="text-ink-soft">
            The adapter and the database both key on session + event type. Repeating a trigger in
            one tab should not create extra rows. A new tab gets a new anonymous session.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Events from GitHub but not from Wix</dt>
          <dd className="text-ink-soft">
            Wix still loads GitHub Pages inside the iframe. If the embed uses a different URL
            (www vs non-www, or a Wix CDN copy), add that origin to CORS. Confirm the iframe{" "}
            <code className="font-mono">src</code> is the Pages URL, not a downloaded copy missing{" "}
            <code className="font-mono">simbox-tracking.js</code>.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Dashboard authorization denied</dt>
          <dd className="text-ink-soft">
            Signing in is not enough. After registration, run{" "}
            <code className="font-mono">supabase/sql/designate-first-admin.sql</code> with the account email.
          </dd>
        </div>
      </dl>
    </article>
  );
}
