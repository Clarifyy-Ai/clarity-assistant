// ─────────────────────────────────────────────────────────────────
// Gamification Types — XP, Badges, Streaks, Challenges
// ─────────────────────────────────────────────────────────────────

// ── XP ────────────────────────────────────────────────────────────

export type XPEventType =
  | "mock_session_complete"
  | "live_session_complete"
  | "prep_lab_use"
  | "debrief_complete"
  | "first_session"
  | "streak_milestone"
  | "weekly_challenge_complete"
  | "answer_saved"
  | "resume_uploaded"
  | "zero_filler_session"
  | "perfect_score"
  | "room_session_complete"
  | "referral_converted";

export const XP_REWARDS: Record<XPEventType, number> = {
  mock_session_complete:       50,
  live_session_complete:       40,
  prep_lab_use:                10,
  debrief_complete:            20,
  first_session:               100,
  streak_milestone:            25,
  weekly_challenge_complete:   75,
  answer_saved:                5,
  resume_uploaded:             15,
  zero_filler_session:         30,
  perfect_score:               50,
  room_session_complete:       45,
  referral_converted:          60,
};

export interface XPEvent {
  id: string;
  user_id: string;
  event_type: XPEventType;
  xp_awarded: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface XPLevelThreshold {
  level: number;
  label: string;                   // e.g. "Interview Apprentice"
  xp_required: number;
  badge_id: string | null;
  perks: string[];
}

export const XP_LEVELS: XPLevelThreshold[] = [
  { level: 1,  label: "Interview Novice",       xp_required: 0,    badge_id: null,             perks: [] },
  { level: 2,  label: "Interview Apprentice",   xp_required: 200,  badge_id: "apprentice",     perks: ["Access prep lab"] },
  { level: 3,  label: "Confident Speaker",      xp_required: 500,  badge_id: "confident",      perks: ["Unlock answer history"] },
  { level: 4,  label: "STAR Practitioner",      xp_required: 1000, badge_id: "star_user",      perks: ["STAR bank unlocked"] },
  { level: 5,  label: "Mock Interview Pro",     xp_required: 2000, badge_id: "mock_pro",       perks: ["Advanced analytics"] },
  { level: 6,  label: "System Design Aware",    xp_required: 3500, badge_id: "sysdesign",      perks: ["System Design guide"] },
  { level: 7,  label: "Live Interview Ready",   xp_required: 5000, badge_id: "live_ready",     perks: ["Live co-pilot full access"] },
  { level: 8,  label: "Zero Filler Champion",   xp_required: 7500, badge_id: "zero_filler",    perks: ["Filler insights dashboard"] },
  { level: 9,  label: "Interview Strategist",   xp_required: 10000,badge_id: "strategist",     perks: ["Company deep research"] },
  { level: 10, label: "Clarify AI Master",       xp_required: 15000,badge_id: "master",         perks: ["All features unlocked", "Master badge"] },
];

// ── Badges ────────────────────────────────────────────────────────

export type BadgeId =
  | "first_session"
  | "ten_sessions"
  | "twenty_five_sessions"
  | "fifty_sessions"
  | "hundred_sessions"
  | "first_live"
  | "streak_7"
  | "streak_14"
  | "streak_30"
  | "streak_60"
  | "zero_filler"
  | "perfect_score"
  | "confidence_70"
  | "confidence_90"
  | "star_builder_10"
  | "debrief_5"
  | "room_host"
  | "referral_3"
  | "resume_uploaded"
  | "referral_converted"
  | "all_interview_types"
  | "level_5"
  | "level_10"
  | "level_20"
  | "level_50"
  | "apprentice"
  | "confident"
  | "star_user"
  | "mock_pro"
  | "sysdesign"
  | "live_ready"
  | "strategist"
  | "master";

export type BadgeRarity = "common" | "uncommon" | "rare" | "legendary";

export interface BadgeDefinition {
  id: BadgeId;
  name: string;
  description: string;
  icon: string;                    // emoji or icon name
  rarity: BadgeRarity;
  xp_bonus: number;
  condition_description: string;
  is_hidden: boolean;              // surprise badge — not shown until unlocked
}

export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  first_session: {
    id: "first_session",
    name: "First Step",
    description: "Completed your first practice session",
    icon: "🎯",
    rarity: "common",
    xp_bonus: 50,
    condition_description: "Complete 1 session",
    is_hidden: false,
  },
  ten_sessions: {
    id: "ten_sessions",
    name: "Consistent Practitioner",
    description: "Completed 10 sessions",
    icon: "🔥",
    rarity: "common",
    xp_bonus: 100,
    condition_description: "Complete 10 sessions",
    is_hidden: false,
  },
  twenty_five_sessions: {
    id: "twenty_five_sessions",
    name: "Committed",
    description: "Completed 25 sessions",
    icon: "💪",
    rarity: "uncommon",
    xp_bonus: 150,
    condition_description: "Complete 25 sessions",
    is_hidden: false,
  },
  fifty_sessions: {
    id: "fifty_sessions",
    name: "Interview Athlete",
    description: "Completed 50 sessions",
    icon: "🏋️",
    rarity: "rare",
    xp_bonus: 250,
    condition_description: "Complete 50 sessions",
    is_hidden: false,
  },
  hundred_sessions: {
    id: "hundred_sessions",
    name: "Century Club",
    description: "Completed 100 sessions",
    icon: "💯",
    rarity: "legendary",
    xp_bonus: 500,
    condition_description: "Complete 100 sessions",
    is_hidden: false,
  },
  first_live: {
    id: "first_live",
    name: "Live & Unafraid",
    description: "Used the live co-pilot in a real interview",
    icon: "🎙️",
    rarity: "uncommon",
    xp_bonus: 100,
    condition_description: "Complete a live session",
    is_hidden: false,
  },
  streak_7: {
    id: "streak_7",
    name: "Week Warrior",
    description: "Maintained a 7-day practice streak",
    icon: "📅",
    rarity: "common",
    xp_bonus: 75,
    condition_description: "7-day streak",
    is_hidden: false,
  },
  streak_14: {
    id: "streak_14",
    name: "Fortnight Focus",
    description: "Maintained a 14-day practice streak",
    icon: "🗓️",
    rarity: "uncommon",
    xp_bonus: 150,
    condition_description: "14-day streak",
    is_hidden: false,
  },
  streak_30: {
    id: "streak_30",
    name: "Monthly Champion",
    description: "Maintained a 30-day practice streak",
    icon: "🏆",
    rarity: "rare",
    xp_bonus: 300,
    condition_description: "30-day streak",
    is_hidden: false,
  },
  streak_60: {
    id: "streak_60",
    name: "Unstoppable",
    description: "Maintained a 60-day practice streak",
    icon: "⚡",
    rarity: "legendary",
    xp_bonus: 600,
    condition_description: "60-day streak",
    is_hidden: true,
  },
  zero_filler: {
    id: "zero_filler",
    name: "Pure Signal",
    description: "Completed a full session with zero filler words",
    icon: "🔕",
    rarity: "rare",
    xp_bonus: 200,
    condition_description: "0 filler words in a session",
    is_hidden: false,
  },
  perfect_score: {
    id: "perfect_score",
    name: "Flawless",
    description: "Scored 95+ in a mock session",
    icon: "✨",
    rarity: "rare",
    xp_bonus: 200,
    condition_description: "Score 95+ overall",
    is_hidden: false,
  },
  confidence_70: {
    id: "confidence_70",
    name: "Confident Voice",
    description: "Reached a confidence score of 70",
    icon: "📈",
    rarity: "uncommon",
    xp_bonus: 100,
    condition_description: "Confidence score ≥ 70",
    is_hidden: false,
  },
  confidence_90: {
    id: "confidence_90",
    name: "Elite Performer",
    description: "Reached a confidence score of 90",
    icon: "🌟",
    rarity: "legendary",
    xp_bonus: 400,
    condition_description: "Confidence score ≥ 90",
    is_hidden: false,
  },
  star_builder_10: {
    id: "star_builder_10",
    name: "Story Crafter",
    description: "Saved 10 STAR answers",
    icon: "⭐",
    rarity: "uncommon",
    xp_bonus: 100,
    condition_description: "Save 10 STAR answers",
    is_hidden: false,
  },
  debrief_5: {
    id: "debrief_5",
    name: "Reflective Practitioner",
    description: "Completed 5 post-interview debriefs",
    icon: "📝",
    rarity: "uncommon",
    xp_bonus: 100,
    condition_description: "Complete 5 debriefs",
    is_hidden: false,
  },
  room_host: {
    id: "room_host",
    name: "Room Host",
    description: "Hosted a collaborative practice room",
    icon: "🏠",
    rarity: "uncommon",
    xp_bonus: 75,
    condition_description: "Host a practice room",
    is_hidden: false,
  },
  referral_3: {
    id: "referral_3",
    name: "Ambassador",
    description: "Referred 3 users who signed up",
    icon: "🤝",
    rarity: "rare",
    xp_bonus: 200,
    condition_description: "3 successful referrals",
    is_hidden: false,
  },
  resume_uploaded: {
    id: "resume_uploaded",
    name: "Resume Ready",
    description: "Uploaded your first resume",
    icon: "📄",
    rarity: "common",
    xp_bonus: 25,
    condition_description: "Upload a resume",
    is_hidden: false,
  },
  all_interview_types: {
    id: "all_interview_types",
    name: "All-Rounder",
    description: "Completed sessions in all 5 interview types",
    icon: "🎭",
    rarity: "rare",
    xp_bonus: 250,
    condition_description: "Practice all interview types",
    is_hidden: false,
  },
  // Level badges
  apprentice:  { id: "apprentice", name: "Apprentice",       description: "Reached Level 2", icon: "🌱", rarity: "common",    xp_bonus: 0,   condition_description: "Reach Level 2", is_hidden: false },
  confident:   { id: "confident",  name: "Confident",        description: "Reached Level 3", icon: "💬", rarity: "common",    xp_bonus: 0,   condition_description: "Reach Level 3", is_hidden: false },
  star_user:   { id: "star_user",  name: "STAR User",        description: "Reached Level 4", icon: "⭐", rarity: "uncommon",  xp_bonus: 0,   condition_description: "Reach Level 4", is_hidden: false },
  mock_pro:    { id: "mock_pro",   name: "Mock Pro",         description: "Reached Level 5", icon: "🎯", rarity: "uncommon",  xp_bonus: 0,   condition_description: "Reach Level 5", is_hidden: false },
  sysdesign:   { id: "sysdesign",  name: "System Thinker",   description: "Reached Level 6", icon: "🏗️", rarity: "rare",      xp_bonus: 0,   condition_description: "Reach Level 6", is_hidden: false },
  live_ready:  { id: "live_ready", name: "Live Ready",       description: "Reached Level 7", icon: "🎙️", rarity: "rare",      xp_bonus: 0,   condition_description: "Reach Level 7", is_hidden: false },
  strategist:  { id: "strategist", name: "Strategist",       description: "Reached Level 9", icon: "🧠", rarity: "legendary", xp_bonus: 0,   condition_description: "Reach Level 9", is_hidden: false },
  master:      { id: "master",     name: "Clarify AI Master", description: "Reached Level 10",icon: "👑", rarity: "legendary", xp_bonus: 0,   condition_description: "Reach Level 10",is_hidden: false },
  // Level milestone badges
  level_5:     { id: "level_5",    name: "Level 5",           description: "Reached Level 5", icon: "🎯", rarity: "uncommon",  xp_bonus: 0,   condition_description: "Reach Level 5", is_hidden: false },
  level_10:    { id: "level_10",   name: "Level 10",          description: "Reached Level 10",icon: "🏅", rarity: "rare",      xp_bonus: 0,   condition_description: "Reach Level 10",is_hidden: false },
  level_20:    { id: "level_20",   name: "Level 20",          description: "Reached Level 20",icon: "🌟", rarity: "rare",      xp_bonus: 0,   condition_description: "Reach Level 20",is_hidden: false },
  level_50:    { id: "level_50",   name: "Level 50",          description: "Reached Level 50",icon: "💎", rarity: "legendary", xp_bonus: 0,   condition_description: "Reach Level 50",is_hidden: false },
  referral_converted: { id: "referral_converted", name: "Referral Pro", description: "Had a referral convert", icon: "🤝", rarity: "uncommon", xp_bonus: 50, condition_description: "Referral converted", is_hidden: false },
};

// ── Weekly Challenge ──────────────────────────────────────────────

export interface WeeklyChallenge {
  id: string;
  week_start: string;
  week_end: string;
  title: string;
  description: string;
  goal: number;
  progress: number;
  reward_xp: number;
  type: string;
  user_id: string;
  completed: boolean;
  created_at: string;
  // Optional fields from frontend logic
  target_count?: number;
  interview_type?: string | null;
  session_mode?: string | null;
  xp_reward?: number;
  badge_reward?: BadgeId | null;
  is_completed?: boolean;
  completed_at?: string | null;
}

// ── Gamification Store State ──────────────────────────────────────

export interface GamificationState {
  xp: number;
  level: number;
  level_label: string;
  xp_to_next_level: number;
  xp_progress_percent: number;
  streak_current: number;
  streak_longest: number;
  streak_last_activity: string | null;
  unlocked_badges: BadgeId[];
  recent_xp_events: XPEvent[];
  weekly_challenge: WeeklyChallenge | null;
  pending_badge_unlock: BadgeId | null; // triggers toast animation
}
