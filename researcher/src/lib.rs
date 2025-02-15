pub mod assistant {
    pub mod configuration;
    pub mod graph;
    pub mod prompts;
    pub mod state;
    pub mod utils;
}

pub use assistant::configuration::Configuration;
pub use assistant::graph::ResearchGraph;
pub use assistant::state::{SummaryState, SummaryStateInput, SummaryStateOutput}; 