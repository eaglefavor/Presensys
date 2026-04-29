import re

with open('src/pages/Attendance.tsx', 'r') as f:
    content = f.read()

# Make sure Trash2 is in the imports
if 'Trash2' not in content:
    content = content.replace('Pencil, Check', 'Pencil, Check, Trash2')

# 1. Add handleDeleteSession
handle_delete_session_code = """
  const handleDeleteSession = async (sessionId: string) => {
    try {
      const session = await db.attendanceSessions.where('serverId').equals(sessionId).first();
      if (session && session.id) {
        await db.attendanceSessions.update(session.id, { isDeleted: 1, synced: 0 });

        // Also soft-delete associated records
        const records = await db.attendanceRecords.where('sessionId').equals(sessionId).toArray();
        if (records.length > 0) {
          const updates = records.map(r => ({ ...r, isDeleted: 1, synced: 0 }));
          await db.attendanceRecords.bulkPut(updates);
        }

        toast.success("Session deleted successfully.");
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setAttendanceMode(null);
        }
      }
    } catch (err) {
      console.error("Session delete error:", err);
      toast.error("Failed to delete session.");
    } finally {
      setDeletingSessionId(null);
    }
  };
"""

if "const handleDeleteSession = async" not in content:
    content = content.replace("const handleRenameSession = async () => {", handle_delete_session_code + "\n  const handleRenameSession = async () => {")

# 1.5 Add setDeletingSessionId state
state_code = "const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);"
if "setDeletingSessionId" not in content:
    content = content.replace("const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);", "const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);\n  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);")

# 2. Add trash icon to View 2
view_2_pencil = """<Pencil size={14} />
                    </button>"""
view_2_trash = """<Pencil size={14} />
                    </button>
                    <button
                      className="btn btn-light btn-sm rounded-circle p-1 border-0 text-danger me-1"
                      style={{ width: 30, height: 30 }}
                      onClick={e => { e.stopPropagation(); setDeletingSessionId(session.serverId); }}
                      title="Delete session"
                    >
                      <Trash2 size={14} />
                    </button>"""
if "Trash2 size={14}" not in content:
    content = content.replace(view_2_pencil, view_2_trash)


# 3. Add trash icon to Marking Mode header
header_pencil = """<Pencil size={12} />
                  </button>"""
header_trash = """<Pencil size={12} />
                  </button>
                  <button
                    className="btn btn-light btn-sm rounded-circle p-1 border-0 text-danger flex-shrink-0"
                    style={{ width: 26, height: 26 }}
                    onClick={() => { if (activeSessionId) setDeletingSessionId(activeSessionId); }}
                    title="Delete session"
                  >
                    <Trash2 size={12} />
                  </button>"""
if "Trash2 size={12}" not in content:
    content = content.replace(header_pencil, header_trash)

# 4. Add ConfirmDialog
confirm_dialog_code = """
      <ConfirmDialog
        open={deletingSessionId !== null}
        title="Delete Session"
        message="Are you sure you want to delete this session? This action can be reversed by an administrator."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deletingSessionId && handleDeleteSession(deletingSessionId)}
        onCancel={() => setDeletingSessionId(null)}
      />
"""

if 'title="Delete Session"' not in content:
    content = content.replace('<ConfirmDialog', confirm_dialog_code + '\n      <ConfirmDialog', 1)

with open('src/pages/Attendance.tsx', 'w') as f:
    f.write(content)
