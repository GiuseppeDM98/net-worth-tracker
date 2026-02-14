import { Timestamp } from 'firebase/firestore';
import { AssetClass } from './assets';

// Goal-Based Investing Types
//
// Enables mental allocation of portfolio portions to specific financial goals
// (house purchase, retirement, car, emergency fund, etc.).
// Each goal tracks progress toward a target amount and can have a recommended
// asset class allocation for comparison against actual holdings.

export type GoalPriority = 'alta' | 'media' | 'bassa';

// A financial goal with target amount, optional deadline, and recommended allocation.
// Goals are stored as an array in a single Firestore document per user.
export interface InvestmentGoal {
  id: string;
  name: string;                    // e.g., "Acquisto Casa", "Pensione"
  targetAmount?: number;           // Target EUR amount (optional — some goals are open-ended like saving for children)
  targetDate?: string;             // ISO date string (optional for open-ended goals like retirement)
  priority: GoalPriority;
  color: string;                   // Hex color for charts
  recommendedAllocation?: Partial<Record<AssetClass, number>>; // Suggested asset class mix, values sum to 100
  notes?: string;                  // Free-text notes (max 500 chars)
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

// Links an asset (by percentage) to a goal.
// Stored as a flat array — group by assetId and sum percentages to validate <= 100%.
export interface GoalAssetAssignment {
  goalId: string;
  assetId: string;
  percentage: number; // 0-100, percentage of this asset's value assigned to this goal
}

// Top-level Firestore document per user (collection: goalBasedInvesting/{userId})
export interface GoalBasedInvestingData {
  goals: InvestmentGoal[];
  assignments: GoalAssetAssignment[];
}

// Calculated progress for a single goal (derived, not stored)
export interface GoalProgress {
  goalId: string;
  goalName: string;
  goalColor: string;
  currentValue: number;           // Sum of assigned asset portions in EUR
  targetAmount?: number;          // undefined for open-ended goals
  progressPercentage?: number;    // 0-100+, undefined if no target
  remainingAmount?: number;       // undefined if no target
  actualAllocation: Partial<Record<AssetClass, number>>; // Actual asset class breakdown (percentages)
}

// Preset templates for quick goal creation
export interface GoalTemplate {
  name: string;
  color: string;
  priority: GoalPriority;
  recommendedAllocation?: Partial<Record<AssetClass, number>>;
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    name: 'Acquisto Casa',
    color: '#3B82F6', // blue
    priority: 'alta',
    recommendedAllocation: { bonds: 70, equity: 20, cash: 10 },
  },
  {
    name: 'Pensione',
    color: '#22C55E', // green
    priority: 'alta',
    recommendedAllocation: { equity: 80, bonds: 20 },
  },
  {
    name: 'Auto',
    color: '#F97316', // orange
    priority: 'media',
    recommendedAllocation: { bonds: 80, cash: 20 },
  },
  {
    name: 'Fondo Emergenza',
    color: '#EF4444', // red
    priority: 'alta',
    recommendedAllocation: { cash: 100 },
  },
];

// Preset color palette for goal creation UI
export const GOAL_COLORS = [
  '#3B82F6', // blue
  '#22C55E', // green
  '#F97316', // orange
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#EAB308', // yellow
  '#6366F1', // indigo
  '#64748B', // slate
];
