/**
 * Email Campaign Types — Email 2 only.
 *
 * The only campaign we run is Email 2: a daily transactional follow-up to
 * users who volunteered an email in the recent lookback window. See
 * backend/src/routes/emails.ts and backend/src/cron/send-daily-emails.ts.
 */

export interface EmailCampaignConfig {
  campaignId: 'email2';
  subject: string;
  htmlContent: string;
  textContent: string;
  senderEmail: string;
  senderName: string;
  replyTo: string;
}

export interface EmailRecipient {
  id: string;
  email: string;
  displayName?: string;
  lastAccessedAt: Date;
  createdAt: Date;
  subscribed: boolean;
}

export interface CampaignSendResult {
  campaignId: 'email2';
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  sentAt: string;
  errors: Array<{ email: string; error: string }>;
}

export interface CampaignStatus {
  campaignId: 'email2';
  lastSentAt?: string;
  lastSentCount?: number;
  nextScheduledAt?: string;
  automationEnabled: boolean;
  automationSchedule?: string; // e.g. "0 8 * * *" for 08:00 UTC daily
}

export interface DailySendLog {
  id: string;
  campaignId: 'email2';
  sentDate: string; // YYYY-MM-DD
  recipientCount: number;
  successCount: number;
  failureCount: number;
  sentAt: string;
  emailsSent: Array<{
    email: string;
    sentAt: string;
    status: 'success' | 'failed';
    errorMessage?: string;
  }>;
}

export interface EmailTemplatePreview {
  campaignId: 'email2';
  subject: string;
  htmlContent: string;
  recipientCount: number;
  estimatedSendTime?: string;
  excludedEmails?: string[];
}

export interface AccessTrackingRecord {
  userId: string;
  email: string;
  lastAccessedAt: Date;
  accessCount: number;
  daysInactive: number;
}
