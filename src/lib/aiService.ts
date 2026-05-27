import { generateText } from 'ai';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { supabase } from './supabase';

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
 * Get the configured AI model instance
 */
function getAiModel() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  
  if (!apiKey) {
    return google('gemini-1.5-flash');
  }

  const customGoogle = createGoogleGenerativeAI({ apiKey });
  return customGoogle('gemini-1.5-flash');
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
 * Execute natural language commands through AI
 */
export async function executeAiCommand(
  userMessage: string,
  userId: string,
  currentRoute: string
): Promise<string> {
  try {
    const model = getAiModel();

    const result = await generateText({
      model,
      system: `You are the Presensys Autonomous Command Engine for a React PWA managing UNIZIK departmental operations.
User ID: ${userId}, Current Route: ${currentRoute}
You help users manage course schedules, student enrollments, and navigate the application.
Be conversational and helpful. Confirm actions before executing critical operations.`,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const parsedResponse = parseAiCommands(result.text);
    return parsedResponse;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `I encountered an error: ${errorMsg}. Please try again or check if your API key is configured correctly.`;
  }
}

/**
 * Stream AI responses
 */
export async function* streamAiCommand(
  userMessage: string,
  userId: string,
  currentRoute: string
): AsyncGenerator<string> {
  const response = await executeAiCommand(userMessage, userId, currentRoute);
  yield response;
}

// Export utility functions for direct use if needed
export { manageSchedules, controlUI, batchEnrollStudents };
