export interface ModelConfig {
  id: string;
  name: string;
  size: number;
  maxTokens: number;
  context: number;
  optimalChunkSize: number;
  overlapPercentage: number;
  avgCharsPerToken: number;
  description: string;
  capabilities: string[];
}