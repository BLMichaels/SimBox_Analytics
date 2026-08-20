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
          <strong>Ensure Storyline start, checkpoints, and complete fire.</strong> Add Execute JavaScript
          on Intro: <code className="font-mono">SimBoxTracking.start();</code> and on Debrief:{" "}
          <code className="font-mono">SimBoxTracking.complete();</code>. For step-level funnels, also
          copy <code className="font-mono">simbox-case-hooks.js</code> into the case repo and load it after
          the tracking script, or call <code className="font-mono">SimBoxTracking.checkpoint()</code> on each
          numbered slide. Exit is handled on <code className="font-mono">pagehide</code>.
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
          <strong>Confirm events</strong> on Overview, the case dossier, and Events. Include seed/test events only while developing.
        </li>
      </ol>

      <h2 className="font-serif mt-10 text-2xl text-ink">Study fields: location, hospital, user</h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Storyline on GitHub Pages cannot see a named user, hospital, or mailing address. For academic extracts we store what can be resolved honestly:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
        <li>
          <strong>City, state/region, postal/ZIP, country, timezone</strong> are resolved by IP
          geolocation at ingest. The learner’s IP is used for the lookup only and is not stored.
        </li>
        <li>
          <strong>Site code</strong> (hospital or program identifier you assign) is recorded when the case URL includes{" "}
          <code className="font-mono">?simbox_site=HOSP01</code>. Only letters, numbers, underscore, and hyphen are accepted. This is not a hospital name.
        </li>
        <li>
          <strong>User identity and hospital name</strong> are not collected. The session ID is an anonymous random value in the browser tab.
        </li>
      </ul>
      <p className="mt-3 text-sm leading-6 text-ink-soft">
        Events recorded before locality lookup was enabled will show “Not resolved” until new sessions arrive.
        The Map page can show the world or a locked United States view (states, counties, or city-level locations).
      </p>

      <h2 className="font-serif mt-10 text-2xl text-ink">How counts and duration work</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
        <li>
          Overview, Map, Events, and Cases all use the same <strong>session-level</strong> extract: one
          anonymous browser tab is one start. Completions are sessions that reached <code className="font-mono">case_completed</code>.
        </li>
        <li>
          Duration prefers the reported <code className="font-mono">elapsed_seconds</code>. If that is missing, we use
          wall-clock from the first action to the last. Ingest caps elapsed at 12 hours.
        </li>
        <li>
          Minimum session length hides quick click-throughs. Export a study packet from Overview for an
          IRB-style note of filters, row counts, and truncation.
        </li>
        <li>
          If a date range is very large, a banner appears when not every event could be loaded. Narrow
          the period so numbers stay complete.
        </li>
        <li>
          Tracking health on Cases flags missing checkpoints or unresolved geography. Funnel and time-on-step
          reports need checkpoints wired in the published case.
        </li>
      </ul>

      <h2 className="font-serif mt-10 text-2xl text-ink">Inviting colleagues</h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Use the Access page to send an invite email. The public sign-in page does not create
        accounts. Removing access takes effect immediately; they will see “Not authorized” if they
        still have a saved session.
      </p>

      <h2 className="font-serif mt-10 text-2xl text-ink">Deleting events</h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Deleting from the event log removes the rows from the database and blocks those action keys
        from being recorded again, even if a case tab is still open. A new browser tab starts a new
        anonymous session and can still record new activity.
      </p>

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
