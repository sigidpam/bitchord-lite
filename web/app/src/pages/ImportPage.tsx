import { PageHeader } from '@/components/PageHeader';
import { useRefreshYtAuth, useYtAuth } from '@/extension/useYtAuth';
import { isTv } from '@/tv/tvMode';

const command = `scripts/import-tv-cookies.sh --check ~/music.har
scripts/import-tv-cookies.sh <tv-ip> ~/music.har`;

/**
 * Google refuses its sign-in inside the Android WebView. The TV therefore
 * imports a session from a browser on the same network: the cookie header
 * goes through the app's loopback bridge and is persisted on the TV.
 */
export default function ImportPage() {
  const status = useYtAuth();
  const refresh = useRefreshYtAuth();
  const auth = status.state === 'ready' ? status.auth : null;

  return (
    <>
      <PageHeader title="TV Sign-In" />
      <div className="mx-(--body-gutter) max-w-[760px] pb-40 text-primary">
        {!isTv ? (
          <p className="type-body text-secondary">This screen is for the Android TV app.</p>
        ) : (
          <>
            <p className="type-body text-secondary">
              Google blocks its sign-in inside the TV app. Sign in on a computer and export a HAR
              with sensitive data, then import it here.
            </p>

            <ol className="mt-5 list-decimal space-y-3 ps-5 type-body">
              <li>
                On the computer, open <span className="font-semibold">music.youtube.com</span> and
                sign in to the Google account.
              </li>
              <li>
                Open the developer tools (F12), then Settings (F1). Under{' '}
                <span className="font-semibold">Preferences, Network</span>, enable{' '}
                <span className="font-semibold">Allow to generate HAR with sensitive data</span>.
              </li>
              <li>
                In <span className="font-semibold">Network</span>, reload the page, then export the
                HAR. Click the download arrow, or right-click a request and choose{' '}
                <span className="font-semibold">Save all as HAR with content</span>. Save it as{' '}
                <span className="font-semibold">music.har</span>.
              </li>
              <li>
                From the <span className="font-semibold">bitchord-lite</span> folder on the
                computer, run:
              </li>
            </ol>

            <code className="mt-3 block w-full overflow-x-auto whitespace-pre-wrap rounded-[8px] bg-quinary px-4 py-3 type-[500_14px/22px] text-primary">
              {command}
            </code>

            <p className="mt-4 type-callout text-tertiary">
              The TV needs its IP from Settings, Network. The TV app restarts signed in. Delete
              music.har and turn the setting off after the import.
            </p>

            <div className="mt-6 flex items-center gap-4">
              <button
                className="rounded-[8px] bg-key px-4 py-2 type-body-emphasized text-white disabled:opacity-60"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
              >
                {refresh.isPending ? 'Checking…' : 'Check again'}
              </button>
              <span className="type-body text-secondary">
                {auth?.signedIn && auth.active
                  ? `Signed in as ${auth.active.name}.`
                  : auth?.problem
                    ? auth.problem
                    : 'Not signed in yet.'}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
