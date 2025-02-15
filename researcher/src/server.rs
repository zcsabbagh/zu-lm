use axum::{
    routing::post,
    Router,
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::sync::Arc;
use std::net::SocketAddr;
use crate::assistant::{
    configuration::Configuration,
    state::SummaryStateInput,
    graph::ResearchGraph,
};

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
}

// Custom error type for our API
struct ApiError(anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ResearchResponse {
                summary: format!("Error: {}", self.0)
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
        .route("/research", post(handle_research))
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
                summary: output.running_summary 
            })
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ResearchResponse { 
                summary: format!("Error: {}", e) 
            })
        ).into_response(),
    }
} 