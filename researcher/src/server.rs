use axum::{
    routing::{post, get, put},
    Router,
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response, Html, sse::{Event, Sse}},
};
use std::{
    sync::Arc,
    net::SocketAddr,
    convert::Infallible,
    time::{Duration, SystemTime, UNIX_EPOCH},
    env,
};
use crate::assistant::{
    configuration::Configuration,
    state::{SummaryStateInput, StatusUpdate},
    graph::ResearchGraph,
};
use tower_http::cors::CorsLayer;
use futures::stream::Stream;
use tokio::sync::broadcast;
use serde_json::json;
use serde::Deserialize;
use tokio::sync::Mutex;

#[derive(Deserialize)]
struct ConfigUpdate {
    local_llm: Option<String>,
    max_web_research_loops: Option<i32>,
}

pub struct AppState {
    graph: Arc<Mutex<ResearchGraph>>,
    status_tx: broadcast::Sender<StatusUpdate>,
}

#[derive(serde::Deserialize)]
pub struct ResearchRequest {
    topic: String,
}

#[derive(serde::Serialize)]
struct ResearchResponse {
    summary: String,
    status: String,
}

// Custom error type for our API
struct ApiError(anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ResearchResponse {
                summary: format!("Error: {}", self.0),
                status: "Error occurred".to_string(),
            })
        ).into_response()
    }
}

// Convert anyhow::Error into our ApiError
impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError(err)
    }
}

// Add this new struct for the config response
#[derive(serde::Serialize)]
struct ConfigResponse {
    local_llm: String,
    max_web_research_loops: i32,
}

pub async fn run_server(config: Configuration) {
    let (status_tx, _) = broadcast::channel(100);
    let status_tx_clone = status_tx.clone();

    let mut graph = ResearchGraph::new(config);
    graph.set_status_sender(status_tx_clone);

    let state = Arc::new(AppState {
        graph: Arc::new(Mutex::new(graph)),
        status_tx,
    });

    let app = Router::new()
        .route("/", get(serve_index))
        .route("/research", post(handle_research))
        .route("/config", put(update_config))
        .route("/config", get(get_config))
        .route("/status", get(status_stream))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string()).parse::<u16>().unwrap_or(3000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Starting server on http://localhost:{}", port);
    
    axum::serve(
        tokio::net::TcpListener::bind(&addr).await.unwrap(),
        app.into_make_service(),
    )
    .await
    .unwrap();
}

