export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  correlationId?: string;
  details?: Array<{ path: string; message: string }>;
  timestamp: string;
}
