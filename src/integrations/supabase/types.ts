export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      coaching_context: {
        Row: {
          avg_confidence_score: number
          filler_words_to_watch: string[] | null
          id: string
          last_session_at: string | null
          strong_areas: string[] | null
          total_sessions: number
          updated_at: string
          user_id: string
          weak_areas: string[] | null
        }
        Insert: {
          avg_confidence_score?: number
          filler_words_to_watch?: string[] | null
          id?: string
          last_session_at?: string | null
          strong_areas?: string[] | null
          total_sessions?: number
          updated_at?: string
          user_id: string
          weak_areas?: string[] | null
        }
        Update: {
          avg_confidence_score?: number
          filler_words_to_watch?: string[] | null
          id?: string
          last_session_at?: string | null
          strong_areas?: string[] | null
          total_sessions?: number
          updated_at?: string
          user_id?: string
          weak_areas?: string[] | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          action: string
          amount: number
          created_at: string
          id: string
          model: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          amount: number
          created_at?: string
          id?: string
          model?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          amount?: number
          created_at?: string
          id?: string
          model?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          badges: string[] | null
          byok_anthropic: boolean
          byok_gemini: boolean
          byok_openai: boolean
          coach_tone: string
          created_at: string
          credits: number
          credits_reset_at: string | null
          credits_used_this_month: number
          data_retention_days: number | null
          domain: string | null
          email: string
          experience_level: string | null
          full_name: string | null
          hint_style: string
          id: string
          interview_anxiety_score: number | null
          is_admin: boolean
          is_leaderboard_visible: boolean
          onboarding_completed: boolean
          onboarding_step: number
          plan: string
          preferred_model: string
          privacy_mode_default: boolean
          referral_code: string | null
          referral_credits_earned: number
          referred_by: string | null
          role: string | null
          streak_current: number
          streak_last_activity_date: string | null
          streak_longest: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_status: string | null
          target_companies: string[] | null
          updated_at: string
          xp: number
          years_of_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          badges?: string[] | null
          byok_anthropic?: boolean
          byok_gemini?: boolean
          byok_openai?: boolean
          coach_tone?: string
          created_at?: string
          credits?: number
          credits_reset_at?: string | null
          credits_used_this_month?: number
          data_retention_days?: number | null
          domain?: string | null
          email: string
          experience_level?: string | null
          full_name?: string | null
          hint_style?: string
          id: string
          interview_anxiety_score?: number | null
          is_admin?: boolean
          is_leaderboard_visible?: boolean
          onboarding_completed?: boolean
          onboarding_step?: number
          plan?: string
          preferred_model?: string
          privacy_mode_default?: boolean
          referral_code?: string | null
          referral_credits_earned?: number
          referred_by?: string | null
          role?: string | null
          streak_current?: number
          streak_last_activity_date?: string | null
          streak_longest?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          target_companies?: string[] | null
          updated_at?: string
          xp?: number
          years_of_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          badges?: string[] | null
          byok_anthropic?: boolean
          byok_gemini?: boolean
          byok_openai?: boolean
          coach_tone?: string
          created_at?: string
          credits?: number
          credits_reset_at?: string | null
          credits_used_this_month?: number
          data_retention_days?: number | null
          domain?: string | null
          email?: string
          experience_level?: string | null
          full_name?: string | null
          hint_style?: string
          id?: string
          interview_anxiety_score?: number | null
          is_admin?: boolean
          is_leaderboard_visible?: boolean
          onboarding_completed?: boolean
          onboarding_step?: number
          plan?: string
          preferred_model?: string
          privacy_mode_default?: boolean
          referral_code?: string | null
          referral_credits_earned?: number
          referred_by?: string | null
          role?: string | null
          streak_current?: number
          streak_last_activity_date?: string | null
          streak_longest?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          target_companies?: string[] | null
          updated_at?: string
          xp?: number
          years_of_experience?: number | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          config: Json | null
          created_at: string
          credits_consumed: number
          duration_seconds: number
          ended_at: string | null
          id: string
          is_privacy_mode: boolean
          mode: string
          model_used: string | null
          room_id: string | null
          started_at: string
          status: string
          transcript_full: string | null
          user_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          credits_consumed?: number
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          is_privacy_mode?: boolean
          mode?: string
          model_used?: string | null
          room_id?: string | null
          started_at?: string
          status?: string
          transcript_full?: string | null
          user_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          credits_consumed?: number
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          is_privacy_mode?: boolean
          mode?: string
          model_used?: string | null
          room_id?: string | null
          started_at?: string
          status?: string
          transcript_full?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deduct_credits: {
        Args: { p_action: string; p_cost: number; p_session_id?: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
