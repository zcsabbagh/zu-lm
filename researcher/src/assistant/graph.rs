use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;
use ollama_rs::Ollama;
use ollama_rs::generation::completion::request::GenerationRequest;

use super::configuration::Configuration;
use super::prompts::{
    format_query_writer_instructions,
    format_reflection_instructions,
    SUMMARIZER_INSTRUCTIONS,
};
use super::state::{SummaryState, SummaryStateInput, SummaryStateOutput};
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
    state: Arc<Mutex<SummaryState>>,
    pub(crate) config: Configuration,
}

impl ResearchGraph {
    pub fn new(config: Configuration) -> Self {
        Self {
            state: Arc::new(Mutex::new(SummaryState::new())),
            config,
        }
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
    
    pub async fn run(&self, input: SummaryStateInput) -> Result<SummaryStateOutput> {
        {
            let mut state = self.state.lock().await;
            state.research_topic = input.research_topic;
        }
        
        println!("Starting initial research loop...");
        let nodes = vec![
            Box::new(QueryGeneratorNode) as Box<dyn Node>,
            Box::new(WebResearchNode) as Box<dyn Node>,
            Box::new(SummarizerNode) as Box<dyn Node>,
        ];
        
        // Initial research loop
        for node in &nodes {
            node.process(self.state.clone(), &self.config).await?;
        }
        
        // Additional research loops
        while {
            let state = self.state.lock().await;
            state.research_loop_count <= self.config.max_web_research_loops
        } {
            println!("Starting reflection phase...");
            let reflection_node = Box::new(ReflectionNode) as Box<dyn Node>;
            reflection_node.process(self.state.clone(), &self.config).await?;
            
            println!("Starting follow-up research...");
            for node in &nodes {
                node.process(self.state.clone(), &self.config).await?;
            }
        }
        
        println!("Finalizing research...");
        let finalizer = Box::new(FinalizerNode) as Box<dyn Node>;
        finalizer.process(self.state.clone(), &self.config).await?;
        
        let state = self.state.lock().await;
        Ok(SummaryStateOutput {
            running_summary: state.running_summary.clone().unwrap_or_default(),
        })
    }
} 