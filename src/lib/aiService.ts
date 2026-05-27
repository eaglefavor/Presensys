import { generateText } from 'ai';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { supabase } from './supabase';
import { getApiKeys, getFallbackModels } from './apiKeyManager';

// ─── Key Usage Tracking (Session-only) ───────────────────────────────────────
// Track which keys are experiencing issues (in-memory, session-only)
export interface KeyStats {
  fingerprint: string; // First 4 chars of key
  successCount: number;
  failureCount: number;
  lastError?: string;
  lastErrorTime?: number;
  isTemporarilyBanned?: boolean; // Skip for ~5 minutes after 3 consecutive failures
}

const keyStats = new Map<string, KeyStats>();

/**
 * Get or create stats for a key
 */
function getKeyStats(apiKey: string): KeyStats {
  const fingerprint = apiKey.substring(0, 4);
  if (!keyStats.has(fingerprint)) {
    keyStats.set(fingerprint, {
      fingerprint,
      successCount: 0,
      failureCount: 0,
    });
  }
  return keyStats.get(fingerprint)!;
}

/**
 * Record a successful API call
 */
function recordKeySuccess(apiKey: string): void {
  const stats = getKeyStats(apiKey);
  stats.successCount++;
  stats.failureCount = 0; // Reset failure count on success
  stats.isTemporarilyBanned = false;
}

/**
 * Record a failed API call
 */
function recordKeyFailure(apiKey: string, error: string): void {
  const stats = getKeyStats(apiKey);
  stats.failureCount++;
  stats.lastError = error;
  stats.lastErrorTime = Date.now();
  
  // Ban key temporarily after 3 consecutive failures (5 minute cooldown)
  if (stats.failureCount >= 3) {
    stats.isTemporarilyBanned = true;
    console.warn(
      `API key [${stats.fingerprint}...] temporarily banned due to repeated failures. Will retry in ~5 minutes.`
    );
  }
}

/**
 * Check if a key is currently usable
 */
function isKeyUsable(apiKey: string): boolean {
  const stats = getKeyStats(apiKey);
  
  if (!stats.isTemporarilyBanned) {
    return true;
  }
  
  // Check if ban period has expired (5 minutes = 300000ms)
  const timeSinceBan = Date.now() - (stats.lastErrorTime || 0);
  if (timeSinceBan > 300000) {
    stats.isTemporarilyBanned = false;
    stats.failureCount = 0;
    console.log(`API key [${stats.fingerprint}...] ban expired, retrying...`);
    return true;
  }
  
  return false;
}

/**
 * Get key statistics for monitoring/debugging
 */
export function getKeyUsageStats(): Array<KeyStats> {
  return Array.from(keyStats.values());
}

// ─── Type Definitions ─────────────────────────────────────────────────────────
export interface ToolExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  uiAction?: string;
  target?: string;
  clientCommand?: string;
  value?: string;
  data?: unknown;
}

// ─── Utility Functions for Database Operations ─────────────────────────────────

/**
 * Parse time string into start and end times
 * Supports formats like "11-12", "11:00-12:00", "11am-12pm", "2-3pm", etc.
 */
function parseTimeString(timeString: string): { startTime: string; endTime: string } | null {
  const timeRegex = /(\d{1,2})[-:\s]*(\d{2})?\s*(?:pm|am|PM|AM)?\s*[-\s]*(\d{1,2})[-:\s]*(\d{2})?\s*(?:pm|am|PM|AM)?/;
  const match = timeString.match(timeRegex);

  if (!match) {
    return null;
  }

  const startTime = match[1].padStart(2, '0') + ':' + (match[2] || '00');
  const endTime = match[3].padStart(2, '0') + ':' + (match[4] || '00');

  return { startTime, endTime };
}

/**
 * Execute schedule management operations
 */
