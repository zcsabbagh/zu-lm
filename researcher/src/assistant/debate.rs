use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fmt;
use crate::assistant::groq::GroqClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebatePerspectives {
    pub perspective_one: String,
    pub perspective_two: String,
    pub topic: String,
}

impl fmt::Display for DebatePerspectives {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Topic: {}\nPerspective One: {}\nPerspective Two: {}", 
            self.topic, self.perspective_one, self.perspective_two)
    }
}

const DEBATE_PROMPT: &str = r#"Given a research topic, identify two contrasting but valid perspectives for a balanced debate.
Each perspective should be well-reasoned and supported by potential evidence.
Format your response as JSON with the following structure:
{
    "perspective_one": "description of first perspective",
    "perspective_two": "description of second perspective"
}
Research Topic: {}"#;

pub async fn generate_debate_perspectives(topic: &str, groq_client: &GroqClient, model: &str) -> Result<DebatePerspectives> {
    let prompt = DEBATE_PROMPT.replace("{}", topic);
    let response = groq_client.generate(&prompt, model).await?;
    
    let perspectives: serde_json::Value = serde_json::from_str(&response)
        .map_err(|e| anyhow::anyhow!("Failed to parse debate perspectives: {}", e))?;
    
    Ok(DebatePerspectives {
        perspective_one: perspectives["perspective_one"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing perspective_one"))?
            .to_string(),
        perspective_two: perspectives["perspective_two"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing perspective_two"))?
            .to_string(),
        topic: topic.to_string(),
    })
} 