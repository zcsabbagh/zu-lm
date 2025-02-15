use serde::{Deserialize, Serialize};
use std::env;
use langchain_rust::runnables::RunnableConfig;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SearchAPI {
    #[serde(rename = "perplexity")]
    Perplexity,
    #[serde(rename = "tavily")]
    Tavily,
}

impl Default for SearchAPI {
    fn default() -> Self {
        SearchAPI::Tavily // Default to TAVILY as in Python version
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

impl Configuration {
    pub fn from_runnable_config(config: Option<&RunnableConfig>) -> Self {
        let configurable = config
            .and_then(|c| c.get("configurable"))
            .and_then(|c| c.as_object())
            .unwrap_or_default();

        let max_web_research_loops = env::var("MAX_WEB_RESEARCH_LOOPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .or_else(|| {
                configurable.get("max_web_research_loops")
                    .and_then(|v| v.as_i64())
                    .map(|v| v as i32)
            })
            .unwrap_or_else(default_max_web_research_loops);

        let local_llm = env::var("LOCAL_LLM")
            .ok()
            .or_else(|| {
                configurable.get("local_llm")
                    .and_then(|v| v.as_str())
                    .map(String::from)
            })
            .unwrap_or_else(default_local_llm);

        let search_api = env::var("SEARCH_API")
            .ok()
            .and_then(|v| serde_json::from_str(&v).ok())
            .or_else(|| {
                configurable.get("search_api")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
            })
            .unwrap_or_default();

        Configuration {
            max_web_research_loops,
            local_llm,
            search_api,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_default_configuration() {
        let config = Configuration::from_runnable_config(None);
        assert_eq!(config.max_web_research_loops, 3);
        assert_eq!(config.local_llm, "llama3.2");
        assert_eq!(config.search_api, SearchAPI::Tavily);
    }

    #[test]
    fn test_configuration_from_runnable_config() {
        let runnable_config = RunnableConfig::new()
            .with_configurable(json!({
                "max_web_research_loops": 5,
                "local_llm": "gpt4",
                "search_api": "perplexity"
            }));

        let config = Configuration::from_runnable_config(Some(&runnable_config));
        assert_eq!(config.max_web_research_loops, 5);
        assert_eq!(config.local_llm, "gpt4");
        assert_eq!(config.search_api, SearchAPI::Perplexity);
    }
}
