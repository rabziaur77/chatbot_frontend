/**
 * Response shapes, transcribed from the FastAPI routers.
 *
 * Hand-written rather than generated so the oddities stay visible instead of
 * being smoothed over. Three that will bite if you assume otherwise:
 *
 *   - `detail` is a string for every application error but an *array* of
 *     objects on a 422 validation failure.
 *   - list endpoints return bare arrays; there is no envelope and no total.
 *   - DocumentResponse serialises dates as strings while other models emit real
 *     datetimes. Both are ISO-8601 on the wire.
 */

export type Plan = 'trial' | 'pro' | 'enterprise';
export type Role = 'owner' | 'admin' | 'member';

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type TicketStatus = 'open' | 'assigned' | 'resolved';

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
  plan: Plan;
  pending_plan: Plan | null;
  billing_provider: 'razorpay' | 'paypal' | null;
}

export interface MeResponse {
  user: UserResponse;
  organizations: OrgSummary[];
}

export interface AuthResponse extends MeResponse {
  access_token: string;
  token_type: string;
  /** seconds, not minutes */
  expires_in: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MemberResponse {
  /** the pk here is user_id, not id */
  user_id: string;
  email: string;
  name: string;
  role: Role;
  joined_at: string;
}

export interface ProjectResponse {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  system_prompt: string;
  tone: string;
  llm_model_override: string | null;
  handoff_phrases: string | null;
  /** a JSON *string*, not an object */
  widget_config: string;
  created_at: string;
}

/** Only ever returned by create and keys/rotate. */
export interface ProjectCreatedResponse extends ProjectResponse {
  public_key: string;
}

export interface ProjectDomainResponse {
  id: string;
  host: string;
  verified_at: string | null;
}

export interface DocumentResponse {
  id: string;
  project_id: string;
  source_type: 'pdf' | 'docx' | 'text' | 'url';
  title: string;
  source_url: string | null;
  status: DocumentStatus;
  error: string | null;
  chunk_count: number;
  char_count: number;
  indexed_at: string | null;
  created_at: string;
}

export interface Citation {
  document_id: string;
  title: string;
  section: string | null;
  score: number;
}

export interface MessageResponse {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[];
  latency_ms: number | null;
  model: string | null;
  created_at: string;
}

export interface ConversationResponse {
  id: string;
  project_id: string;
  visitor_id: string;
  status: string;
  handoff_state: string;
  page_url: string | null;
  referrer: string | null;
  message_count: number;
  started_at: string;
  last_message_at: string | null;
  has_ticket: boolean;
}

export interface ConversationDetail extends ConversationResponse {
  messages: MessageResponse[];
}

export interface TicketResponse {
  id: string;
  conversation_id: string;
  subject: string;
  summary: string;
  urgency: string;
  status: TicketStatus;
  assignee: string | null;
  created_at: string;
  visitor_id: string;
  project_id: string;
}

export interface UsageResponse {
  period: string;
  messages_used: number;
  conversations_started: number;
  messages_limit: number | null;
  plan: Plan;
  messages_remaining: number | null;
  messages_percent_used: number | null;
}

export interface WidgetConfigResponse {
  project_id: string;
  bot_name: string;
  subtitle: string;
  greeting: string;
  theme_color: string;
  position: 'left' | 'right';
  launcher_label: string;
  dark_mode: boolean;
  plan: Plan;
  watermarked: boolean;
}