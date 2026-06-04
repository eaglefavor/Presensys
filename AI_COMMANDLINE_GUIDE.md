# Presensys AI-Command Line (ACL) System

## Overview

The Presensys AI-Command Line system transforms the application into an intelligent command-driven interface. Users can now control the PWA using natural language commands through text or voice, eliminating the need for traditional form-based navigation.

### Architecture

```
User Input (Voice/Text)
    │
    ▼
React Component (AiCommandBar)
    │
    ▼
Vercel AI SDK (generateText)
    │
    ├─► Gemini 1.5 Flash Model
    │
    ├─► Tool Execution:
    │   ├─ Schedule Management
    │   ├─ UI Navigation
    │   ├─ Student Enrollment
    │   └─ MCP Database Tools (if configured)
    │       ├─ list_tables
    │       ├─ describe_table
    │       └─ execute_sql
    │
    └─► Supabase Operations (RLS Protected)
            │
            ├─ courses table
            ├─ lecturers table
            ├─ students table
            ├─ enrollments table (student-course membership)
            └─ course_schedules table (course timeslots)
```

## Setup & Configuration

### 1. Environment Variables

Create a `.env.local` file in the project root with your Gemini API key:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Enable Supabase MCP for direct database operations
VITE_MCP_URL=https://mcp.supabase.com/mcp?project_ref=trhvihhaidboeodffgcj
```

⚠️ **Note:** This is a client-side application (Vite/React PWA). The `VITE_*` prefix means the API key is embedded into the client bundle at build time. Use this only for development or with a server-side proxy for production.

### 2. Dependencies

The following dependencies are already installed:
- `@ai-sdk/google` - Gemini integration
- `ai` - Vercel AI SDK
- `@modelcontextprotocol/sdk` - MCP client library
- `zod` - Schema validation

If you need to reinstall:
```bash
npm install @ai-sdk/google ai @modelcontextprotocol/sdk zod
```

## Components & Architecture

### 1. useUiStore (Global State Management)

**File:** `src/store/useUiStore.ts`

Manages the application's UI state for AI-driven interactions:

```typescript
interface UiState {
  currentView: string;              // Current route
  isBlitzActive: boolean;           // PIN Blitz modal state
  isAiCommandBarVisible: boolean;   // AI command bar visibility
  activeCourseFilter: string | null; // Active course filter
  searchQuery: string;              // Current search query
}
```

**Usage:**
```typescript
const ui = useUiStore();
ui.setNavigation('/courses');       // Navigate to courses
ui.triggerBlitzModal(true);         // Open PIN Blitz
ui.setCourseFilter('TFS 214');      // Filter by course
ui.setAiCommandBarVisibility(true); // Show AI command bar
```

### 2. mcpService (MCP Client Service)

**File:** `src/lib/mcpService.ts`

Handles Model Context Protocol (MCP) client initialization and tool management:

**Main Functions:**
- `getMcpClient()` - Initialize or retrieve existing MCP client
- `listMcpTools()` - List available MCP tools from Supabase
- `executeMcpTool(toolName, args)` - Execute an MCP tool
- `getMcpToolsForAi()` - Convert MCP tools to Vercel AI SDK format
- `checkMcpHealth()` - Verify MCP server connectivity

**Available MCP Tools (when configured):**
1. **list_tables** - View database schema
   - Lists all tables in the connected Supabase database

2. **describe_table** - Inspect table structure
   - Shows column names, types, and constraints

3. **execute_sql** - Run SQL queries
   - Perform direct SQL operations (protected by RLS)

### 3. aiService (AI Backend)

**File:** `src/lib/aiService.ts`

Handles AI command execution with Supabase and MCP integration:

**Main Functions:**
- `executeAiCommand(userMessage, userId, currentRoute)` - Execute natural language commands
- `streamAiCommand(userMessage, userId, currentRoute)` - Stream responses (generator)

**Available Operations:**
1. **Schedule Management** (`manageSchedules`)
   - Create, update, or delete course schedules
   - Assign lecturers to time slots
   - Parse natural time formats (e.g., "11-12", "2-3pm")

2. **UI Navigation** (`controlUI`)
   - Navigate to different routes
   - Filter course lists
   - Open modal dialogs
   - Execute searches

3. **Student Enrollment** (`batchEnrollStudents`)
   - Bulk register students into courses
   - Verify course accessibility
   - Handle duplicate detection via RLS

4. **MCP Database Operations** (when configured)
   - Direct SQL execution via Supabase MCP
   - Schema inspection and discovery
   - Complex queries and bulk operations

**Example:**
```typescript
import { executeAiCommand } from '@/lib/aiService';

