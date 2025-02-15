use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

fn default_max_web_research_loops() -> i32 {
    3
}

fn default_local_llm() -> String {
    "llama3.2".to_string()
}

impl Default for Configuration {
    fn default() -> Self {
        Self {
            max_web_research_loops: default_max_web_research_loops(),
            local_llm: default_local_llm(),
            search_api: SearchAPI::default(),
        }
    }
}

impl Configuration {
    pub fn from_env() -> Self {
        let mut config = Configuration::default();
        
        if let Ok(loops) = env::var("MAX_WEB_RESEARCH_LOOPS") {
            if let Ok(loops) = loops.parse() {
                config.max_web_research_loops = loops;
            }
        }
        
        if let Ok(llm) = env::var("LOCAL_LLM") {
            config.local_llm = llm;
        }
        
        if let Ok(api) = env::var("SEARCH_API") {
            config.search_api = match api.to_lowercase().as_str() {
                "perplexity" => SearchAPI::Perplexity,
                "tavily" => SearchAPI::Tavily,
                _ => SearchAPI::default(),
            };
        }
        
        config
    }

    pub fn from_runnable_config(config: Option<&serde_json::Value>) -> Self {
        let mut configuration = Configuration::default();
        
        if let Some(config) = config {
            if let Some(configurable) = config.get("configurable") {
                if let Some(loops) = configurable.get("max_web_research_loops") {
                    if let Some(loops) = loops.as_i64() {
                        configuration.max_web_research_loops = loops as i32;
                    }
                }
                
                if let Some(llm) = configurable.get("local_llm") {
                    if let Some(llm) = llm.as_str() {
                        configuration.local_llm = llm.to_string();
                    }
                }
                
                if let Some(api) = configurable.get("search_api") {
                    if let Some(api) = api.as_str() {
                        configuration.search_api = match api {
                            "perplexity" => SearchAPI::Perplexity,
                            "tavily" => SearchAPI::Tavily,
                            _ => SearchAPI::default(),
                        };
                    }
                }
            }
        }
        
        configuration
    }
} 