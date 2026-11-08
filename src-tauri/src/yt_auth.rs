use std::sync::Mutex;
use std::time::Duration;

use futures_util::future::join_all;
use serde::Serialize;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const MUSIC_ORIGIN: &str = "https://music.youtube.com";
/** Any recent WEB_REMIX version is accepted for the account endpoints. */
const WEB_REMIX_VERSION: &str = "1.20251006.03.00";
const SIGNING_COOKIES: [&str; 3] = ["SAPISID", "__Secure-3PAPISID", "__Secure-1PAPISID"];
const SESSION_COOKIES: [&str; 6] = [
    "SAPISID",
    "__Secure-3PAPISID",
    "__Secure-1PAPISID",
    "SID",
    "__Secure-1PSID",
    "__Secure-3PSID",
];
const MAX_LOGINS: usize = 10;
#[cfg(desktop)]
const SAFARI_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct YtChannel {
    pub id: String,
    pub name: String,
    pub handle: Option<String>,
    pub avatar_url: Option<String>,
    pub brand: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct YtAccount {
    pub auth_user: String,
    pub name: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub channels: Vec<YtChannel>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActiveChannel {
    pub id: String,
    pub name: String,
    pub handle: Option<String>,
    pub avatar_url: Option<String>,
    pub brand: bool,
    pub auth_user: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct YtAuthState {
    pub browser_signed_in: bool,
    pub connected: bool,
    pub signed_in: bool,
    pub accounts: Vec<YtAccount>,
    pub active: Option<ActiveChannel>,
    pub problem: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Identity {
    pub auth_user: String,
    pub page_id: Option<String>,
}

#[derive(Clone)]
struct Snapshot {
    state: YtAuthState,
    identity: Option<Identity>,
    cookie_header: String,
    secret: Option<String>,
}

#[derive(Clone)]
struct Cached {
    fingerprint: String,
    snapshot: Snapshot,
}

pub struct AuthStore {
    cached: Mutex<Option<Cached>>,
    connected: Mutex<bool>,
    selected: Mutex<Option<String>>,
    /// Android has no cookie jar API in Rust: the TV login WebView hands the
    /// music.youtube.com cookies to the page, which posts them here.
    #[cfg(mobile)]
    injected: Mutex<Vec<(String, String)>>,
}

impl Default for AuthStore {
    fn default() -> Self {
        Self {
            cached: Mutex::new(None),
            connected: Mutex::new(true),
            selected: Mutex::new(None),
            #[cfg(mobile)]
            injected: Mutex::new(Vec::new()),
        }
    }
}

/// The signed headers for one request. The bridge inserts these after its
/// ordinary YouTube headers, so the cookie and signature win.
#[derive(Clone)]
pub struct SignedRequest {
    pub cookie: String,
    pub authorization: String,
    pub auth_user: String,
    pub page_id: Option<String>,
    pub x_origin: String,
}

#[cfg(desktop)]
fn cookies(app: &AppHandle, _store: &AuthStore, url: &str) -> Vec<(String, String)> {
    let Some(window) = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window("yt-login"))
    else {
        return Vec::new();
    };
    let Ok(url) = Url::parse(url) else {
        return Vec::new();
    };
    window
        .cookies_for_url(url)
        .unwrap_or_default()
        .into_iter()
        .map(|cookie| (cookie.name().to_string(), cookie.value().to_string()))
        .collect()
}

#[cfg(mobile)]
fn cookies(_app: &AppHandle, store: &AuthStore, _url: &str) -> Vec<(String, String)> {
    store
        .injected
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
}

/// The Android login screen posts its cookie jar here after the user signs in.
#[cfg(mobile)]
pub fn set_cookies(store: &AuthStore, cookies: Vec<(String, String)>) {
    *store
        .injected
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = cookies;
    if let Ok(mut cache) = store.cached.lock() {
        *cache = None;
    }
}

fn cookie_header(cookies: &[(String, String)]) -> String {
    cookies
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ")
}

fn signing_secret(cookies: &[(String, String)]) -> Option<String> {
    for name in SIGNING_COOKIES {
        if let Some((_, value)) = cookies.iter().find(|(cookie, value)| cookie == name && !value.is_empty()) {
            return Some(value.clone());
        }
    }
    None
}

/// Only the cookies whose arrival or departure means a sign-in/out; rotating
/// SIDCC and friends must not invalidate the account cache.
fn fingerprint(cookies: &[(String, String)]) -> String {
    let mut pairs: Vec<_> = cookies
        .iter()
        .filter(|(name, _)| SESSION_COOKIES.contains(&name.as_str()))
        .collect();
    pairs.sort_by(|a, b| a.0.cmp(&b.0));
    pairs
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join(";")
}

fn sapisid_hash(secret: &str, origin: &str) -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut hasher = Sha1::new();
    hasher.update(format!("{timestamp} {secret} {origin}"));
    let digest = hasher.finalize();
    let hex = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("SAPISIDHASH {timestamp}_{hex}")
}

fn signed_out(browser_signed_in: bool, connected: bool) -> YtAuthState {
    YtAuthState {
        browser_signed_in,
        connected,
        signed_in: false,
        accounts: Vec::new(),
        active: None,
        problem: None,
    }
}

/// The current account, read from the app's own cookie jar. The signed-out
/// Tauri build has no cookies; after the login window finishes they appear and
/// the cache fingerprint changes.
async fn snapshot(
    app: &AppHandle,
    client: &reqwest::Client,
    store: &AuthStore,
    refresh: bool,
) -> Snapshot {
    let cookies = cookies(app, store, MUSIC_ORIGIN);
    let fingerprint = fingerprint(&cookies);

    if !refresh {
        if let Ok(cache) = store.cached.lock() {
            if let Some(cached) = cache.as_ref() {
                if cached.fingerprint == fingerprint {
                    return cached.snapshot.clone();
                }
            }
        }
    }

    let connected = *store.connected.lock().unwrap_or_else(|error| error.into_inner());
    let secret = signing_secret(&cookies);
    let browser_signed_in = secret.is_some();
    let (state, identity) = if !browser_signed_in {
        (signed_out(false, connected), None)
    } else if !connected {
        (signed_out(true, false), None)
    } else {
        match discover(client, &cookies, secret.as_deref().unwrap_or_default()).await {
            Some((account, active)) => {
                let identity = Identity {
                    auth_user: active.auth_user.clone(),
                    page_id: None,
                };
                let state = YtAuthState {
                    browser_signed_in: true,
                    connected: true,
                    signed_in: true,
                    accounts: vec![account],
                    active: Some(active),
                    problem: None,
                };
                (state, Some(identity))
            }
            None => (
                YtAuthState {
                    browser_signed_in: true,
                    connected: true,
                    signed_in: false,
                    accounts: Vec::new(),
                    active: None,
                    problem: Some(
                        "YouTube did not return an account for this session. Try signing in again."
                            .to_string(),
                    ),
                },
                None,
            ),
        }
    };

    let snapshot = Snapshot {
        state,
        identity,
        cookie_header: cookie_header(&cookies),
        secret,
    };
    if let Ok(mut cache) = store.cached.lock() {
        *cache = Some(Cached {
            fingerprint,
            snapshot: snapshot.clone(),
        });
    }
    snapshot
}

pub async fn auth_state(
    app: &AppHandle,
    client: &reqwest::Client,
    store: &AuthStore,
    refresh: bool,
) -> YtAuthState {
    snapshot(app, client, store, refresh).await.state
}

pub fn set_connected(store: &AuthStore, connected: bool) {
    *store.connected.lock().unwrap_or_else(|error| error.into_inner()) = connected;
    if let Ok(mut cache) = store.cached.lock() {
        *cache = None;
    }
}

pub fn select_channel(store: &AuthStore, channel_id: &str) {
    *store.selected.lock().unwrap_or_else(|error| error.into_inner()) =
        Some(channel_id.to_string());
    if let Ok(mut cache) = store.cached.lock() {
        *cache = None;
    }
}

/// The cookies and signature for an authenticated bridge request to [url].
pub async fn signed_request(
    app: &AppHandle,
    client: &reqwest::Client,
    store: &AuthStore,
    url: &Url,
) -> Option<SignedRequest> {
    let snapshot = snapshot(app, client, store, false).await;
    let identity = snapshot.identity.clone()?;

    let url_cookies = cookies(app, store, url.as_str());
    let (cookie, secret, auth_user, page_id) = if signing_secret(&url_cookies).is_some() {
        (
            cookie_header(&url_cookies),
            signing_secret(&url_cookies)?,
            identity.auth_user,
            identity.page_id,
        )
    } else {
        (
            snapshot.cookie_header.clone(),
            snapshot.secret.clone()?,
            identity.auth_user,
            identity.page_id,
        )
    };

    let origin = url.origin().ascii_serialization();
    Some(SignedRequest {
        cookie,
        authorization: sapisid_hash(&secret, &origin),
        auth_user,
        page_id,
        x_origin: origin,
    })
}

/// Opens Google's sign-in in its own webview, then closes it once the YouTube
/// signing cookie arrives. The page polls `yt.authState` while it is open.
#[cfg(desktop)]
pub fn open_login(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("yt-login") {
        let _ = window.set_focus();
        return Ok(());
    }

    let app_for_main = app.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = build_login(&app_for_main);
        let _ = tx.send(result);
    })
    .map_err(|error| error.to_string())?;
    rx.recv().map_err(|error| error.to_string())?
}

