import type { AnalysisOpportunities } from './svg-analysis';
import type { SerializedTextConversionOptions } from './svg-fonts';

export type NormalizationWorkerRequest = {
  type: 'analyze';
  requestId: number;
  source: string;
  options: SerializedTextConversionOptions;
};

export type NormalizationWorkerProgressMessage = {
  type: 'progress';
  requestId: number;
  label: string;
  progress: number | null;
};

export type NormalizationWorkerResultMessage = {
  type: 'result';
  requestId: number;
  opportunities: AnalysisOpportunities;
};

export type NormalizationWorkerErrorMessage = {
  type: 'error';
  requestId: number;
  message: string;
};

export type NormalizationWorkerMessage =
  | NormalizationWorkerProgressMessage
  | NormalizationWorkerResultMessage
  | NormalizationWorkerErrorMessage;