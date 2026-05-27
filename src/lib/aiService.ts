import { generateText } from 'ai';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { supabase } from './supabase';
import { getApiKeys, getFallbackModels } from './apiKeyManager';

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

    const payloads = students.map((s) => ({
      courseId: course.id,
      regNumber: s.regNumber,
      name: s.name,
    }));

    await supabase.from('students').insert(payloads).select();

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
