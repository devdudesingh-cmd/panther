/**
 * Hand-maintained row types for the tables in supabase/migrations.
 * Keep in sync with 0001_init.sql.
 */

export type SessionKind = "trial" | "paid";
export type SessionStatus = "held" | "confirmed" | "completed" | "cancelled" | "expired";
export type FlagSeverity = "low" | "medium" | "high";

export type ParentRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  timezone: string;
  adult_guardian_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ChildRow = {
  id: string;
  parent_id: string;
  first_name: string;
  grade: number;
  created_at: string;
}

export type PracticeItem = {
  question: string;
  answer: string;
  hint?: string;
}

export type SessionRow = {
  id: string;
  parent_id: string;
  child_id: string | null;
  kind: SessionKind;
  status: SessionStatus;
  starts_at: string;
  ends_at: string;
  block_until: string;
  seat: number;
  hold_expires_at: string | null;
  topic: string | null;
  parent_timezone: string;
  price_cents: number;
  currency: string;
  stripe_checkout_id: string | null;
  stripe_payment_intent: string | null;
  stripe_setup_intent: string | null;
  stripe_refund_id: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  meet_space: string | null;
  meet_url: string | null;
  calendar_event_id: string | null;
  recall_bot_id: string | null;
  bot_status: string | null;
  bot_status_at: string | null;
  recap: string | null;
  practice: PracticeItem[] | null;
  practice_token: string | null;
  recap_ready_at: string | null;
  confirmation_sent_at: string | null;
  reminder_24h_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  fulfilled_at: string | null;
  fulfillment_error: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type SessionFileRow = {
  id: string;
  session_id: string;
  parent_id: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export type ConsentRow = {
  id: string;
  parent_id: string;
  session_id: string | null;
  policy_version: string;
  consented_at: string;
  ip_hash: string | null;
  user_agent: string | null;
}

export type TrialClaimRow = {
  id: string;
  email_hash: string;
  card_fingerprint: string | null;
  phone_hash: string | null;
  parent_id: string | null;
  session_id: string | null;
  created_at: string;
}

export type BlockedTimeRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export type AppSettingsRow = {
  id: number;
  bookings_paused: boolean;
  paused_message: string | null;
  updated_at: string;
}

export type StripeEventRow = {
  event_id: string;
  type: string;
  processed_at: string;
}

export type RecallEventRow = {
  event_id: string;
  bot_id: string | null;
  code: string | null;
  sub_code: string | null;
  payload: unknown;
  received_at: string;
}

export type PaymentFailureRow = {
  id: string;
  parent_id: string | null;
  session_id: string | null;
  stripe_object_id: string | null;
  reason: string | null;
  created_at: string;
}

export type SafetyFlagRow = {
  id: string;
  session_id: string | null;
  severity: FlagSeverity;
  note: string;
  raised_by: string;
  alerted_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      parents: Table<ParentRow>;
      children: Table<ChildRow>;
      sessions: Table<SessionRow>;
      session_files: Table<SessionFileRow>;
      consents: Table<ConsentRow>;
      trial_claims: Table<TrialClaimRow>;
      blocked_times: Table<BlockedTimeRow>;
      app_settings: Table<AppSettingsRow>;
      stripe_events: Table<StripeEventRow>;
      recall_events: Table<RecallEventRow>;
      payment_failures: Table<PaymentFailureRow>;
      safety_flags: Table<SafetyFlagRow>;
    };
    Views: Record<string, never>;
    Functions: {
      book_slot: {
        Args: {
          p_parent_id: string;
          p_child_id: string | null;
          p_kind: SessionKind;
          p_starts_at: string;
          p_minutes: number;
          p_buffer_minutes: number;
          p_max_seats: number;
          p_hold_minutes: number;
          p_topic: string | null;
          p_price_cents: number;
          p_parent_timezone: string | null;
        };
        Returns: SessionRow;
      };
      move_session: {
        Args: { p_session_id: string; p_starts_at: string; p_buffer_minutes: number; p_max_seats: number };
        Returns: SessionRow;
      };
      delete_child_data: {
        Args: { p_parent_id: string; p_child_id: string };
        Returns: number;
      };
      expire_stale_holds: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      session_kind: SessionKind;
      session_status: SessionStatus;
      flag_severity: FlagSeverity;
    };
    CompositeTypes: Record<string, never>;
  };
}
