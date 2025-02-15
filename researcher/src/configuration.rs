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

impl Configuration {
    pub fn from_runnable_config(config: Option<&RunnableConfig>) -> anyhow::Result<Self> {
        let configurable = config
            .and_then(|c| c.get("configurable"))
            .and_then(|c| c.as_object())
            .unwrap_or_default();

        let perplexity_api_key = env::var("PERPLEXITY_API_KEY")
            .map_err(|_| anyhow::anyhow!("PERPLEXITY_API_KEY environment variable not found"))?;

        // ... rest of the existing configuration code ...

        Ok(Configuration {
            max_web_research_loops,
            local_llm,
            search_api,
            perplexity_api_key,
        })
    }
} 