const response = await executeAiCommand(
  'Create a schedule for TFS 214 on Monday from 11 to 12 with Dr. Smith',
  userId,
  currentRoute
);
```

### 4. AiCommandBar (UI Component)

**File:** `src/components/AiCommandBar.tsx`

Provides the user interface for AI command input:

**Features:**
- ✅ Text input with command autocomplete suggestions
- ✅ Voice recognition using Web Speech API
- ✅ Command history with timestamps
- ✅ Real-time response streaming
- ✅ Toast notifications for feedback
- ✅ Responsive design for mobile and desktop

**Voice Recognition:**
- Supports Nigerian English accent (`en-NG`)
- Automatic transcript insertion
- Visual feedback during listening

**Quick Actions:**
- Clear command history
- Toggle timestamps
- Pre-filled example commands

## MCP Integration Guide

### Enabling MCP Database Access

When `VITE_MCP_URL` is configured, the AI gains direct database access:

1. **Automatic Tool Discovery**
   - MCP client fetches available tools from Supabase
   - Tools are automatically integrated into AI execution

2. **Security Model**
   - All operations protected by Supabase RLS
   - User authentication token validated for each operation
   - Row-level policies enforced at database level

3. **Graceful Degradation**
   - If MCP is unavailable, commands still execute using standard mode
   - No impact to existing functionality

### Example MCP Commands

```
"List all tables in the database"
"Show me the students table structure"
"Add 50 new students from the import file"
"Create a course schedule for Monday-Friday, 9am-5pm"
"Generate an attendance report for TFS 214"
```

### MCP Architecture in Presensys

```
AI Model (Gemini 1.5 Flash)
        │
        ▼
    mcpService
        │
    ┌────┴────┐
    │          │
    ▼          ▼
  SSETransport MCP Client
    │
    └─► Supabase MCP Server
        │
        └─► PostgreSQL Database
             (with RLS policies)
```

## Usage Examples

### Command Examples

1. **Create a Course Schedule**
   ```
   "Create a schedule for TFS 214 on Monday from 11 to 12 with Dr. Okadigwe"
   ```

2. **Navigate to a Page**
   ```
   "Show me the students page" or "Go to courses"
   ```

3. **Filter Courses**
   ```
   "Filter the view to TFS 214 and show Dr Okadigwe's timeslot"
   ```

4. **Enroll Students**
   ```
   "Enroll John Doe (12345) and Jane Smith (12346) to TFS 214"
   ```

5. **Open PIN Blitz**
   ```
   "Open the PIN Blitz modal" or "Start PIN Blitz"
   ```

6. **Database Queries (MCP-enabled)**
   ```
   "How many students are enrolled in each course?"
   "Show me all attendance records for last week"
   "Add Dr. Nnamdi Okadigwe as the lecturer for TFS 201"
   ```

### Voice Input

1. Click the 🎙️ button in the AI Command Bar
2. Speak your command clearly
3. Wait for recognition to complete (red indicator turns off)
4. The transcribed text will be placed in the input field
5. Press the Send button (→) or press Enter to submit the command

## Integration with Layout

The AI Command Bar is integrated into the main Layout component:

**Location:** `src/components/Layout.tsx`

A lightning bolt (⚡) button in the header toggles the AI Command Bar visibility:
- Click the button to show/hide the command bar
- Button color changes when command bar is active

## Security & Data Protection

### Supabase Row Level Security (RLS)

All database operations respect Supabase RLS policies:

```sql
-- Example RLS Policy
-- Only users with 'admin' or 'rep' role can modify schedules for their department

CREATE POLICY "schedules_update_policy" ON course_schedules
  FOR UPDATE
  USING (
    EXISTS (
     SELECT 1 FROM courses
     WHERE courses.id = course_schedules.course_id
     AND courses.department = auth.jwt() ->> 'department'
    )
  );