async function manageSchedules(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  courseCode: string,
  lecturerName?: string,
  dayOfWeek?: string,
  timeString?: string
): Promise<ToolExecutionResult> {
  try {
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, semesterId')
      .eq('code', courseCode)
      .single();

    if (courseError || !course) {
      return {
        success: false,
        error: `Course ${courseCode} not found.`,
      };
    }

    if (action === 'CREATE' || action === 'UPDATE') {
      if (!lecturerName || !dayOfWeek || !timeString) {
        return {
          success: false,
          error: 'Missing required fields for CREATE/UPDATE.',
        };
      }

      const { data: existingLecturer } = await supabase
        .from('lecturers')
        .select('serverId')
        .eq('name', lecturerName)
        .maybeSingle();

      let lecturerId = existingLecturer?.serverId;

      if (!lecturerId) {
        const { data: newLecturer } = await supabase
          .from('lecturers')
          .insert({ name: lecturerName })
          .select('serverId')
          .single();

        lecturerId = newLecturer?.serverId;
      }

      if (!lecturerId) {
        return { success: false, error: 'Failed to resolve lecturer.' };
      }

      const times = parseTimeString(timeString);
      if (!times) {
        return { success: false, error: 'Invalid time format.' };
      }

      if (action === 'CREATE') {
        await supabase.from('course_schedules').insert({
          courseId: course.id,
          lecturerId,
          dayOfWeek,
          startTime: times.startTime,
          endTime: times.endTime,
        });
      } else {
        await supabase
          .from('course_schedules')
          .update({
            dayOfWeek,
            startTime: times.startTime,
            endTime: times.endTime,
          })
          .eq('courseId', course.id)
          .eq('lecturerId', lecturerId);
      }

      return {
        success: true,
        message: `Schedule ${action.toLowerCase()}d for ${courseCode}`,
        uiAction: 'REFRESH_SCHEDULES',
        target: courseCode,
      };
    } else if (action === 'DELETE') {
      await supabase
        .from('course_schedules')
        .update({ isDeleted: 1 })
        .eq('courseId', course.id);

      return {
        success: true,
        message: `Schedule deleted for ${courseCode}`,
        uiAction: 'REFRESH_SCHEDULES',
        target: courseCode,
      };
    }

    return { success: false, error: 'Unknown action.' };
  } catch (error) {
    return {
      success: false,
      error: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Control UI navigation and state
 */
async function controlUI(
  intent: 'NAVIGATE' | 'FILTER_LIST' | 'OPEN_BLITZ_MODAL' | 'SEARCH',
  payload: string
): Promise<ToolExecutionResult> {
  return {
    success: true,
    clientCommand: intent,
    value: payload,
    message: `UI action: ${intent} with "${payload}"`,
  };
}

/**
 * Bulk enroll students
 */
async function batchEnrollStudents(
  courseCode: string,
  students: Array<{ name: string; regNumber: string }>
): Promise<ToolExecutionResult> {
  try {
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('code', courseCode)
      .single();

    if (courseError || !course) {
      return {
        success: false,
        error: `Course ${courseCode} not found.`,
      };
    }

    // Insert students with correct column names (snake_case)
    const studentPayloads = students.map((s) => ({
      reg_number: s.regNumber,
      name: s.name,
    }));

    const { data: insertedStudents, error: studentError } = await supabase
      .from('students')
      .upsert(studentPayloads, { onConflict: 'reg_number' })
      .select('id');

    if (studentError || !insertedStudents) {
      return {
        success: false,
        error: `Error enrolling students: ${studentError?.message || 'Unknown error'}`,
      };
    }

    // Create enrollment records to link students to course
    const enrollmentPayloads = insertedStudents.map((student) => ({
      student_id: student.id,
      course_id: course.id,
    }));

    const { error: enrollmentError } = await supabase
      .from('enrollments')
      .upsert(enrollmentPayloads, { onConflict: 'student_id,course_id' })
      .select();

    if (enrollmentError) {
      return {
        success: false,
        error: `Error creating enrollments: ${enrollmentError.message}`,
      };
    }

    return {
      success: true,
      message: `Enrolled ${students.length} students into ${courseCode}`,
      data: { enrolled: students.length, course: courseCode },
      uiAction: 'REFRESH_ENROLLMENTS',
    };
  } catch (error) {
    return {
      success: false,
      error: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── AI Service Configuration ─────────────────────────────────────────────────

/**
 * Execute generateText with a single key/model combination
 * Returns null if failed, otherwise returns the text result
 */
async function tryGenerateWithModel(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string | null> {
  try {
    const customGoogle = createGoogleGenerativeAI({ apiKey });
    const modelInstance = customGoogle(model);

    const result = await generateText({
      model: modelInstance,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    return result.text;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.warn(
      `Failed to generate text with model ${model} using key [${apiKey.substring(0, 4)}...]: ${errorMsg}`
    );
    return null;
  }
}

/**
 * Get the configured AI model instance with multi-key fallback support
 * Tries each API key with a queue of fallback models
 * 
 * @deprecated Use executeAiCommand instead, which has proper fallback at API call level
 */
async function getAiModelWithFallback() {
  const apiKeys = getApiKeys();
  const modelQueue = getFallbackModels();

  let lastError: Error | null = null;

  // Try each API key
  for (const apiKey of apiKeys) {
    // Try each model in the fallback queue for this key
    for (const model of modelQueue) {
      try {
        const customGoogle = createGoogleGenerativeAI({ apiKey });
        const modelInstance = customGoogle(model);
        return modelInstance;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(
          `Failed to initialize AI model ${model} with key [${apiKey.substring(0, 4)}...]: ${lastError.message}`
        );
        // Continue to next model/key
      }
    }
  }

  // If all keys and models failed, return a default instance
  // (the actual request will fail, but this maintains API compatibility)
  if (lastError) {
    console.error('All API keys and models exhausted. Using default fallback.');
  }

  return google('gemini-1.5-flash');
}

/**
 * Parse AI response to extract and execute commands
 * Looks for patterns like [SCHEDULE:CREATE:TFS214:...] or [UI:NAVIGATE:/courses]
 */
function parseAiCommands(text: string): string {
  // For now, just return the text as-is
  // In future, this could parse command patterns from AI responses
  return text;
}

/**
 * Execute natural language commands through AI with multi-key and multi-model fallback
 * Tries each API key with each model in the fallback queue until one succeeds
 * Includes optional session-level key usage tracking for improved fallback efficiency
 */
export async function executeAiCommand(
  userMessage: string,
  userId: string,
  currentRoute: string
): Promise<string> {
  try {
    const apiKeys = getApiKeys();
    const modelQueue = getFallbackModels();

    const systemPrompt = `You are the Presensys Autonomous Command Engine for a React PWA managing UNIZIK departmental operations.
User ID: ${userId}, Current Route: ${currentRoute}
You help users manage course schedules, student enrollments, and navigate the application.
Be conversational and helpful. Confirm actions before executing critical operations.`;

    let lastError: Error | null = null;
    let responseText: string | null = null;

    // Try each API key
    for (const apiKey of apiKeys) {
      // Skip keys that are temporarily banned (after repeated failures)
      if (!isKeyUsable(apiKey)) {
        continue;
      }

      let keySucceeded = false;

      // Try each model in the fallback queue for this key
      for (const model of modelQueue) {
        responseText = await tryGenerateWithModel(
          apiKey,
          model,
          systemPrompt,
          userMessage
        );

        if (responseText !== null) {
          // Success! We got a response from this key/model combination
          recordKeySuccess(apiKey);
          console.log(
            `AI command executed successfully with model ${model} using key [${apiKey.substring(0, 4)}...]`
          );
          keySucceeded = true;
          break;
        }
      }

      // If this key succeeded on any model, we're done
      if (keySucceeded) {
        break;
      } else {
        recordKeyFailure(apiKey, 'All models exhausted for this key');
        console.warn(
          `All models failed for API key [${apiKey.substring(0, 4)}...]. Trying next key...`
        );
      }
    }

    // If we got a response, return it
    if (responseText !== null) {
      const parsedResponse = parseAiCommands(responseText);
      return parsedResponse;
    }

    // If all keys and models failed
    const errorMessage =
      'All available API keys and models failed. Please try again or check if your API keys are configured correctly.';
    console.error(errorMessage);
    return `I encountered an error: ${errorMessage}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Unexpected error in executeAiCommand:', errorMsg);
    return `I encountered an unexpected error: ${errorMsg}. Please try again.`;
  }
}

/**
 * Stream AI responses with multi-key and multi-model fallback
 */
export async function* streamAiCommand(
  userMessage: string,
  userId: string,
  currentRoute: string
): AsyncGenerator<string> {
  // For now, we execute the command and yield the result
  // In the future, this could be enhanced to stream token-by-token
  const response = await executeAiCommand(userMessage, userId, currentRoute);
  yield response;
}

// Export utility functions for direct use if needed
export { manageSchedules, controlUI, batchEnrollStudents };
