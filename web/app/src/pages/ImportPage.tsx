import { PageHeader } from '@/components/PageHeader';
import { useRefreshYtAuth, useYtAuth } from '@/extension/useYtAuth';
import { isTv } from '@/tv/tvMode';

const command = 'scripts/import-tv-cookies.sh <tv-ip> cookies.txt';

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
              Google blocks its sign-in inside the TV app. Sign in on a computer instead, then
              import that session here.
            </p>

            <ol className="mt-5 list-decimal space-y-3 ps-5 type-body">
              <li>
                On the computer, open <span className="font-semibold">music.youtube.com</span> and
                sign in to the Google account.
              </li>
              <li>
                Open the browser developer tools (F12), switch to{' '}
                <span className="font-semibold">Network</span>, reload the page, and select a
                request to <span className="font-semibold">music.youtube.com</span>.
              </li>
              <li>
                In <span className="font-semibold">Request Headers</span>, copy the{' '}
                <span className="font-semibold">Cookie</span> value and save it as{' '}
                <span className="font-semibold">cookies.txt</span>.
              </li>
              <li>
                From the <span className="font-semibold">bitchord-lite</span> folder on the
                computer, run:
              </li>
            </ol>

            <code className="mt-3 block w-full overflow-x-auto rounded-[8px] bg-quinary px-4 py-3 type-[500_14px/22px] text-primary">
              {command}
            </code>

            <p className="mt-4 type-callout text-tertiary">
              The TV needs its IP from Settings, Network. The TV app restarts signed in.
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
