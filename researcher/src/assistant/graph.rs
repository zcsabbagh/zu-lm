use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;
use ollama_rs::Ollama;
use ollama_rs::generation::completion::request::GenerationRequest;
use tokio::sync::broadcast::Sender;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;
use std::time::Duration;

use super::configuration::Configuration;
use super::prompts::{
    format_query_writer_instructions,
    format_reflection_instructions,
    SUMMARIZER_INSTRUCTIONS,
};
use super::state::{SummaryState, SummaryStateInput, SummaryStateOutput, StatusUpdate};
use super::utils::{perplexity_search, format_sources};

#[async_trait]
pub trait Node: Send + Sync {
    async fn process(&self, state: Arc<Mutex<SummaryState>>, config: &Configuration) -> Result<()>;
}

pub struct QueryGeneratorNode;
pub struct WebResearchNode;
pub struct SummarizerNode;
pub struct ReflectionNode;
pub struct FinalizerNode;

#[async_trait]
impl Node for QueryGeneratorNode {
    async fn process(&self, state: Arc<Mutex<SummaryState>>, config: &Configuration) -> Result<()> {
        let research_topic = {
            let state = state.lock().await;
            state.research_topic.clone()
        };
        
        println!("Initializing Ollama with model: {}", config.local_llm);
        let ollama = Ollama::default();
        
        let instructions = format_query_writer_instructions(&research_topic);
        let request = GenerationRequest::new(
            config.local_llm.clone(),
            format!("{}\n\nGenerate a query for web search:", instructions),
        );
        
        println!("Sending request to Ollama...");
        let response = ollama.generate(request).await
            .map_err(|e| anyhow::anyhow!("Ollama request failed: {}", e))?;
        
        // Try to parse as JSON, if fails, use the entire response as the query
        let search_query = match serde_json::from_str::<Value>(&response.response) {
            Ok(json) => json["query"]
                .as_str()
                .unwrap_or(&response.response)
                .to_string(),
            Err(_) => response.response.trim().to_string(),
        };
        
        let mut state = state.lock().await;
        state.set_search_query(search_query);
        
        Ok(())
    }
}

#[async_trait]
impl Node for WebResearchNode {
    async fn process(&self, state: Arc<Mutex<SummaryState>>, _config: &Configuration) -> Result<()> {
        let (query, loop_count) = {
            let state = state.lock().await;
            (
                state.search_query.clone().unwrap_or_default(),
                state.research_loop_count,
            )
        };
        
        let search_results = perplexity_search(&query, loop_count).await?;
        
        let search_str = format_sources(&search_results);
        let mut state = state.lock().await;
        state.add_source(search_str);
        state.increment_loop_count();
        state.add_web_research_result(serde_json::to_string(&search_results)?);
        
        Ok(())
    }
}

#[async_trait]
impl Node for SummarizerNode {
    async fn process(&self, state: Arc<Mutex<SummaryState>>, config: &Configuration) -> Result<()> {
        let (research_topic, existing_summary, latest_research) = {
            let state = state.lock().await;
            (
                state.research_topic.clone(),
                state.running_summary.clone(),
                state.web_research_results.last().cloned(),
            )
        };
        
        let human_message = if let Some(summary) = existing_summary {
            format!(
                "<User Input> \n {} \n </User Input>\n\n\
                <Existing Summary> \n {} \n </Existing Summary>\n\n\
                <New Search Results> \n {} \n </New Search Results>",
                research_topic,
                summary,
                latest_research.unwrap_or_default()
            )
        } else {
            format!(
                "<User Input> \n {} \n </User Input>\n\n\
                <Search Results> \n {} \n </Search Results>",
                research_topic,
                latest_research.unwrap_or_default()
            )
        };
        
        let ollama = Ollama::default();
        let request = GenerationRequest::new(
            config.local_llm.clone(),
            format!("{}\n\n{}", SUMMARIZER_INSTRUCTIONS, human_message),
        );
        
        let response = ollama.generate(request).await?;
        let mut summary = response.response;
        
        // Remove <think> tags if present
        while let (Some(start), Some(end)) = (summary.find("<think>"), summary.find("</think>")) {
            summary = format!("{}{}", &summary[..start], &summary[end + 8..]);
        }
        
        let mut state = state.lock().await;
        state.set_running_summary(summary);
        
        Ok(())
    }
}

#[async_trait]
impl Node for ReflectionNode {
    async fn process(&self, state: Arc<Mutex<SummaryState>>, config: &Configuration) -> Result<()> {
        let (research_topic, running_summary) = {
            let state = state.lock().await;
            (
                state.research_topic.clone(),
                state.running_summary.clone().unwrap_or_default(),
            )
        };
        
        let instructions = format_reflection_instructions(&research_topic);
        let human_message = format!(
            "Identify a knowledge gap and generate a follow-up web search query based on our existing knowledge: {}",
            running_summary
        );
        
        let ollama = Ollama::default();
        let request = GenerationRequest::new(
            config.local_llm.clone(),
            format!("{}\n\n{}", instructions, human_message),
        );
        
        let response = ollama.generate(request).await?;
        
        // Try to parse as JSON, if fails, use a fallback query
        let query = match serde_json::from_str::<Value>(&response.response) {
            Ok(json) => json["follow_up_query"]
                .as_str()
                .unwrap_or(&format!("Tell me more about {}", research_topic))
                .to_string(),
            Err(_) => format!("Tell me more about {}", research_topic),
        };
        
        let mut state = state.lock().await;
        state.set_search_query(query);
        
        Ok(())
    }
}

