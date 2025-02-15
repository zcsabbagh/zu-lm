use crate::configuration::{Configuration, SearchAPI};
use anyhow::Result;
use async_trait::async_trait;
use langchain_rust::{
    chains::Chain,
    llms::ollama::ChatOllama,
    messages::{HumanMessage, SystemMessage},
    runnables::RunnableConfig,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryState {
    pub research_topic: String,
    pub search_query: Option<String>,
    pub sources_gathered: Vec<String>,
    pub research_loop_count: i32,
    pub web_research_results: Vec<String>,
    pub running_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryStateInput {
    pub research_topic: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryStateOutput {
    pub running_summary: String,
}

const QUERY_WRITER_INSTRUCTIONS: &str = r#"You are a research assistant tasked with generating effective search queries.
Your goal is to create a search query that will help gather relevant information about the research topic.
Format your response as JSON with a single key 'query' containing the search query."#;

const SUMMARIZER_INSTRUCTIONS: &str = r#"You are a research assistant tasked with summarizing information.
Analyze the search results and create a comprehensive summary that addresses the research topic.
If there's an existing summary, integrate the new information with it."#;

const REFLECTION_INSTRUCTIONS: &str = r#"You are a research assistant tasked with identifying knowledge gaps.
Analyze the current summary and identify what important aspects of {research_topic} still need to be explored.
Generate a follow-up search query to fill these gaps.
Format your response as JSON with a single key 'follow_up_query' containing the search query."#;

#[async_trait]
pub trait ResearchNode {
    async fn process(&self, state: &mut SummaryState, config: &RunnableConfig) -> Result<()>;
}

pub struct QueryGenerator {
    llm: ChatOllama,
}

impl QueryGenerator {
    pub fn new(model: &str) -> Self {
        Self {
            llm: ChatOllama::new(model),
        }
    }
}

#[async_trait]
impl ResearchNode for QueryGenerator {
    async fn process(&self, state: &mut SummaryState, _config: &RunnableConfig) -> Result<()> {
        let instructions = QUERY_WRITER_INSTRUCTIONS.replace("{research_topic}", &state.research_topic);
        
        let messages = vec![
            SystemMessage::new(instructions),
            HumanMessage::new("Generate a query for web search:"),
        ];

        let result = self.llm.chat(messages).await?;
        let query: Value = serde_json::from_str(&result.content)?;
        
        state.search_query = Some(query["query"].as_str().unwrap_or_default().to_string());
        Ok(())
    }
}

pub struct WebResearcher {
    config: Configuration,
}

impl WebResearcher {
    pub fn new(config: Configuration) -> Self {
        Self { config }
    }

    async fn search(&self, query: &str, include_raw_content: bool) -> Result<String> {
        match self.config.search_api {
            SearchAPI::Tavily => self.tavily_search(query, include_raw_content).await,
            SearchAPI::Perplexity => self.perplexity_search(query).await,
        }
    }

    async fn tavily_search(&self, query: &str, include_raw_content: bool) -> Result<String> {
        // Implement Tavily search here
        todo!()
    }

    async fn perplexity_search(&self, query: &str) -> Result<String> {
        // Implement Perplexity search here
        todo!()
    }
}

#[async_trait]
impl ResearchNode for WebResearcher {
    async fn process(&self, state: &mut SummaryState, _config: &RunnableConfig) -> Result<()> {
        if let Some(query) = &state.search_query {
            let search_results = self.search(query, true).await?;
            state.web_research_results.push(search_results);
            state.research_loop_count += 1;
        }
        Ok(())
    }
}

// Additional implementations for Summarizer, Reflector, and Finalizer would follow similar patterns

pub struct ResearchGraph {
    nodes: Vec<Box<dyn ResearchNode>>,
    config: Configuration,
}

impl ResearchGraph {
    pub fn new(config: Configuration) -> Self {
        let mut nodes: Vec<Box<dyn ResearchNode>> = Vec::new();
        nodes.push(Box::new(QueryGenerator::new(&config.local_llm)));
        nodes.push(Box::new(WebResearcher::new(config.clone())));
        // Add other nodes...

        Self { nodes, config }
    }

    pub async fn run(&self, input: SummaryStateInput) -> Result<SummaryStateOutput> {
        let mut state = SummaryState {
            research_topic: input.research_topic,
            search_query: None,
            sources_gathered: Vec::new(),
            research_loop_count: 0,
            web_research_results: Vec::new(),
            running_summary: None,
        };

        let runnable_config = RunnableConfig::default();

        for node in &self.nodes {
            node.process(&mut state, &runnable_config).await?;
            
            if state.research_loop_count >= self.config.max_web_research_loops {
                break;
            }
        }

        Ok(SummaryStateOutput {
            running_summary: state.running_summary.unwrap_or_default(),
        })
    }
}