async fn serve_index() -> Html<&'static str> {
    Html(r#"
    <!DOCTYPE html>
    <html>
    <head>
        <title>Research Assistant</title>
        <style>
            :root {
                --bg-color: #1a1a1a;
                --text-color: #e0e0e0;
                --primary-color: #3498db;
                --secondary-color: #2c3e50;
                --success-color: #27ae60;
                --error-color: #e74c3c;
                --border-color: #2c2c2c;
            }
            
            body {
                font-family: 'Inter', -apple-system, sans-serif;
                background-color: var(--bg-color);
                color: var(--text-color);
                max-width: 1000px;
                margin: 0 auto;
                padding: 20px;
            }
            
            .container {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: 20px;
            }
            
            .main-content {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            
            .sidebar {
                background-color: var(--secondary-color);
                padding: 20px;
                border-radius: 8px;
            }
            
            textarea, input {
                width: 100%;
                padding: 10px;
                background-color: var(--secondary-color);
                border: 1px solid var(--border-color);
                color: var(--text-color);
                border-radius: 4px;
            }
            
            textarea {
                height: 100px;
                resize: vertical;
            }
            
            button {
                padding: 10px 20px;
                background-color: var(--primary-color);
                color: var(--text-color);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: opacity 0.2s;
            }
            
            button:hover {
                opacity: 0.9;
            }
            
            .step {
                padding: 12px;
                margin: 4px 0;
                background-color: var(--secondary-color);
                border-radius: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: all 0.3s ease;
                border-left: 4px solid transparent;
            }
            
            .step.active {
                background-color: var(--primary-color);
                border-left: 4px solid var(--text-color);
                transform: translateX(10px);
            }
            
            .step.completed {
                background-color: var(--success-color);
                border-left: 4px solid var(--text-color);
            }
            
            .thinking-trace {
                font-family: monospace;
                padding: 10px;
                background-color: var(--secondary-color);
                border-radius: 4px;
                margin-top: 10px;
                max-height: 200px;
                overflow-y: auto;
            }
            
            .timer {
                font-family: monospace;
                color: var(--text-color);
                min-width: 60px;
                text-align: right;
            }
            
            .timer.running {
                color: var(--primary-color);
            }
            
            #result {
                white-space: pre-wrap;
                padding: 20px;
                background-color: var(--secondary-color);
                border-radius: 4px;
                display: none;
            }
            
            .config-section {
                margin-top: 20px;
                padding: 15px;
                background-color: var(--secondary-color);
                border-radius: 4px;
            }
            
            .config-item {
                margin: 10px 0;
            }
            
            label {
                display: block;
                margin-bottom: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="main-content">
                <h1>Research Assistant</h1>
                <div>
                    <label for="topic">Research Topic:</label>
                    <textarea id="topic" placeholder="Enter your research topic..."></textarea>
                </div>
                <button onclick="submitResearch()">Start Research</button>
                <div id="steps">
                    <div class="step" id="step-query">
                        <span>1. Generating Search Query</span>
                        <span class="timer" id="timer-query">0.0s</span>
                    </div>
                    <div class="step" id="step-research">
                        <span>2. Web Research</span>
                        <span class="timer" id="timer-research">0.0s</span>
                    </div>
                    <div class="step" id="step-summary">
                        <span>3. Summarizing Results</span>
                        <span class="timer" id="timer-summary">0.0s</span>
                    </div>
                    <div class="step" id="step-reflection">
                        <span>4. Reflection & Follow-up</span>
                        <span class="timer" id="timer-reflection">0.0s</span>
                    </div>
                    <div class="step" id="step-final">
                        <span>5. Finalizing Results</span>
                        <span class="timer" id="timer-final">0.0s</span>
                    </div>
                </div>
                <div id="thinking-trace" class="thinking-trace"></div>
                <div id="result"></div>
            </div>
            
            <div class="sidebar">
                <h2>Configuration</h2>
                <div class="config-section">
                    <div class="config-item">
                        <label for="local-llm">Local LLM Model:</label>
                        <input type="text" id="local-llm" value="deepseek-r1:8b">
                    </div>
                    <div class="config-item">
                        <label for="max-loops">Max Research Loops:</label>
                        <input type="number" id="max-loops" value="3" min="1" max="10">
                    </div>
                    <button onclick="updateConfig()">Update Configuration</button>
                </div>
            </div>
        </div>

        <script>
        let currentStep = 0;
        let stepStartTimes = {};
        let stepElapsedTimes = {};
        let timerIntervals = {};
        const steps = ['query', 'research', 'summary', 'reflection', 'final'];
        let statusSource = null;

        function formatTime(seconds) {
            return `${seconds.toFixed(1)}s`;
        }

        function startTimer(step) {
            stepStartTimes[step] = Date.now();
            const timerEl = document.getElementById(`timer-${step}`);
            timerEl.classList.add('running');
            
            // Clear any existing interval
            if (timerIntervals[step]) {
                clearInterval(timerIntervals[step]);
            }
            
            // Start new interval
            timerIntervals[step] = setInterval(() => {
                const elapsed = (Date.now() - stepStartTimes[step]) / 1000;
                timerEl.textContent = formatTime(elapsed);
            }, 100);
        }

        function stopTimer(step) {
            if (timerIntervals[step]) {
                clearInterval(timerIntervals[step]);
                delete timerIntervals[step];
            }
            
            const timerEl = document.getElementById(`timer-${step}`);
            timerEl.classList.remove('running');
            
            // Store final elapsed time
            stepElapsedTimes[step] = (Date.now() - stepStartTimes[step]) / 1000;
            timerEl.textContent = formatTime(stepElapsedTimes[step]);
        }

        function updateStep(stepName, status) {
            steps.forEach((step, index) => {
                const el = document.getElementById(`step-${step}`);
                el.className = 'step';
                
                if (step === stepName) {
                    el.className = 'step active';
                    currentStep = index;
                    startTimer(step);
                } else if (index < currentStep) {
                    el.className = 'step completed';
                    if (timerIntervals[step]) {
                        stopTimer(step);
                    }
                }
            });
            
            const trace = document.getElementById('thinking-trace');
            trace.innerHTML += `<div>[${formatTime((Date.now() - stepStartTimes[stepName] || 0) / 1000)}] ${status}</div>`;
            trace.scrollTop = trace.scrollHeight;
        }

        function resetTimers() {
            steps.forEach(step => {
                if (timerIntervals[step]) {
                    clearInterval(timerIntervals[step]);
                    delete timerIntervals[step];
                }
                document.getElementById(`timer-${step}`).textContent = '0.0s';
                document.getElementById(`timer-${step}`).classList.remove('running');
            });
            stepStartTimes = {};
            stepElapsedTimes = {};
        }

        async function updateConfig() {
            const llm = document.getElementById('local-llm').value;
            const loops = parseInt(document.getElementById('max-loops').value);
            const button = document.querySelector('.config-section button');
            const originalText = button.textContent;
            
            button.textContent = 'Updating...';
            button.disabled = true;
            
            try {
                const response = await fetch('/config', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        local_llm: llm,
                        max_web_research_loops: loops
                    }),
                });
                
                const data = await response.json();
                button.textContent = '✓ Updated';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                }, 2000);
                
                const trace = document.getElementById('thinking-trace');
                trace.innerHTML += `<div>Configuration updated: ${data.message}</div>`;
                trace.scrollTop = trace.scrollHeight;
            } catch (error) {
                console.error('Failed to update config:', error);
                button.textContent = '✗ Error';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                }, 2000);
            }
        }

        function connectToStatusStream() {
            if (statusSource) {
                statusSource.close();
            }
            
            statusSource = new EventSource('/status');
            statusSource.onmessage = (event) => {
                const status = JSON.parse(event.data);
                updateStep(status.phase, status.message);
            };
        }

        async function submitResearch() {
            const topic = document.getElementById('topic').value;
            const result = document.getElementById('result');
            
            result.style.display = 'block';
            result.textContent = 'Starting research...';
            currentStep = 0;
            
            document.getElementById('thinking-trace').innerHTML = '';
            resetTimers();
            connectToStatusStream();
            
            try {
                const response = await fetch('/research', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ topic }),
                });
                
                const data = await response.json();
                result.textContent = data.summary;
                updateStep('final', data.status);
                
                // Stop all timers
                steps.forEach(step => {
                    if (timerIntervals[step]) {
                        stopTimer(step);
                    }
                });
                
                if (statusSource) {
                    statusSource.close();
                }
            } catch (error) {
                result.textContent = `Error: ${error.message}`;
                updateStep('final', 'Error occurred');
            }
        }

        // Initialize status stream
        connectToStatusStream();
        </script>
    </body>
    </html>
    "#)
}

