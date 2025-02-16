use browserbase_stagehand::{Stagehand, StagehandConfig};
use browserbase_stagehand_toolkit::{StagehandActTool, StagehandNavigateTool};
use browserbase_langgraph::prebuilt::create_react_agent;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast::Sender;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;

use super::state::StatusUpdate;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentAction {
    pub action_type: String,
    pub description: String,
    pub details: serde_json::Value,
}

pub struct StagehandStream {
    stagehand: Stagehand,
    status_tx: Sender<StatusUpdate>,
}

impl StagehandStream {
    pub fn new(status_tx: Sender<StatusUpdate>) -> Self {
        let config = StagehandConfig {
            env: "LOCAL".to_string(),
            enable_caching: true,
        };
        
        let stagehand = Stagehand::new(config);
        
        Self {
            stagehand,
            status_tx,
        }
    }
    
    fn send_action(&self, action: AgentAction) {
        let _ = self.status_tx.send(StatusUpdate {
            phase: "agent_action".to_string(),
            message: action.description.clone(),
            elapsed_time: 0.0,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            chain_of_thought: Some(serde_json::to_string_pretty(&action.details).unwrap()),
        });
    }
    
    pub async fn start_stream(&self, url: &str) -> anyhow::Result<()> {
        let act_tool = StagehandActTool::new(self.stagehand.clone());
        let navigate_tool = StagehandNavigateTool::new(self.stagehand.clone());
        
        let agent = create_react_agent(vec![act_tool, navigate_tool]);
        
        // First navigate to the URL
        let navigate_action = AgentAction {
            action_type: "navigate".to_string(),
            description: format!("Navigating to {}", url),
            details: serde_json::json!({
                "url": url,
            }),
        };
        self.send_action(navigate_action);
        
        // Start streaming agent actions
        let stream = agent.stream(serde_json::json!({
            "messages": [{
                "role": "user",
                "content": format!("Navigate to {}", url),
            }]
        }));
        
        while let Some(value) = stream.next().await {
            if let Ok(action) = serde_json::from_value::<AgentAction>(value) {
                self.send_action(action);
            }
        }
        
        Ok(())
    }
} 