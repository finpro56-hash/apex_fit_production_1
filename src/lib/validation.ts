/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export function sanitizeString(input: string, maxLength = 2000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function getZodErrorMessage(error: z.ZodError): string {
  return error.issues?.[0]?.message || error.message || 'Validation failed';
}

export const UserProfileSchema = z.object({
  heightCm: z.number().min(50, 'Height must be at least 50 cm').max(300, 'Height must be under 300 cm'),
  weightKg: z.number().min(20, 'Weight must be at least 20 kg').max(500, 'Weight must be under 500 kg'),
  age: z.number().int().min(18, 'Apex Fit is currently intended for adults 18 and older').max(120, 'Age must be under 120'),
  sex: z.enum(['male', 'female', 'unspecified']).default('unspecified'),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'very', 'extra']).default('moderate'),
});

export const UserGoalsSchema = z.object({
  calorieTarget: z.number().min(500, 'Calorie target must be at least 500 kcal').max(10000, 'Calorie target must be under 10,000 kcal'),
  proteinTarget: z.number().min(0).max(1000),
  carbTarget: z.number().min(0).max(2000),
  fatTarget: z.number().min(0).max(1000),
});

export const FoodLogItemSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  foodName: z.string().min(1, 'Food name cannot be empty').max(200, 'Food name too long'),
  quantity: z.number().positive().optional(),
  portion: z.string().max(100).optional(),
  calories: z.number().finite().min(0).max(10000),
  proteinG: z.number().finite().min(0).max(1000),
  carbsG: z.number().finite().min(0).max(2000),
  fatG: z.number().finite().min(0).max(1000),
  source: z.enum(['manual', 'photo', 'voice', 'text']).default('manual'),
  confidence: z.number().min(0).max(1).optional(),
  userConfirmed: z.boolean().default(true),
});

export const ProgressEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  weightKg: z.number().min(20, 'Weight must be at least 20 kg').max(500, 'Weight must be under 500 kg'),
  bodyFatPercentage: z.number().min(1).max(70).nullable().optional(),
  notes: z.string().max(500).optional(),
});

export const AnalyzePhotoRequestSchema = z.object({
  imageBase64: z.string().min(10, 'Missing or invalid base64 image data').max(8 * 1024 * 1024, 'Image payload exceeds maximum allowed size (8MB)'),
  mimeType: z.string().regex(/^image\/(jpeg|png|webp|heic)$/i, 'Unsupported image format. Supported formats: JPEG, PNG, WebP, HEIC').default('image/jpeg'),
});

export const ExtractFoodTextRequestSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty').max(2000, 'Text too long (max 2000 characters)'),
});

export const EstimateFoodRequestSchema = z.object({
  foodName: z.string().min(1, 'Food name cannot be empty').max(200, 'Food name too long'),
  quantity: z.string().max(100).optional(),
});

export const CalculateNutritionGoalsRequestSchema = z.object({
  heightCm: z.number().min(50).max(300),
  weightKg: z.number().min(20).max(500),
  age: z.number().int().min(18).max(120),
  sex: z.enum(['male', 'female', 'unspecified']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'very', 'extra']).default('moderate'),
  calorieTarget: z.number().min(500).max(10000).optional(),
});

const AiFoodContextSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  foodName: z.string().max(200),
  calories: z.number().finite().min(0).max(10000),
  proteinG: z.number().finite().min(0).max(1000),
  carbsG: z.number().finite().min(0).max(2000),
  fatG: z.number().finite().min(0).max(1000),
}).optional();

const AiProfileContextSchema = z.object({
  heightCm: z.number().min(50).max(300),
  weightKg: z.number().min(20).max(500),
  age: z.number().int().min(18).max(120),
  sex: z.enum(['male', 'female', 'unspecified']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'very', 'extra']),
}).optional();

const AiGoalsContextSchema = z.object({
  calorieTarget: z.number().min(500).max(10000),
  proteinTarget: z.number().min(0).max(1000),
  carbTarget: z.number().min(0).max(2000),
  fatTarget: z.number().min(0).max(1000),
}).optional();

const AiWorkoutContextSchema = z.object({
  planTitle: z.string().max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed: z.boolean(),
  durationMinutes: z.number().int().min(0).max(1440),
}).array().max(5).optional();

export const AiChatContextSchema = z.object({
  profile: AiProfileContextSchema,
  goals: AiGoalsContextSchema,
  todayFoodLogs: AiFoodContextSchema.array().max(50).optional(),
  recentWorkouts: AiWorkoutContextSchema,
}).strict();

export const AiChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long (max 2000 characters)'),
  context: AiChatContextSchema.optional(),
});

export const WorkoutPlanSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500),
  exercises: z.array(z.string().min(1).max(100)).min(1).max(50),
});

export const WorkoutExerciseSetSchema = z.object({
  setNumber: z.number().int().min(1).max(100),
  weightKg: z.number().finite().min(0).max(1000),
  reps: z.number().int().min(0).max(1000),
  completed: z.boolean().optional(),
});

export const WorkoutExerciseSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  sets: z.array(WorkoutExerciseSetSchema).min(1).max(50),
});

export const WorkoutSessionSchema = z.object({
  planTitle: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exercises: z.array(WorkoutExerciseSchema).min(1).max(50),
  completed: z.boolean(),
  durationMinutes: z.number().int().min(0).max(1440),
});
