use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use bytes::Bytes;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use url::Url;

const PORT: u16 = 47823;
const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const CHANNEL: &str = "bitchord-bridge";
const PROTOCOL: u8 = 1;

struct AppState {
    client: reqwest::Client,
}

pub fn spawn() {
    tauri::async_runtime::spawn(async {
        if let Err(error) = serve().await {
            eprintln!("[bridge] {error}");
        }
    });
}

async fn serve() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // No whole-request timeout: audio is streamed and a long track can outlive
    // any fixed cap. Connect timeouts are the useful guard here.
    let client = reqwest::Client::builder()
        .user_agent(UA)
        .connect_timeout(Duration::from_secs(15))
        .build()?;

    let state = Arc::new(AppState { client });

    let app = Router::new()
        .route("/health", get(health))
        .route("/bridge", post(bridge))
        .route("/log", post(page_log))
        .route("/proxy", get(proxy).post(proxy).head(proxy))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await?;
    eprintln!("[bridge] listening on 127.0.0.1:{PORT}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> &'static str {
    "ok"
}

#[derive(Debug, Deserialize)]
struct HttpRequest {
    url: String,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default, rename = "bodyEncoding")]
    body_encoding: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YtFetchParams {
    #[serde(flatten)]
    request: HttpRequest,
    #[serde(default)]
    auth: Option<bool>,
}

#[derive(Debug, Serialize)]
struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
    #[serde(rename = "bodyEncoding")]
    body_encoding: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct ProxyQuery {
    url: String,
}

#[derive(Debug, Deserialize)]
struct LogEntry {
    level: String,
    message: String,
    #[serde(default)]
    about: Option<String>,
}

/// Mirrors the page's track log into the dev terminal. The page keeps the
/// canonical copy; this is only so a playback failure is visible without
/// opening the Debug page.
async fn page_log(Json(entry): Json<LogEntry>) -> StatusCode {
    if cfg!(debug_assertions) {
        let about = entry
            .about
            .map(|about| format!("[{about}] "))
            .unwrap_or_default();
        eprintln!("[page:{}] {about}{}", entry.level, entry.message);
    }
    StatusCode::NO_CONTENT
}

async fn bridge(State(state): State<Arc<AppState>>, Json(request): Json<Value>) -> Json<Value> {
    let id = request
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let params = request
        .get("params")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let body = match handle_bridge(&state, method, params).await {
        Ok(result) => json!({
            "channel": CHANNEL,
            "protocol": PROTOCOL,
            "direction": "to-page",
            "id": id,
            "ok": true,
            "result": result,
        }),
        Err((code, message)) => json!({
            "channel": CHANNEL,
            "protocol": PROTOCOL,
            "direction": "to-page",
            "id": id,
            "ok": false,
            "error": { "code": code, "message": message },
        }),
    };

    Json(body)
}

async fn handle_bridge(
    state: &AppState,
    method: &str,
    params: Value,
) -> Result<Value, (&'static str, String)> {
    match method {
        "ping" => Ok(json!({
            "version": env!("CARGO_PKG_VERSION"),
            "protocol": PROTOCOL,
            "browser": "chromium",
            "capabilities": ["yt", "yt.auth"],
        })),
        "yt.authState" | "yt.selectChannel" | "yt.setConnected" => Ok(signed_out()),
        "yt.fetch" => {
            let params: YtFetchParams =
                serde_json::from_value(params).map_err(|error| ("internal", error.to_string()))?;
            if params.auth.unwrap_or(false) {
                return Err((
                    "unauthenticated",
                    "Signed-in requests are not available in this build".into(),
                ));
            }
            let response = fetch_http(state, &params.request, true)
                .await
                .map_err(|error| ("network", error))?;
            serde_json::to_value(response).map_err(|error| ("internal", error.to_string()))
        }
        _ => Err((
            "unsupported",
            format!("{method} is not available in the native bridge"),
        )),
    }
}

fn signed_out() -> Value {
    json!({
        "browserSignedIn": false,
        "connected": false,
        "signedIn": false,
        "accounts": [],
        "active": null,
        "problem": null,
    })
}

async fn fetch_http(
    state: &AppState,
    request: &HttpRequest,
    extension_request: bool,
) -> Result<HttpResponse, String> {
    let url = Url::parse(&request.url).map_err(|error| error.to_string())?;
    if !is_youtube_host(&url) {
        return Err(format!("yt.fetch cannot reach {url}"));
    }

    let method = reqwest::Method::from_bytes(
        request.method.as_deref().unwrap_or("GET").as_bytes(),
    )
    .map_err(|error| error.to_string())?;

    let mut headers = HeaderMap::new();
    for (key, value) in &request.headers {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(key.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            headers.append(name, value);
        }
    }
    apply_upstream_headers(&url, &mut headers, extension_request);

    let mut builder = state.client.request(method, url.clone()).headers(headers);
    if let Some(body) = &request.body {
        let bytes = if request.body_encoding.as_deref() == Some("base64") {
            B64.decode(body).map_err(|error| error.to_string())?
        } else {
            body.as_bytes().to_vec()
        };
        builder = builder.body(bytes);
    }

    let response = builder.send().await.map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    if cfg!(debug_assertions) {
        eprintln!(
            "[bridge] yt.fetch {}{} -> {status}",
            url.host_str().unwrap_or_default(),
            url.path()
        );
    }
    let final_url = response.url().to_string();
    let headers = headers_to_map(response.headers());
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_lowercase();
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let textual = content_type.contains("json")
        || content_type.contains("text")
        || content_type.contains("javascript")
        || content_type.contains("xml");
    let (body, body_encoding) = if textual {
        (String::from_utf8_lossy(&bytes).to_string(), "text")
    } else {
        (B64.encode(&bytes), "base64")
    };

    Ok(HttpResponse {
        status,
        headers,
        body,
        body_encoding: body_encoding.to_string(),
        url: final_url,
    })
}

