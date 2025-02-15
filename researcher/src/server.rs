use axum::{
    routing::{post, get},
    Router,
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response, Html},
};
use std::sync::Arc;
use std::net::SocketAddr;
use crate::assistant::{
    configuration::Configuration,
    state::SummaryStateInput,
    graph::ResearchGraph,
};
use tower_http::cors::CorsLayer;

pub struct AppState {
    graph: ResearchGraph,
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

pub async fn run_server(config: Configuration) {
    let state = Arc::new(AppState {
        graph: ResearchGraph::new(config),
    });

    let app = Router::new()
        .route("/", get(serve_index))
        .route("/research", post(handle_research))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Starting server on http://localhost:3000");
    
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
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            .container {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            textarea {
                width: 100%;
                height: 100px;
                padding: 10px;
            }
            button {
                padding: 10px 20px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            #status {
                padding: 10px;
                margin-top: 10px;
                background-color: #f8f9fa;
                border-radius: 4px;
            }
            #result {
                white-space: pre-wrap;
                padding: 20px;
                border: 1px solid #ddd;
                border-radius: 4px;
                display: none;
                margin-top: 20px;
            }
            .step {
                padding: 8px;
                margin: 4px 0;
                background-color: #e9ecef;
                border-radius: 4px;
            }
            .step.active {
                background-color: #cce5ff;
            }
            .step.completed {
                background-color: #d4edda;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Research Assistant</h1>
            <div>
                <label for="topic">Research Topic:</label>
                <textarea id="topic" placeholder="Enter your research topic..."></textarea>
            </div>
            <button onclick="submitResearch()">Start Research</button>
            <div id="steps">
                <div class="step" id="step-query">1. Generating Search Query</div>
                <div class="step" id="step-research">2. Web Research</div>
                <div class="step" id="step-summary">3. Summarizing Results</div>
                <div class="step" id="step-reflection">4. Reflection & Follow-up</div>
                <div class="step" id="step-final">5. Finalizing Results</div>
            </div>
            <div id="status"></div>
            <div id="result"></div>
        </div>

        <script>
        let currentStep = 0;
        const steps = ['query', 'research', 'summary', 'reflection', 'final'];

        function updateStep(stepName, status) {
            steps.forEach((step, index) => {
                const el = document.getElementById(`step-${step}`);
                el.className = 'step';
                if (step === stepName) {
                    el.className = 'step active';
                    currentStep = index;
                } else if (index < currentStep) {
                    el.className = 'step completed';
                }
            });
            
            const statusEl = document.getElementById('status');
            statusEl.textContent = status;
        }

        async function submitResearch() {
            const topic = document.getElementById('topic').value;
            const result = document.getElementById('result');
            const status = document.getElementById('status');
            
            result.style.display = 'block';
            result.textContent = 'Starting research...';
            currentStep = 0;
            
            try {
                updateStep('query', 'Generating search query...');
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
            } catch (error) {
                result.textContent = `Error: ${error.message}`;
                updateStep('final', 'Error occurred');
            }
        }
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

    match state.graph.run(input).await {
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