async fn handle_research(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ResearchRequest>,
) -> Response {
    let input = SummaryStateInput {
        research_topic: request.topic,
    };

    let graph = state.graph.lock().await;
    match graph.run(input).await {
        Ok(output) => (
            StatusCode::OK,
            Json(ResearchResponse { 
                summary: output.running_summary,
                status: "Research completed".to_string(),
            })
        ).into_response(),
        Err(e) => {
            eprintln!("Research error: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ResearchResponse { 
                    summary: format!("Error: {}\nPlease check server logs for more details.", e),
                    status: "Error occurred".to_string(),
                })
            ).into_response()
        },
    }
}

async fn status_stream(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.status_tx.subscribe();
    
    let stream = async_stream::stream! {
        while let Ok(status) = rx.recv().await {
            yield Ok(Event::default().data(serde_json::to_string(&status).unwrap()));
        }
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(1))
            .text("keep-alive-text")
    )
}

async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(update): Json<ConfigUpdate>,
) -> impl IntoResponse {
    let mut graph = state.graph.lock().await;
    
    // Send status updates
    let _ = state.status_tx.send(StatusUpdate {
        phase: "config".to_string(),
        message: "Updating configuration...".to_string(),
        elapsed_time: 0.0,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    });

    if let Some(llm) = update.local_llm {
        println!("Updating LLM to: {}", llm);
        graph.update_llm(llm);
    }
    
    if let Some(loops) = update.max_web_research_loops {
        println!("Updating max loops to: {}", loops);
        graph.update_max_loops(loops);
    }
    
    (
        StatusCode::OK,
        Json(json!({
            "status": "Configuration updated",
            "message": "Changes will take effect on next research request"
        }))
    )
}

// Add this new handler function
async fn get_config(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let graph = state.graph.lock().await;
    
    (
        StatusCode::OK,
        Json(ConfigResponse {
            local_llm: graph.config.local_llm.clone(),
            max_web_research_loops: graph.config.max_web_research_loops,
        })
    )
} 