async fn proxy(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ProxyQuery>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    match proxy_inner(&state, query, method, headers, body).await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("[bridge] proxy error: {error}");
            (StatusCode::BAD_GATEWAY, format!("bridge proxy: {error}")).into_response()
        }
    }
}

async fn proxy_inner(
    state: &AppState,
    query: ProxyQuery,
    method: Method,
    incoming: HeaderMap,
    body: Bytes,
) -> Result<Response, String> {
    let url = Url::parse(&query.url).map_err(|error| error.to_string())?;
    if !is_youtube_host(&url) {
        return Err(format!("proxy cannot reach {url}"));
    }

    let upstream_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .map_err(|error| error.to_string())?;

    let mut headers = incoming;
    apply_upstream_headers(&url, &mut headers, false);

    let mut builder = state
        .client
        .request(upstream_method, url.clone())
        .headers(headers);
    if method != Method::GET && method != Method::HEAD {
        builder = builder.body(body);
    }

    let upstream = builder.send().await.map_err(|error| error.to_string())?;
    let status = upstream.status();
    if cfg!(debug_assertions) {
        eprintln!(
            "[proxy] {} {}{} -> {}",
            method.as_str(),
            url.host_str().unwrap_or_default(),
            url.path(),
            status.as_u16()
        );
    }
    let upstream_headers = upstream.headers().clone();
    let content_encoding = upstream_headers.contains_key(header::CONTENT_ENCODING);

    let mut response_headers = HeaderMap::new();
    for name in [
        header::CONTENT_TYPE,
        header::CONTENT_LENGTH,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
        header::ETAG,
        header::LAST_MODIFIED,
        header::CACHE_CONTROL,
        header::EXPIRES,
        header::VARY,
    ] {
        if let Some(value) = upstream_headers.get(&name) {
            response_headers.insert(name, value.clone());
        }
    }
    // reqwest decompresses the body it streams; the upstream length then
    // describes the compressed bytes, not what the page will read.
    if content_encoding {
        response_headers.remove(header::CONTENT_LENGTH);
    }

    let stream = upstream
        .bytes_stream()
        .map(|chunk| chunk.map_err(std::io::Error::other));

    let mut response = Response::new(Body::from_stream(stream));
    *response.status_mut() = status;
    *response.headers_mut() = response_headers;
    Ok(response)
}

fn is_youtube_host(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    host == "youtube.com"
        || host.ends_with(".youtube.com")
        || host == "googlevideo.com"
        || host.ends_with(".googlevideo.com")
}

fn headers_to_map(headers: &HeaderMap) -> HashMap<String, String> {
    let mut result = HashMap::new();
    for (name, value) in headers {
        if let Ok(value) = value.to_str() {
            result.insert(name.as_str().to_lowercase(), value.to_string());
        }
    }
    result
}

fn apply_upstream_headers(url: &Url, headers: &mut HeaderMap, extension_request: bool) {
    for name in [
        "host",
        "origin",
        "referer",
        "x-origin",
        "cookie",
        "content-length",
        "accept-encoding",
        "connection",
        "proxy-connection",
        "transfer-encoding",
        "upgrade",
    ] {
        headers.remove(name);
    }

    headers.insert(header::USER_AGENT, HeaderValue::from_static(UA));
    headers.insert(
        header::ACCEPT_LANGUAGE,
        HeaderValue::from_static("en-US,en;q=0.9"),
    );

    let host = url.host_str().unwrap_or_default();
    let path = url.path();
    let music = host == "music.youtube.com";
    let www = host == "www.youtube.com" || host == "youtube.com";
    let google = host.ends_with("googlevideo.com");
    let stats = host == "s.youtube.com" || path.starts_with("/api/stats/");
    let origin = if music || stats {
        Some("https://music.youtube.com")
    } else if www {
        Some("https://www.youtube.com")
    } else {
        None
    };

    if extension_request {
        if let Some(origin) = origin {
            insert_origin(headers, origin);
        }
        return;
    }

    if google {
        if !url.query().unwrap_or_default().contains("c=VISIONOS") {
            insert_origin(headers, "https://www.youtube.com");
        }
        return;
    }

    if (music || www) && path.starts_with("/youtubei/") {
        let origin = if music {
            "https://music.youtube.com"
        } else {
            "https://www.youtube.com"
        };
        insert_origin(headers, origin);
        headers.insert(
            HeaderName::from_static("x-origin"),
            HeaderValue::from_static(origin),
        );
    }
}

fn insert_origin(headers: &mut HeaderMap, origin: &'static str) {
    headers.insert(header::ORIGIN, HeaderValue::from_static(origin));
    let referer = format!("{origin}/");
    if let Ok(value) = HeaderValue::from_str(&referer) {
        headers.insert(header::REFERER, value);
    }
}