```

### MCP Security Considerations

1. **RLS Enforcement** - Even with direct SQL access, Supabase RLS policies prevent unauthorized access
2. **User Authentication** - All MCP operations use the authenticated user's session token
3. **Prompt Injection Protection** - RLS provides hard protection against SQL injection and prompt injection attacks
4. **Audit Trail** - All database operations are logged at the Supabase level

### User Context

All commands maintain user context:
- User ID is passed to AI commands
- Operations are scoped to user's department
- Actions are logged for audit trails

## Error Handling

The system includes comprehensive error handling:

1. **API Key Errors**
   ```
   "I encountered an error: Gemini API key not configured..."
   ```

2. **Database Errors**
   ```
   "Course TFS 214 not found or you don't have permission to access it."
   ```

3. **Validation Errors**
   ```
   "Invalid time format. Use format like '11-12' or '12-2pm'."
   ```

4. **MCP Connection Errors**
   ```
   "Database access unavailable. Please check your MCP configuration."
   ```

5. **Network Errors**
   - Automatic retry with exponential backoff
   - Toast notification for offline status

## Advanced Configuration

### Custom AI Model

To use a different Gemini model, edit `aiService.ts`:

```typescript
function getAiModel() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const customGoogle = createGoogleGenerativeAI({ apiKey });
  return customGoogle('gemini-2-flash'); // Change model here
}
```

### System Prompt Customization

Modify the system prompt in `executeAiCommand()`:

```typescript
system: `You are the Presensys Autonomous Command Engine...
Add custom instructions here for domain-specific behavior.`
```

### Language Support

Change voice recognition language in `AiCommandBar.tsx`:

```typescript
recognition.lang = 'en-US'; // Change to different locale
```

## Performance Considerations

1. **Token Usage**
   - Gemini 1.5 Flash is optimized for cost and speed
   - Each command costs ~500-2000 tokens depending on length

2. **Database Queries**
   - All queries are indexed for fast lookups
   - Batch operations use efficient insert patterns
   - MCP allows for optimized SQL execution

3. **UI Updates**
   - State updates use Zustand for minimal re-renders
   - Message history is virtualized for large lists

## Troubleshooting

### "No Gemini API key configured"

**Solution:**
1. Set `VITE_GEMINI_API_KEY` in `.env.local`
2. Restart the dev server
3. Check that the key is valid in Google AI Studio

### Voice Recognition Not Working

**Solution:**
1. Check browser support (Chrome, Edge recommended)
2. Ensure microphone permissions are granted
3. Verify language code is correct
4. Try refreshing the page

### Commands Not Executing

**Solution:**
1. Check console for error messages
2. Verify user has correct role/permissions
3. Ensure course/lecturer records exist in database
4. Check Supabase RLS policies

### Slow AI Responses

**Solution:**
1. Check network connection
2. Verify Gemini API quota
3. Try using shorter, simpler commands
4. Consider using `gemini-1.5-flash` for faster responses

### MCP Health Check Failed

**Solution:**
1. Verify `VITE_MCP_URL` is correctly configured
2. Check that the Supabase project reference is valid
3. Ensure your network has access to the MCP server
4. Check browser console for detailed error logs

## Future Enhancements

Planned features for future releases:

- [ ] Multi-language support with automatic language detection
- [ ] Custom voice synthesis for feedback
- [ ] Command templates and macros
- [ ] Integration with attendance marking
- [ ] Report generation via natural language
- [ ] Real-time collaboration commands
- [ ] Advanced scheduling with conflict detection
- [ ] Integration with email notifications
- [ ] MCP tool result caching for performance
- [ ] Advanced MCP query optimization

## API Reference

### executeAiCommand

```typescript
async function executeAiCommand(
  userMessage: string,    // Natural language command
  userId: string,         // Current user's ID
  currentRoute: string    // Current page route
): Promise<string>        // AI response text
```

**Example:**
```typescript
const response = await executeAiCommand(
  'Show me all students in TFS 214',
  'user-123',
  '/students'
);
console.log(response); // "Here are all students in TFS 214..."
```

### streamAiCommand

```typescript
async function* streamAiCommand(
  userMessage: string,    // Natural language command
  userId: string,         // Current user's ID
  currentRoute: string    // Current page route
): AsyncGenerator<string> // Streaming response
```

**Example:**
```typescript
for await (const chunk of streamAiCommand(message, userId, route)) {
  console.log(chunk); // Process streaming response
}
```

### getMcpClient

```typescript
async function getMcpClient(): Promise<Client>
```

Returns the connected MCP client instance.

### checkMcpHealth

```typescript
async function checkMcpHealth(): Promise<boolean>
```

Checks if the MCP server is accessible and responsive.

## Support & Documentation

- **GitHub Issues:** Report bugs or request features
- **API Docs:** https://ai.google.dev/docs
- **Supabase Docs:** https://supabase.com/docs
- **Vercel AI SDK:** https://sdk.vercel.ai
- **MCP Documentation:** https://modelcontextprotocol.io

## License

This system is part of the Presensys project and follows the same license terms.

---

**Last Updated:** 2026-06-01
**Version:** 2.0.0 (with MCP Integration)
