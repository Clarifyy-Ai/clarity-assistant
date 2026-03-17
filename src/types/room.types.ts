import type { InterviewType } from "./session.types";

export type RoomStatus = "waiting" | "in_progress" | "completed" | "cancelled";

export interface PracticeRoom {
  id: string;
  host_id: string;
  name: string;
  interview_type: InterviewType;
  status: RoomStatus;
  max_participants: number;
  is_public: boolean;
  share_token: string;
  current_question_index: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: "candidate" | "interviewer" | "observer";
  is_online: boolean;
  is_ready: boolean;
  joined_at: string;
}

export interface RoomQuestion {
  id: string;
  room_id: string;
  question_text: string;
  question_type: InterviewType;
  order_index: number;
  created_at: string;
}

export interface RoomChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  content: string;
  type: "chat" | "system" | "feedback";
  created_at: string;
}
