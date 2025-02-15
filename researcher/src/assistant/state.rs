use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SummaryState {
    #[serde(default)]
    pub research_topic: Option<String>,
    #[serde(default)]
    pub search_query: Option<String>,
    #[serde(default)]
    pub web_research_results: Vec<String>,
    #[serde(default)]
    pub sources_gathered: Vec<String>,
    #[serde(default)]
    pub research_loop_count: i32,
    #[serde(default)]
    pub running_summary: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SummaryStateInput {
    pub research_topic: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SummaryStateOutput {
    pub running_summary: Option<String>,
}

impl SummaryState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_research_topic(research_topic: String) -> Self {
        Self {
            research_topic: Some(research_topic),
            ..Default::default()
        }
    }

    pub fn add_web_research_result(&mut self, result: String) {
        self.web_research_results.push(result);
    }

    pub fn add_source(&mut self, source: String) {
        self.sources_gathered.push(source);
    }

    pub fn increment_loop_count(&mut self) {
        self.research_loop_count += 1;
    }

    pub fn set_running_summary(&mut self, summary: String) {
        self.running_summary = Some(summary);
    }

    pub fn set_search_query(&mut self, query: String) {
        self.search_query = Some(query);
    }
} 