#[cfg(desktop)]
fn build_login(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("yt-login") {
        let _ = window.set_focus();
        return Ok(());
    }

    let url = Url::parse(
        "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F",
    )
    .map_err(|error| error.to_string())?;
    WebviewWindowBuilder::new(app, "yt-login", WebviewUrl::External(url))
        .title("Sign in to YouTube Music")
        .inner_size(520.0, 720.0)
        .center()
        .user_agent(SAFARI_UA)
        .build()
        .map_err(|error| error.to_string())?;

    let app_poll = app.clone();
    std::thread::spawn(move || {
        for _ in 0..300 {
            std::thread::sleep(Duration::from_secs(1));
            let Some(window) = app_poll.get_webview_window("yt-login") else {
                return;
            };
            let Ok(url) = Url::parse(MUSIC_ORIGIN) else {
                continue;
            };
            if let Ok(cookies) = window.cookies_for_url(url) {
                if cookies
                    .iter()
                    .any(|cookie| SIGNING_COOKIES.contains(&cookie.name()))
                {
                    let _ = window.close();
                    return;
                }
            }
        }
        if let Some(window) = app_poll.get_webview_window("yt-login") {
            let _ = window.close();
        }
    });

    Ok(())
}

/// The signed-in WebView on Android is opened by the page through a native
/// command, so the bridge itself has nothing to build.
#[cfg(mobile)]
pub fn open_login(_app: &AppHandle) -> Result<(), String> {
    Err("Sign-in is handled by the Android login screen".to_string())
}

