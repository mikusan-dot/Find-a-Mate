import { z } from 'zod';
import { GOALS, GENDERS, VISIBILITY, DISCOVERY_MODES, REPORT_CATEGORIES, PRIVACY_FIELDS, PERSONALITY_TRAITS } from '../config/constants.js';

const slider = z.number().int().min(0).max(100);
const cleanText = (max) => z.string().trim().max(max).transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, ''));

export const registerSchema = z.object({
  universityId: z.string().min(1).max(64),
  studentId: z.string().trim().min(3).max(32),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
  ageConfirmed: z.literal(true),
  age: z.number().int().min(18).max(80),
  gender: z.enum(GENDERS),
  connectionTypes: z.array(z.enum(GOALS)).min(1).max(GOALS.length),
});

const personality = z.object(Object.fromEntries(PERSONALITY_TRAITS.map((t) => [t, slider])));

export const profileSchema = z
  .object({
    displayName: cleanText(40).pipe(z.string().min(2)),
    photoURL: z.string().url().max(500).startsWith('https://').nullable(),
    department: cleanText(60).pipe(z.string().min(1)),
    academicYear: z.number().int().min(1).max(8),
    age: z.number().int().min(18).max(80),
    gender: z.enum(GENDERS),
    bio: cleanText(300),
    personality,
    interests: z.array(cleanText(30).pipe(z.string().min(1))).min(1).max(15),
    lifestyle: z.object({
      sleep: z.enum(['EARLY', 'NORMAL', 'NIGHT_OWL']),
      studyHabit: z.enum(['SOLO', 'GROUP', 'MIXED']),
      socialActivity: slider,
      weekend: z.enum(['HOME', 'OUTDOOR', 'MIXED']),
      indoorOutdoor: slider, // 0 indoor ... 100 outdoor
      workStudyBalance: slider, // 0 all work/study ... 100 all play
      smokes: z.boolean(),
      drinks: z.boolean(),
    }),
    communication: z.object({
      frequency: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      depth: z.enum(['LIGHT', 'MIXED', 'DEEP']),
      medium: z.enum(['TEXT', 'VOICE', 'IN_PERSON', 'MIXED']),
      groupVsOne: z.enum(['GROUP', 'ONE_ON_ONE', 'BOTH']),
    }),
    goals: z.array(z.enum(GOALS)).min(1).max(GOALS.length),
    preferences: z.object({
      ageMin: z.number().int().min(18).max(80),
      ageMax: z.number().int().min(18).max(80),
      genders: z.array(z.enum(GENDERS)).max(GENDERS.length), // empty = no preference
      university: z.enum(['ANY', 'SAME', 'OTHER']),
      department: z.enum(['ANY', 'SAME', 'DIFFERENT']),
    }),
    dealBreakers: z.object({
      smoking: z.boolean(),
      alcohol: z.boolean(),
      verySocial: z.boolean(),
      differentCommFrequency: z.boolean(),
    }),
  })
  .partial()
  .strict()
  .refine((p) => !p.preferences || p.preferences.ageMin <= p.preferences.ageMax, { message: 'ageMin must be <= ageMax', path: ['preferences'] });

export const privacySchema = z
  .object({
    privacy: z.object(Object.fromEntries(PRIVACY_FIELDS.map((f) => [f, z.enum(VISIBILITY)]))).partial().strict(),
    discovery: z.enum(DISCOVERY_MODES),
  })
  .partial()
  .strict();

export const notifPrefsSchema = z
  .object({ matches: z.boolean(), messages: z.boolean(), interests: z.boolean(), reports: z.boolean() })
  .partial()
  .strict();

export const reportSchema = z.object({
  reportedUid: z.string().min(1).max(128),
  category: z.enum(REPORT_CATEGORIES),
  details: cleanText(1000).optional().default(''),
  conversationId: z.string().max(300).optional(),
  includeRecentMessages: z.boolean().optional().default(false),
});

export const labAnswersSchema = z.object({ answers: z.record(z.string().max(20), z.string().max(4)) });

export const universitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  shortName: z.string().trim().min(2).max(12),
  emailDomain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
  verificationMethod: z.enum(['EMAIL_DOMAIN']).default('EMAIL_DOMAIN'),
  active: z.boolean().default(true),
  logo: z.string().url().max(500).startsWith('https://').nullable().optional().default(null),
  departments: z.array(z.string().trim().min(1).max(60)).max(60).optional().default([]),
});

export const weightsSchema = z
  .object({ personality: z.number().min(0), interests: z.number().min(0), lifestyle: z.number().min(0), communication: z.number().min(0), goals: z.number().min(0), preferences: z.number().min(0) })
  .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) > 0, { message: 'weights must not all be zero' });

export const resolveReportSchema = z.object({
  action: z.enum(['DISMISS', 'WARN', 'SUSPEND']),
  note: cleanText(500).optional().default(''),
});

export const suspendSchema = z.object({ reason: cleanText(300).pipe(z.string().min(3)) });
