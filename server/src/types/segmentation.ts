export interface SegmentationConfig {
  maxTokens: number;
  optimalChunkSize: number;
  overlapPercentage: number;
  avgCharsPerToken: number;
  preserveMarkup: boolean;
  smartParagraphDetection: boolean;
  contextWindow: number;
  minSegmentLength: number;
}