async fn discover(
    client: &reqwest::Client,
    cookies: &[(String, String)],
    secret: &str,
) -> Option<(YtAccount, ActiveChannel)> {
    let mut tasks = Vec::with_capacity(MAX_LOGINS);
    for index in 0..MAX_LOGINS {
        tasks.push(account_menu(client, cookies, secret, index));
    }
    let results = join_all(tasks).await;

    for (index, result) in results.into_iter().enumerate() {
        let Ok(body) = result else { continue };
        let Some(header) = find_renderer(&body, "activeAccountHeaderRenderer") else {
            continue;
        };
        let auth_user = index.to_string();
        let name = text_of(&header["accountName"]).unwrap_or_else(|| "YouTube Music".to_string());
        let email = text_of(&header["email"]);
        let handle = text_of(&header["channelHandle"]);
        let avatar_url = photo_url(&header);
        let channel = YtChannel {
            id: format!("{auth_user}:own"),
            name: name.clone(),
            handle: handle.clone(),
            avatar_url: avatar_url.clone(),
            brand: false,
        };
        let active = ActiveChannel {
            id: channel.id.clone(),
            name: name.clone(),
            handle,
            avatar_url: avatar_url.clone(),
            brand: false,
            auth_user: auth_user.clone(),
        };
        let account = YtAccount {
            auth_user,
            name,
            email,
            avatar_url,
            channels: vec![channel],
        };
        return Some((account, active));
    }
    None
}

