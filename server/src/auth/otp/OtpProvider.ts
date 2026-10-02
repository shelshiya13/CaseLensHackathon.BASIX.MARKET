export interface OtpSendResult {
  delivered: boolean;
  mode: 'real' | 'dev';
  devCode?: string;
  message?: string;
}

export interface OtpProvider {
  name: 'dev-console' | 'smtp' | 'sms-webhook';
  send(identifier: string, channel: 'email' | 'sms', code: string): Promise<OtpSendResult>;
}
