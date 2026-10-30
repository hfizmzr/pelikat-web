import type { LucideIcon } from "lucide-react"
import { Award, CalendarDays, Dumbbell, Flame, Footprints, Gem, Medal, Star, Trophy, Zap } from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORITATIVE badge_key registry.
//
// Ground truth: pelikat-api `/apps/badges/services.py` BADGE_RULES — these 13
// keys are the exact strings the Django evaluation engine writes to
// `runner_badges.badge_key`. Do not add keys here unless the backend adds
// matching rules (keys like "5k_club"/"marathon_club"/"early_bird" were a
// hand-maintained list that could never match a real row).
//
// `icon` mirrors the backend definition (shown in the live toast); the
// Lucide icon + accent color are web-presentation fallbacks since
// runner_badges rows carry no icon/color.
// ─────────────────────────────────────────────────────────────────────────────

export interface BadgeDefinition {
  badge_key: string
  name: string
  description: string
  icon: string
  lucideIcon: LucideIcon
  color: string
}

export const BADGE_DEFINITIONS: Record<string, BadgeDefinition> = {
  first_run: {
    badge_key: 'first_run',
    name: 'First Run',
    description: 'Completed your first virtual run',
    icon: '🏃',
    lucideIcon: Flame,
    color: '#ef4444',
  },
  '5k_distance': {
    badge_key: '5k_distance',
    name: '5K Club',
    description: 'Ran a total of 5 kilometers',
    icon: '🎯',
    lucideIcon: Star,
    color: '#22c55e',
  },
  '10k_distance': {
    badge_key: '10k_distance',
    name: '10K Club',
    description: 'Ran a total of 10 kilometers',
    icon: '🏆',
    lucideIcon: Award,
    color: '#0f9b9b',
  },
  '21k_distance': {
    badge_key: '21k_distance',
    name: 'Half Marathon',
    description: 'Ran a total of 21.1 kilometers',
    icon: '🥈',
    lucideIcon: Medal,
    color: '#0ea5e9',
  },
  '42k_distance': {
    badge_key: '42k_distance',
    name: 'Full Marathon',
    description: 'Ran a total of 42.2 kilometers',
    icon: '🌟',
    lucideIcon: Trophy,
    color: '#f97316',
  },
  '100k_distance': {
    badge_key: '100k_distance',
    name: '100K Club',
    description: 'Ran a total of 100 kilometers',
    icon: '💎',
    lucideIcon: Gem,
    color: '#8b5cf6',
  },
  '5_runs': {
    badge_key: '5_runs',
    name: '5 Runs',
    description: 'Logged 5 virtual runs',
    icon: '🏃‍♂️',
    lucideIcon: Footprints,
    color: '#0f9b9b',
  },
  '10_runs': {
    badge_key: '10_runs',
    name: '10 Runs',
    description: 'Logged 10 virtual runs',
    icon: '🏃‍♀️',
    lucideIcon: Footprints,
    color: '#0ea5e9',
  },
  '25_runs': {
    badge_key: '25_runs',
    name: '25 Runs',
    description: 'Logged 25 virtual runs',
    icon: '💪',
    lucideIcon: Dumbbell,
    color: '#22c55e',
  },
  '50_runs': {
    badge_key: '50_runs',
    name: '50 Runs',
    description: 'Logged 50 virtual runs',
    icon: '🔥',
    lucideIcon: Trophy,
    color: '#f97316',
  },
  streak_3: {
    badge_key: 'streak_3',
    name: '3-Day Streak',
    description: 'Ran on 3 consecutive days',
    icon: '📅',
    lucideIcon: CalendarDays,
    color: '#0ea5e9',
  },
  streak_7: {
    badge_key: 'streak_7',
    name: '7-Day Streak',
    description: 'Ran on 7 consecutive days',
    icon: '🔥',
    lucideIcon: CalendarDays,
    color: '#f97316',
  },
  streak_30: {
    badge_key: 'streak_30',
    name: '30-Day Streak',
    description: 'Ran on 30 consecutive days',
    icon: '⚡',
    lucideIcon: Zap,
    color: '#eab308',
  },
}