async fn account_menu(
    client: &reqwest::Client,
    cookies: &[(String, String)],
    secret: &str,
    auth_user: usize,
) -> Result<Value, ()> {
    let response = client
        .post(format!(
            "{MUSIC_ORIGIN}/youtubei/v1/account/account_menu?prettyPrint=false"
        ))
        .timeout(Duration::from_secs(4))
        .header("content-type", "application/json")
        .header("x-youtube-client-name", "67")
        .header("x-youtube-client-version", WEB_REMIX_VERSION)
        .header("origin", MUSIC_ORIGIN)
        .header("referer", format!("{MUSIC_ORIGIN}/"))
        .header("x-origin", MUSIC_ORIGIN)
        .header("authorization", sapisid_hash(secret, MUSIC_ORIGIN))
        .header("x-goog-authuser", auth_user.to_string())
        .header("cookie", cookie_header(cookies))
        .body(
            json!({
                "context": {
                    "client": {
                        "clientName": "WEB_REMIX",
                        "clientVersion": WEB_REMIX_VERSION,
                        "hl": "en",
                        "gl": "US"
                    },
                    "user": {}
                }
            })
            .to_string(),
        )
        .send()
        .await
        .map_err(|_| ())?;
    if !response.status().is_success() {
        return Err(());
    }
    let text = response.text().await.map_err(|_| ())?;
    serde_json::from_str::<Value>(&text).map_err(|_| ())
}

fn find_renderer<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(map) => {
            if let Some(found) = map.get(key) {
                return Some(found);
            }
            for child in map.values() {
                if let Some(found) = find_renderer(child, key) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => {
            for child in items {
                if let Some(found) = find_renderer(child, key) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

fn text_of(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.is_empty() => Some(text.clone()),
        Value::Object(map) => {
            if let Some(text) = map.get("simpleText").and_then(Value::as_str) {
                if !text.is_empty() {
                    return Some(text.to_string());
                }
            }
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                if !text.is_empty() {
                    return Some(text.to_string());
                }
            }
            if let Some(runs) = map.get("runs").and_then(Value::as_array) {
                let joined: String = runs
                    .iter()
                    .filter_map(|run| run.get("text").and_then(Value::as_str))
                    .collect();
                if !joined.is_empty() {
                    return Some(joined);
                }
            }
            None
        }
        _ => None,
    }
}

fn photo_url(value: &Value) -> Option<String> {
    for key in ["accountPhoto", "avatar"] {
        let Some(photo) = find_renderer(value, key) else {
            continue;
        };
        if let Some(thumbnails) = photo.get("thumbnails").and_then(Value::as_array) {
            for thumbnail in thumbnails.iter().rev() {
                if let Some(url) = thumbnail.get("url").and_then(Value::as_str) {
                    return Some(url.to_string());
                }
            }
        }
        if let Some(url) = photo.get("url").and_then(Value::as_str) {
            return Some(url.to_string());
        }
    }
    None
}
