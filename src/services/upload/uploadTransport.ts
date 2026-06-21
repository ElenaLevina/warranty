/**
 * UploadTransport — the network boundary for sending files to the PC receiver.
 * Abstracted so HttpUploadService is testable on Node with a fake transport.
 *
 * REST contract (see docs/upload.md):
 *   POST {baseUrl}/v1/cases/{caseId}/files      multipart: file + fields
 *   POST {baseUrl}/v1/cases/{caseId}/complete   JSON: session.json
 *   GET  {baseUrl}/v1/health
 * All requests carry `Authorization: Bearer <token>`.
 */
export interface UploadFileParams {
  baseUrl: string;
  token: string;
  caseId: string;
  /** Readable (already decrypted) absolute file path. */
  filePath: string;
  fileName: string;
  type: 'photo' | 'video' | 'meta';
}

export interface CompleteParams {
  baseUrl: string;
  token: string;
  caseId: string;
  /** Plaintext session.json contents. */
  sessionJson: string;
}

export interface UploadTransport {
  uploadFile(params: UploadFileParams): Promise<void>;
  complete(params: CompleteParams): Promise<void>;
  health(baseUrl: string, token: string): Promise<boolean>;
}
