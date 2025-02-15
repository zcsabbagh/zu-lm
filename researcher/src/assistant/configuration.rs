use serde::{Deserialize, Serialize};
use std::env;
use serde_json::Value;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SearchAPI {
    #[serde(rename = "perplexity")]
    Perplexity,
    #[serde(rename = "tavily")]
    Tavily,
}

impl Default for SearchAPI {
    fn default() -> Self {
        SearchAPI::Tavily
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Configuration {
    #[serde(default = "default_max_web_research_loops")]
    pub max_web_research_loops: i32,
    #[serde(default = "default_local_llm")]
    pub local_llm: String,
    #[serde(default)]
    pub search_api: SearchAPI,
    pub perplexity_api_key: String,
}

fn default_max_web_research_loops() -> i32 {
    3
}

fn default_local_llm() -> String {
    "llama3.2".to_string()
}

impl Configuration {
    pub fn from_runnable_config(config: Option<&Value>) -> Result<Self> {
        println!("Loading configuration...");
        
        // Print current working directory and all environment variables for debugging
        println!("Current directory: {:?}", std::env::current_dir()?);
        println!("Checking environment variables...");
        
        for (key, value) in env::vars() {
            if key.starts_with("PERPLEXITY") || key.starts_with("LOCAL") || key.starts_with("MAX") || key.starts_with("SEARCH") {
                println!("Found env var {}: {}", key, if key.contains("KEY") { 
                    "***".to_string() 
                } else { 
                    value.clone() 
                });
            }
        }

        // Since we're not using the configurable map anymore, we can remove it
        let _unused = config;  // Explicitly mark config as unused

        // Check each required environment variable
        let perplexity_api_key = env::var("PERPLEXITY_API_KEY")
            .map_err(|_| anyhow::anyhow!("PERPLEXITY_API_KEY environment variable not found"))?;

        let local_llm = env::var("LOCAL_LLM")
            .map_err(|_| anyhow::anyhow!("LOCAL_LLM environment variable not found"))?;

        let max_web_research_loops = env::var("MAX_WEB_RESEARCH_LOOPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or_else(default_max_web_research_loops);

        let search_api = env::var("SEARCH_API")
            .ok()
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default();

        Ok(Configuration {
            max_web_research_loops,
            local_llm,
            search_api,
            perplexity_api_key,
        })
    }
} 