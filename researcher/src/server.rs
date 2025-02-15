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
    sync::OnceLock,
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
use http::{Method, header};
use http::header::HeaderValue;

// Increase channel capacity
const CHANNEL_CAPACITY: usize = 100;

static STATUS_CHANNEL: OnceLock<broadcast::Sender<StatusUpdate>> = OnceLock::new();

fn get_status_channel() -> broadcast::Sender<StatusUpdate> {
    STATUS_CHANNEL.get_or_init(|| {
        let (tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        tx
    }).clone()
}

#[derive(Clone)]
pub struct AppState {
    graph: Arc<Mutex<ResearchGraph>>,
    status_tx: broadcast::Sender<StatusUpdate>,
}

#[derive(Deserialize)]
struct ConfigUpdate {
    local_llm: Option<String>,
    max_web_research_loops: Option<i32>,
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
    let status_tx = get_status_channel();
    
    let mut graph = ResearchGraph::new(config);
    graph.set_status_sender(status_tx.clone());

    let state = Arc::new(AppState {
        graph: Arc::new(Mutex::new(graph)),
        status_tx,
    });

    let frontend_origin = env::var("FRONTEND_URL")
        .unwrap_or_else(|_| "http://localhost:3000".to_string());
    
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PUT])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::CACHE_CONTROL,
            header::CONNECTION,
        ])
        .allow_credentials(true)
        .allow_origin(frontend_origin.parse::<HeaderValue>().unwrap());

    let app = Router::new()
        .route("/research", post(handle_research))
        .route("/config", put(update_config))
        .route("/config", get(get_config))
        .route("/status", get(status_stream))
        .layer(cors)
        .with_state(state);

    let port = env::var("PORT").unwrap_or_else(|_| "4000".to_string()).parse::<u16>().unwrap_or(4000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Starting server on http://localhost:{}", port);
    println!("Allowing CORS for origin: {}", frontend_origin);
    
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
                <form onsubmit="submitResearch(event)">
                    <textarea id="topic" placeholder="Enter your research topic..." required></textarea>
                    <button type="submit">Start Research</button>
                </form>
                <div id="result" style="display: none;"></div>
            </div>
            <div class="sidebar">
                <h2>Research Progress</h2>
                <div id="thinking-trace"></div>
            </div>
        </div>

        <script>
            const steps = ['query', 'research', 'summary', 'reflection', 'final'];
            let currentStep = 0;
            let timerIntervals = {};
            let statusSource = null;

            function resetTimers() {
                steps.forEach(step => {
                    if (timerIntervals[step]) {
                        clearInterval(timerIntervals[step]);
                        delete timerIntervals[step];
                    }
                });
            }

            function startTimer(step) {
                if (timerIntervals[step]) return;
                
                const stepElement = document.querySelector(`.step[data-step="${step}"]`);
                if (!stepElement) return;
                
                const timerElement = stepElement.querySelector('.timer');
                if (!timerElement) return;
                
                let seconds = 0;
                timerIntervals[step] = setInterval(() => {
                    seconds++;
                    timerElement.textContent = `${seconds}s`;
                }, 1000);
            }

            function stopTimer(step) {
                if (timerIntervals[step]) {
                    clearInterval(timerIntervals[step]);
                    delete timerIntervals[step];
                }
            }

            function updateStep(phase, message) {
                const trace = document.getElementById('thinking-trace');
                
                // Create or update step element
                let stepElement = document.querySelector(`.step[data-step="${phase}"]`);
                if (!stepElement) {
                    stepElement = document.createElement('div');
                    stepElement.className = 'step';
                    stepElement.setAttribute('data-step', phase);
                    
                    const messageElement = document.createElement('span');
                    messageElement.className = 'message';
                    
                    const timerElement = document.createElement('span');
                    timerElement.className = 'timer';
                    
                    stepElement.appendChild(messageElement);
                    stepElement.appendChild(timerElement);
                    trace.appendChild(stepElement);
                }
                
                // Update message
                const messageElement = stepElement.querySelector('.message');
                if (messageElement) {
                    messageElement.textContent = message;
                }
                
                // Start timer for current phase
                startTimer(phase);
                
                // Mark step as active
                stepElement.classList.add('active');
                
                // Stop timer for previous phase if exists
                if (currentStep > 0) {
                    const prevPhase = steps[currentStep - 1];
                    stopTimer(prevPhase);
                }
                
                // Update current step
                currentStep = steps.indexOf(phase) + 1;
            }

            async function submitResearch(event) {
                event.preventDefault();
                const topic = document.getElementById('topic').value;
                const result = document.getElementById('result');
                
                result.style.display = 'block';
                result.textContent = 'Starting research...';
                currentStep = 0;
                
                document.getElementById('thinking-trace').innerHTML = '';
                resetTimers();
                
                try {
                    // Start the research process
                    const response = await fetch('/research', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ topic }),
                    });
                    
                    if (!response.ok) {
                        throw new Error('Research request failed');
                    }

                    // Set up SSE connection with retry logic
                    let retryCount = 0;
                    const maxRetries = 3;
                    
                    function connectToStatusStream() {
                        console.log('Connecting to SSE...');
                        if (statusSource) {
                            statusSource.close();
                        }
                        
                        statusSource = new EventSource('/status');
                        
                        statusSource.onmessage = (event) => {
                            try {
                                const status = JSON.parse(event.data);
                                console.log('Received status:', status);
                                
                                updateStep(status.phase, status.message);
                                if (status.phase === 'complete') {
                                    result.textContent = status.message;
                                    statusSource.close();
                                    
                                    // Stop all timers
                                    steps.forEach(step => {
                                        if (timerIntervals[step]) {
                                            stopTimer(step);
                                        }
                                    });
                                }
                                // Reset retry count on successful message
                                retryCount = 0;
                            } catch (error) {
                                console.error('Failed to parse status:', error);
                            }
                        };
                        
                        statusSource.onerror = (error) => {
                            console.error('SSE error:', error);
                            statusSource.close();
                            
                            if (retryCount < maxRetries) {
                                console.log(`Retrying SSE connection (${retryCount + 1}/${maxRetries})...`);
                                retryCount++;
                                setTimeout(connectToStatusStream, 1000 * retryCount); // Exponential backoff
                            } else {
                                result.textContent = 'Error: Lost connection to research service';
                                updateStep('error', 'Lost connection to research service');
                            }
                        };
                        
                        statusSource.onopen = () => {
                            console.log('SSE connection opened');
                            retryCount = 0; // Reset retry count on successful connection
                        };
                    }
                    
                    connectToStatusStream();
                    
                } catch (error) {
                    result.textContent = `Error: ${error.message}`;
                    updateStep('error', error.message);
                    
                    // Stop all timers
                    steps.forEach(step => {
                        if (timerIntervals[step]) {
                            stopTimer(step);
                        }
                    });
                    
                    if (statusSource) {
                        statusSource.close();
                    }
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

    // Send initial status update
    if let Err(e) = state.status_tx.send(StatusUpdate {
        phase: "init".to_string(),
        message: format!("Starting research on topic: {}", input.research_topic),
        elapsed_time: 0.0,
        timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
    }) {
        eprintln!("Failed to send initial status update: {}", e);
    }

    let mut graph = state.graph.lock().await;
    // Update the graph's status sender
    graph.set_status_sender(state.status_tx.clone());

    match graph.process_research(input).await {
        Ok(output) => {
            // Send final status update
            let _ = state.status_tx.send(StatusUpdate {
                phase: "complete".to_string(),
                message: output.running_summary.clone(),
                elapsed_time: 0.0,
                timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            });
            
            (
                StatusCode::OK,
                Json(ResearchResponse { 
                    summary: output.running_summary,
                    status: "Research completed".to_string(),
                })
            ).into_response()
        },
        Err(e) => {
            eprintln!("Research error: {:?}", e);
            let _ = state.status_tx.send(StatusUpdate {
                phase: "error".to_string(),
                message: format!("Error: {}", e),
                elapsed_time: 0.0,
                timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            });
            
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ResearchResponse { 
                    summary: format!("Error: {}", e),
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
    println!("New SSE connection established");
    
    let stream = async_stream::stream! {
        let mut retry_count = 0;
        const MAX_RETRIES: u32 = 3;
        const RETRY_DELAY: Duration = Duration::from_secs(1);

        loop {
            match rx.recv().await {
                Ok(status) => {
                    let json = serde_json::to_string(&status).unwrap();
                    println!("Sending status update: {}", json);
                    retry_count = 0; // Reset retry count on successful message
                    yield Ok(Event::default()
                        .data(json)
                        .id(status.timestamp.to_string()) // Add message ID for retry
                        .retry(Duration::from_millis(RETRY_DELAY.as_millis() as u64))); // Convert to Duration
                }
                Err(e) => {
                    eprintln!("Error receiving status update: {}", e);
                    if retry_count < MAX_RETRIES {
                        retry_count += 1;
                        eprintln!("Retrying connection ({}/{})", retry_count, MAX_RETRIES);
                        // Get a fresh receiver and continue
                        rx = state.status_tx.subscribe();
                        tokio::time::sleep(RETRY_DELAY * retry_count).await;
                        continue;
                    } else {
                        eprintln!("Max retries reached, closing connection");
                        break;
                    }
                }
            }
        }
    };

    Sse::new(stream)
        .keep_alive(
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
            local_llm: graph.get_llm_model().to_string(),
            max_web_research_loops: graph.get_max_loops(),
        })
    )
} 