use anyhow::Result;
use ollama_deep_researcher::{Configuration, ResearchGraph, SummaryStateInput};

#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables from .env file
    dotenv::dotenv().ok();
    
    // Create configuration (will load from environment variables)
    let config = Configuration::from_env();
    
    // Create the research graph
    let graph = ResearchGraph::new(config);
    
    // Create input with a research topic
    let input = SummaryStateInput {
        research_topic: Some("Explain how Rust's ownership system works".to_string()),
    };
    
    // Run the research process
    println!("Starting research...");
    let output = graph.run(input).await?;
    
    // Print the results
    if let Some(summary) = output.running_summary {
        println!("\nResearch Results:\n{}", summary);
    } else {
        println!("\nNo summary generated.");
    }
    
    Ok(())
} 