#[async_trait]
impl Node for FinalizerNode {
    async fn process(&self, state: Arc<Mutex<SummaryState>>, _config: &Configuration) -> Result<()> {
        let mut state = state.lock().await;
        let sources = state.sources_gathered.join("\n");
        let summary = state.running_summary.clone().unwrap_or_default();
        
        state.set_running_summary(format!(
            "## Summary\n\n{}\n\n### Sources:\n{}",
            summary,
            sources
        ));
        
        Ok(())
    }
}

pub struct ResearchGraph {
    config: Configuration,
    status_tx: Option<Sender<StatusUpdate>>,
    nodes: Vec<Box<dyn Node>>,
}

impl ResearchGraph {
    pub fn new(config: Configuration) -> Self {
        Self {
            config,
            status_tx: None,
            nodes: vec![
                Box::new(QueryGeneratorNode),
                Box::new(WebResearchNode),
                Box::new(SummarizerNode),
                Box::new(ReflectionNode),
                Box::new(FinalizerNode),
            ],
        }
    }
    
    pub fn get_llm_model(&self) -> &str {
        &self.config.local_llm
    }

    pub fn get_max_loops(&self) -> i32 {
        self.config.max_web_research_loops
    }
    
    pub fn update_llm(&mut self, new_llm: String) {
        self.config = Configuration {
            local_llm: new_llm,
            ..self.config.clone()
        };
    }

    pub fn update_max_loops(&mut self, new_max: i32) {
        self.config = Configuration {
            max_web_research_loops: new_max,
            ..self.config.clone()
        };
    }
    
    pub fn set_status_sender(&mut self, tx: Sender<StatusUpdate>) {
        self.status_tx = Some(tx);
    }

    fn send_status(&self, phase: &str, message: &str) {
        if let Some(tx) = &self.status_tx {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let status = StatusUpdate {
                phase: phase.to_string(),
                message: message.to_string(),
                elapsed_time: 0.0,
                timestamp: now,
            };

            match tx.send(status) {
                Ok(_) => println!("Sent status update: phase={}, message={}", phase, message),
                Err(e) => {
                    eprintln!("Failed to send status update: {} (phase={}, message={})", e, phase, message);
                    // Don't fail the research process if status updates fail
                }
            }
        } else {
            eprintln!("No status sender available for update: phase={}, message={}", phase, message);
        }
    }
    
    pub async fn process_research(&mut self, input: SummaryStateInput) -> Result<SummaryStateOutput> {
        let state = Arc::new(Mutex::new(SummaryState::with_research_topic(
            input.research_topic.clone(),
        )));

        // Initial query generation
        let query_node = &self.nodes[0];
        self.send_status("query", "Starting initial query generation...");
        query_node.process(state.clone(), &self.config).await?;
        self.send_status("query", "Completed initial query generation");

        // Main research loop
        for loop_count in 0..self.config.max_web_research_loops {
            self.send_status("loop", &format!("Starting research loop {} of {}", loop_count + 1, self.config.max_web_research_loops));

            // Web research
            let research_node = &self.nodes[1];
            self.send_status("research", &format!("Starting web research for loop {}...", loop_count + 1));
            research_node.process(state.clone(), &self.config).await?;
            self.send_status("research", &format!("Completed web research for loop {}", loop_count + 1));

            // Summarization
            let summary_node = &self.nodes[2];
            self.send_status("summary", &format!("Starting summary for loop {}...", loop_count + 1));
            summary_node.process(state.clone(), &self.config).await?;
            self.send_status("summary", &format!("Completed summary for loop {}", loop_count + 1));

            // Skip reflection and query generation on the last loop
            if loop_count < self.config.max_web_research_loops - 1 {
                // Reflection and next query generation
                let reflection_node = &self.nodes[3];
                self.send_status("reflection", &format!("Starting reflection for loop {}...", loop_count + 1));
                reflection_node.process(state.clone(), &self.config).await?;
                self.send_status("reflection", &format!("Completed reflection for loop {}", loop_count + 1));
            }

            // Small delay between loops to ensure status updates are received in order
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        // Final summary compilation
        let finalizer_node = &self.nodes[4];
        self.send_status("final", "Starting final summary compilation...");
        finalizer_node.process(state.clone(), &self.config).await?;
        self.send_status("final", "Completed final summary compilation");

        let final_state = state.lock().await;
        let summary = final_state.running_summary.clone().unwrap_or_default();
        
        // Send final status update with summary
        self.send_status("complete", &format!("Research completed after {} loops. Summary length: {} chars", 
            self.config.max_web_research_loops, summary.len()));
        
        Ok(SummaryStateOutput {
            running_summary: summary,
        })
    }
} 